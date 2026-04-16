#!/usr/bin/env python3
# =============================================================
# verify_mongodb.py
# Run this anytime to check what is stored in your database
#
# Usage:
#   python3 verify_mongodb.py
#
# Shows:
#   - MongoDB connection status
#   - Count of documents in each collection
#   - Latest realtime_monitoring document (Schema 1)
#   - Latest test_sessions document (Schema 2)
#   - All test sessions for your phone number
# =============================================================

from pymongo import MongoClient, DESCENDING
from datetime import datetime
import json

# ── Pretty print helper ──────────────────────────────────────
def pretty(doc):
    """Print a MongoDB document in readable format."""
    if doc is None:
        print("  (no document found)")
        return
    # Convert ObjectId and datetime to readable strings
    doc["_id"] = str(doc["_id"])
    for key in ["createdAt", "updatedAt", "testedAt"]:
        if key in doc and hasattr(doc[key], "isoformat"):
            doc[key] = doc[key].isoformat()
    print(json.dumps(doc, indent=4, default=str))

# ── Connect ──────────────────────────────────────────────────
print("\n" + "="*60)
print("  AquaPredict — MongoDB Data Verification")
print("="*60)

try:
    client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)
    client.server_info()   # will throw if MongoDB is not running
    print("\n✅  MongoDB is RUNNING and reachable\n")
except Exception as e:
    print(f"\n❌  Cannot connect to MongoDB: {e}")
    print("\n  Fix: Open a terminal and run:")
    print("       mongod --dbpath /data/db --wiredTigerCacheSizeGB 0.25\n")
    exit(1)

db           = client["aquapredict"]
realtime_col = db["realtime_monitoring"]
test_col     = db["test_sessions"]

# ── Collection counts ────────────────────────────────────────
rt_count   = realtime_col.count_documents({})
test_count = test_col.count_documents({})

print("─"*60)
print("  DATABASE SUMMARY")
print("─"*60)
print(f"  Collection: realtime_monitoring  →  {rt_count} document(s)")
print(f"  Collection: test_sessions        →  {test_count} document(s)")

if rt_count == 0 and test_count == 0:
    print("\n  ⚠️  Database is empty.")
    print("  → Make sure main_pipeline.py is running")
    print("  → Or run:  python3 setup_mongodb.py  to insert sample data\n")
    exit(0)

# ── Latest realtime_monitoring document ─────────────────────
print("\n" + "─"*60)
print("  LATEST REALTIME MONITORING DOCUMENT (Schema 1)")
print("─"*60)
latest_rt = realtime_col.find_one(sort=[("createdAt", DESCENDING)])
pretty(latest_rt)

# ── Latest test_sessions document ───────────────────────────
print("\n" + "─"*60)
print("  LATEST TEST SESSION DOCUMENT (Schema 2)")
print("─"*60)
latest_test = test_col.find_one(sort=[("testedAt", DESCENDING)])
pretty(latest_test)

# ── All realtime documents (last 5) ─────────────────────────
print("\n" + "─"*60)
print("  LAST 5 REALTIME READINGS — Quick View")
print("─"*60)
print(f"  {'No.':<5} {'pH':<8} {'DO':<8} {'Temp':<8} {'NH3':<8} {'Turbidity':<12} {'Species':<30} {'Time'}")
print(f"  {'─'*4} {'─'*7} {'─'*7} {'─'*7} {'─'*7} {'─'*11} {'─'*29} {'─'*20}")

recent = list(realtime_col.find().sort("createdAt", DESCENDING).limit(5))
for doc in recent:
    wp      = doc.get("waterParameters", {})
    fp      = doc.get("fishPrediction",  {})
    species = ", ".join((fp.get("predictedSpecies") or [])[:2])
    if len(fp.get("predictedSpecies") or []) > 2:
        species += "..."
    ts = doc.get("createdAt")
    ts_str = ts.strftime("%Y-%m-%d %H:%M:%S") if hasattr(ts, "strftime") else str(ts)
    print(f"  {doc.get('testNumber','?'):<5} "
          f"{wp.get('ph','?'):<8} "
          f"{wp.get('dissolvedOxygen','?'):<8} "
          f"{wp.get('temperature','?'):<8} "
          f"{wp.get('ammonia','?'):<8} "
          f"{wp.get('turbidity','?'):<12} "
          f"{species:<30} "
          f"{ts_str}")

# ── All test sessions ────────────────────────────────────────
if test_count > 0:
    print("\n" + "─"*60)
    print("  ALL TEST SESSIONS")
    print("─"*60)
    all_tests = list(test_col.find().sort("testedAt", DESCENDING))
    for i, doc in enumerate(all_tests, 1):
        pred   = doc.get("prediction", {})
        ts     = doc.get("testedAt")
        ts_str = ts.strftime("%Y-%m-%d %H:%M:%S") if hasattr(ts, "strftime") else str(ts)
        species = ", ".join(pred.get("predictedSpecies") or [])
        print(f"\n  [{i}] {doc.get('sessionName', 'Unnamed')}")
        print(f"      Phone    : {doc.get('phoneId', '?')}")
        print(f"      Time     : {ts_str}")
        print(f"      Species  : {species or 'none'}")
        print(f"      System   : {pred.get('cultureSystem','?')}  |  "
              f"Priority: {pred.get('priority','?')}  |  "
              f"Status: {pred.get('status','?')}")

print("\n" + "="*60)
print("  Verification Complete")
print("="*60 + "\n")

client.close()
