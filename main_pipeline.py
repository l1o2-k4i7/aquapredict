#!/usr/bin/env python3
# =============================================================
# pipeline1_manual.py  —  Pipeline 1: Manual Ammonia Input
#
# Use when: you are sitting at the Jetson with a keyboard.
# After each ESP32 reading you type the ammonia value.
# Press T to save a named Test Session to MongoDB.
# Press Ctrl+C to stop.
# =============================================================

import serial
import json
import time
import sys
import os
from datetime import datetime, timezone
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1 import predict_document

# =============================================================
# CONFIGURATION  ← Edit these values
# =============================================================
SERIAL_PORT   = "/dev/ttyUSB0"    # run: ls /dev/tty*  to find yours
BAUD_RATE     = 115200
PHONE_ID      = "919876543210"    # your country code + phone number
PROJECT_TITLE = "Pond A – Water Quality Trial"
MONGO_URI     = "mongodb://localhost:27017"
DB_NAME       = "aquapredict"
# =============================================================

# ── MongoDB ──────────────────────────────────────────────────
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=4000)
    client.server_info()
    db           = client[DB_NAME]
    realtime_col = db["realtime_monitoring"]
    test_col     = db["test_sessions"]
    print("[MongoDB] Connected ✅")
except Exception as e:
    print(f"[MongoDB] ❌ Cannot connect: {e}")
    print("  Fix: mongod --dbpath /data/db --wiredTigerCacheSizeGB 0.25")
    sys.exit(1)

# ── Serial port ───────────────────────────────────────────────
try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=5)
    print(f"[Serial] Port {SERIAL_PORT} open ✅")
except Exception as e:
    print(f"[Serial] ❌ Cannot open port: {e}")
    print("  Fix: check port with   ls /dev/tty*")
    sys.exit(1)

# ── Helpers ───────────────────────────────────────────────────
def next_test_number():
    last = realtime_col.find_one(sort=[("testNumber", -1)])
    if last and "testNumber" in last and last["testNumber"] >= 1:
        return last["testNumber"] + 1
    return 1

def clean_line(raw):
    """Strip ESP32 debug prefixes and invisible characters."""
    line = raw.decode("utf-8", errors="ignore").strip()
    for prefix in ["Received: ", "received: ", "Data: ", "data: "]:
        if line.startswith(prefix):
            line = line[len(prefix):]
            break
    return line.strip('\x00').strip('\r').strip('\xef\xbb\xbf')

def get_ammonia_input():
    """Ask operator to type ammonia. Keeps asking until valid float."""
    while True:
        try:
            val = input("\n[INPUT] Enter Ammonia (mg/L) → ").strip()
            v = float(val)
            if v < 0:
                print("  ⚠  Cannot be negative. Try again.")
                continue
            return v
        except ValueError:
            print("  ⚠  Type a number e.g. 0.2")

def save_realtime(water, pred, test_num):
    now = datetime.now(timezone.utc)
    doc = {
        "testNumber"   : test_num,
        "projectTitle" : PROJECT_TITLE,
        "status"       : "Completed",
        "waterParameters": {
            "dissolvedOxygen" : water["dissolvedOxygen"],
            "ph"              : water["ph"],
            "temperature"     : water["temperature"],
            "ammonia"         : water["ammonia"],
            "turbidity"       : water["turbidity"]
        },
        "fishPrediction": {
            "predictedSpecies" : pred["fishPrediction"]["predictedSpecies"],
            "removedPredators" : pred["fishPrediction"]["removedPredators"],
            "groupedSpecies"   : pred["fishPrediction"]["groupedSpecies"]
        },
        "stackingData": {
            "cultureSystem" : pred["stackingData"]["cultureSystem"],
            "priority"      : pred["stackingData"]["priority"],
            "status"        : pred["stackingData"]["status"],
            "stockingRatio" : pred["stockingRatio"]
        },
        "__v": 0, "createdAt": now, "updatedAt": now
    }
    result = realtime_col.insert_one(doc)
    print(f"[MongoDB] ✅ Realtime saved — Test#{test_num}  ID:{result.inserted_id}")

