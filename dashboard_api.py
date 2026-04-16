#!/usr/bin/env python3
# =============================================================
# dashboard_api.py  —  Flask REST API for the web dashboard
#
# Runs on Jetson Nano, port 5000.
# Open dashboard at:  http://<JETSON_IP>:5000
# =============================================================

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient, DESCENDING
from datetime import datetime
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app      = Flask(__name__, static_folder=os.path.join(BASE_DIR, "web_dashboard"))
CORS(app)

# ── MongoDB ──────────────────────────────────────────────────
try:
    client = MongoClient("mongodb://localhost:27017",
                         serverSelectionTimeoutMS=4000)
    client.server_info()
    db           = client["aquapredict"]
    realtime_col = db["realtime_monitoring"]
    test_col     = db["test_sessions"]
    print("[MongoDB] Connected ✅")
except Exception as e:
    print(f"[MongoDB] ❌ Cannot connect: {e}")
    print("  Fix: mongod --dbpath /data/db --wiredTigerCacheSizeGB 0.25")
    sys.exit(1)

# ── Helper ───────────────────────────────────────────────────
def clean(doc):
    """Make MongoDB document JSON-serialisable."""
    doc["_id"] = str(doc["_id"])
    for f in ("createdAt", "updatedAt", "testedAt"):
        if f in doc and hasattr(doc[f], "isoformat"):
            doc[f] = doc[f].isoformat()
    return doc

# ── Serve dashboard HTML ──────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(
        os.path.join(BASE_DIR, "web_dashboard"), "index.html"
    )

# ── API: health check ─────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat()})

# ── API: summary stats ────────────────────────────────────────
@app.route("/api/stats")
def stats():
    total_rt   = realtime_col.count_documents({})
    total_test = test_col.count_documents({})
    latest     = realtime_col.find_one(sort=[("createdAt", DESCENDING)])
    species    = []
    last_time  = None
    if latest:
        species   = (latest.get("fishPrediction") or {}).get("predictedSpecies", [])
        ts        = latest.get("createdAt")
        last_time = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
    return jsonify({
        "totalReadings" : total_rt,
        "totalTests"    : total_test,
        "latestSpecies" : species,
        "lastUpdated"   : last_time
    })

# ── API: latest realtime reading ──────────────────────────────
@app.route("/api/realtime/latest")
def latest():
    doc = realtime_col.find_one(sort=[("createdAt", DESCENDING)])
    if not doc:
        return jsonify({"error": "No data yet"}), 404
    return jsonify(clean(doc))

# ── API: realtime history ─────────────────────────────────────
@app.route("/api/realtime")
def realtime():
    limit = min(int(request.args.get("limit", 20)), 100)
    docs  = list(realtime_col.find().sort("createdAt", DESCENDING).limit(limit))
    return jsonify([clean(d) for d in docs])

# ── API: test sessions for a phone ───────────────────────────
@app.route("/api/tests/<phone_id>")
def tests_by_phone(phone_id):
    docs = list(
        test_col.find({"phoneId": phone_id})
        .sort("testedAt", DESCENDING)
    )
    return jsonify([clean(d) for d in docs])

# ── API: all test sessions (default phone) ────────────────────
@app.route("/api/tests")
def tests():
    phone = request.args.get("phone", "919876543210")
    docs  = list(
        test_col.find({"phoneId": phone})
        .sort("testedAt", DESCENDING)
    )
    return jsonify([clean(d) for d in docs])

# ── API: update ammonia value (used by dashboard ammonia form) ─
@app.route("/api/ammonia", methods=["POST"])
def set_ammonia():
    data = request.get_json(force=True)
    val  = data.get("value")
    try:
        v = float(val)
        if v < 0:
            return jsonify({"error": "Ammonia cannot be negative"}), 400
        ammonia_file = os.path.join(BASE_DIR, "ammonia.txt")
        with open(ammonia_file, "w") as f:
            f.write(str(v))
        return jsonify({"success": True, "value": v})
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid value"}), 400

# ── API: get current ammonia from file ────────────────────────
@app.route("/api/ammonia", methods=["GET"])
def get_ammonia():
    ammonia_file = os.path.join(BASE_DIR, "ammonia.txt")
    if os.path.isfile(ammonia_file):
        try:
            with open(ammonia_file) as f:
                v = float(f.read().strip())
            return jsonify({"value": v})
        except Exception:
            pass
    return jsonify({"value": 0.2, "note": "default — ammonia.txt not found"})

# ── Start ─────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n" + "="*50)
    print("  AquaPredict Dashboard API")
    print("  Listening on http://0.0.0.0:5000")
    print("  Dashboard: http://<JETSON_IP>:5000")
    print("  Find IP:   hostname -I")
    print("="*50 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