def save_test_session(water, pred, name):
    now   = datetime.now(timezone.utc)
    count = test_col.count_documents({"phoneId": PHONE_ID})
    doc   = {
        "phoneId"     : PHONE_ID,
        "sessionName" : name,
        "testIndex"   : count + 1,
        "testedAt"    : now,
        "waterParameters": {
            "dissolvedOxygen" : water["dissolvedOxygen"],
            "ph"              : water["ph"],
            "temperature"     : water["temperature"],
            "ammonia"         : water["ammonia"],
            "turbidity"       : water["turbidity"]
        },
        "prediction": {
            "predictedSpecies" : pred["fishPrediction"]["predictedSpecies"],
            "removedPredators" : pred["fishPrediction"]["removedPredators"],
            "groupedSpecies"   : pred["fishPrediction"]["groupedSpecies"],
            "cultureSystem"    : pred["stackingData"]["cultureSystem"],
            "priority"         : pred["stackingData"]["priority"],
            "status"           : pred["stackingData"]["status"],
            "stockingRatio"    : pred["stockingRatio"]
        },
        "createdAt": now, "updatedAt": now
    }
    result = test_col.insert_one(doc)
    print(f"[MongoDB] ✅ Test session saved — ID:{result.inserted_id}")

# ── Skip words that are ESP32 debug lines ─────────────────────
DEBUG_WORDS = ["rx ", "tx ", "starting", "ready", "from mac", "my mac",
               "size error", "send status", "esp-now", "wifi", "peer", "init",
               "receiver", "sender"]

# ── Banner ────────────────────────────────────────────────────
print("\n" + "="*56)
print("  AquaPredict — Pipeline 1  (Manual Ammonia Mode)")
print("  Waiting for data from ESP32-RX...")
print("  After each reading → type Ammonia value")
print("  After saving → press T to log a Test Session")
print("  Press Ctrl+C to stop")
print("="*56 + "\n")

# ── Main loop ─────────────────────────────────────────────────
while True:
    try:
        raw = ser.readline()
        if not raw:
            continue

        line = clean_line(raw)
        if not line:
            continue

        # Skip non-JSON lines silently
        if not line.startswith("{"):
            low = line.lower()
            if not any(low.startswith(d) for d in DEBUG_WORDS):
                print(f"[Serial] (skipped): {line[:70]}")
            continue

        # Parse JSON
        try:
            data = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"[Serial] ⚠ JSON error: {e}  raw: {line[:60]}")
            continue

        # Extract sensor values
        try:
            water = {
                "ph"              : float(data.get("ph",        0)),
                "temperature"     : float(data.get("temp",      0)),
                "turbidity"       : float(data.get("turbidity", 0)),
                "dissolvedOxygen" : float(data.get("do",        0)),
                "ammonia"         : 0.0
            }
        except (ValueError, TypeError) as e:
            print(f"[Serial] ⚠ Bad value: {e}")
            continue

        print(f"\n[ESP32] pH={water['ph']}  Temp={water['temperature']}°C  "
              f"Turbidity={water['turbidity']} NTU  DO={water['dissolvedOxygen']} mg/L")

        # Get ammonia from operator
        water["ammonia"] = get_ammonia_input()
        print(f"  Ammonia = {water['ammonia']} mg/L")

        # Predict
        print("[Predict] Running ML model...")
        test_num = next_test_number()
        pred = predict_document(
            water_data   = water,
            projectTitle = PROJECT_TITLE,
            testNumber   = test_num
        )
        species = pred["fishPrediction"]["predictedSpecies"]
        removed = pred["fishPrediction"]["removedPredators"]
        system  = pred["stackingData"]["cultureSystem"]
        print(f"[Predict] ✅ Species : {species}")
        if removed:
            print(f"[Predict] ⚠  Removed: {removed}")
        print(f"[Predict]    System  : {system}")

        # Save realtime (always)
        save_realtime(water, pred, test_num)

        # Optionally save test session
        print("\n  Press T + Enter to save as Test Session, or just Enter to skip:")
        choice = input("  → ").strip().upper()
        if choice == "T":
            name = input("  Session name (Enter for default) → ").strip()
            if not name:
                name = f"Test {test_num} — {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            save_test_session(water, pred, name)

        print("\n[Pipeline 1] Waiting for next reading...\n")

    except KeyboardInterrupt:
        print("\n[Pipeline 1] Stopped. Goodbye!")
        ser.close()
        client.close()
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] {e}")
        time.sleep(2)
