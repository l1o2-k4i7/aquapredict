#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
AquaPredict — Pipeline 1 (Manual Terminal Ammonia Input)
FILE: ~/aquapredict/pipeline1_manual.py

USE WHEN:
  Operator is physically present at Jetson Nano with a keyboard.
  Ammonia is typed in the terminal after each sensor reading.

FLOW:
  ESP32-RX  →  USB Serial  →  parse_line()
      ↓
  Display 4 sensor values
      ↓
  Prompt: "Enter ammonia (mg/L):"  ← operator types value
      ↓
  predict_document()  →  MongoDB (realtime_monitoring + test_sessions)

KEY REMAPPING (TX sends → p1.py expects):
  "do"         → "dissolvedOxygen"
  "temp"       → "temperature"
  "ph"         → "ph"            (unchanged)
  "turbidity"  → "turbidity"     (unchanged)
  ammonia      → entered by operator

p1.py  /  esp32_tx.ino  /  esp32_rx.ino  ← NOT MODIFIED
================================================================
"""

import serial
import json
import time
import sys
import logging
import os
from datetime import datetime, timezone
from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1 import predict_document

# ── Logging ──────────────────────────────────────────────────────
os.makedirs(os.path.expanduser("~/aquapredict/logs"), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-5s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.expanduser("~/aquapredict/logs/pipeline1.log"))
    ]
)
log = logging.getLogger("pipeline1")

# ================================================================
# CONFIGURATION
# ================================================================
SERIAL_PORT   = "/dev/ttyUSB0"        # ← change if needed: ls /dev/ttyUSB*
BAUD_RATE     = 115200
MONGO_URI     = "mongodb://localhost:27017/"
DATABASE_NAME = "aquapredict"
PHONE_ID      = "919876543210"        # ← your phone number
PROJECT_TITLE = "Pond A – Water Quality Trial"

# ================================================================
# MongoDB
# ================================================================
def connect_mongodb():
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.server_info()
        log.info("MongoDB connected ✅")
        return client[DATABASE_NAME]
    except ServerSelectionTimeoutError:
        log.error("MongoDB not reachable. Start it: mongod --dbpath /data/db --wiredTigerCacheSizeGB 0.25")
        sys.exit(1)

# ================================================================
# Serial
# ================================================================
def open_serial():
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
        log.info(f"Serial connected: {SERIAL_PORT} @ {BAUD_RATE}")
        return ser
    except serial.SerialException as e:
        log.error(f"Serial error: {e}")
        log.error("Run: ls /dev/ttyUSB*  or  ls /dev/ttyACM*")
        sys.exit(1)

# ================================================================
# parse_line()
#
# Your RX (unchanged) prints these lines:
#   "Received: {"ph":7.2,"temp":28.5,"turbidity":30,"do":6}"  ← WANT
#   "From MAC: 38:18:2B:8B:59:48"                              ← SKIP
#   "Receiver Ready ✅"                                         ← SKIP
#   "RX Starting..."                                            ← SKIP
#   "Size Error: NN"                                            ← SKIP
#
# FIX for "not valid JSON - skipping":
#   Strip "Received: " prefix before parsing.
#   Skip any line that doesn't start with "{" after stripping.
#
# Returns partial dict (4 keys, no ammonia) or None.
# ================================================================
def parse_line(line):
    try:
        line = line.strip()
        if not line:
            return None

        # Strip "Received: " prefix (your RX prints this)
        if "Received:" in line:
            idx = line.index("Received:") + len("Received:")
            line = line[idx:].strip()

        # Skip all non-JSON lines
        if not line.startswith("{"):
            return None

        # Remove trailing garbage after closing brace (e.g. BOM, null bytes)
        brace_end = line.rfind("}")
        if brace_end == -1:
            return None
        line = line[:brace_end + 1]

        raw = json.loads(line)

        # Validate required TX keys
        for key in ["ph", "do", "temp", "turbidity"]:
            if key not in raw:
                log.warning(f"Missing key '{key}' in: {line}")
                return None

        # Remap TX keys → p1.py water_data keys
        return {
            "ph"             : float(raw["ph"]),
            "dissolvedOxygen": float(raw["do"]),
            "temperature"    : float(raw["temp"]),
            "turbidity"      : float(raw["turbidity"]),
        }

    except (json.JSONDecodeError, ValueError, TypeError) as e:
        # Only log if line looked like it could be JSON
        if line.startswith("{"):
            log.debug(f"JSON parse failed: {e} | line: {line[:80]}")
        return None

# ================================================================
# get_ammonia_input() — operator types value in terminal
# ================================================================
def get_ammonia_input():
    print("\n" + "─" * 52)
    print("  AMMONIA INPUT REQUIRED")
    print("  Read from handheld ammonia meter and enter below.")
    print("─" * 52)
    while True:
        try:
            raw = input("  Ammonia (mg/L) [0.00 – 5.00, Enter=0.00]: ").strip()
            if raw == "":
                print("  Using default: 0.00 mg/L")
                return 0.0
            val = float(raw)
            if not 0.0 <= val <= 5.0:
                print(f"  ⚠️  Out of range. Enter 0.00 – 5.00")
                continue
            print(f"  Accepted: {val:.3f} mg/L ✓")
            return val
        except ValueError:
            print("  ⚠️  Not a number. Example: 0.3")

# ================================================================
# build_test_doc — Schema 2
# ================================================================
def build_test_doc(p1_doc, phone_id, test_index):
    return {
        "phoneId"    : phone_id,
        "sessionName": f"Test_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "testIndex"  : test_index,
        "testedAt"   : datetime.now(timezone.utc),
        "waterParameters": p1_doc["waterParameters"],
        "prediction" : {
            "predictedSpecies": p1_doc["fishPrediction"]["predictedSpecies"],
            "cultureSystem"   : p1_doc["stackingData"]["cultureSystem"],
            "priority"        : p1_doc["stackingData"]["priority"],
            "status"          : p1_doc["stackingData"]["status"],
            "stockingRatio"   : p1_doc["stockingRatio"]
        },
        "createdAt"  : datetime.now(timezone.utc)
    }

# ================================================================
# MAIN
# ================================================================
def main():
    print("\n" + "═" * 52)
    print("  AquaPredict — Pipeline 1 (Manual Ammonia)")
    print("═" * 52)

    db           = connect_mongodb()
    ser          = open_serial()
    rt_col       = db["realtime_monitoring"]
    test_col     = db["test_sessions"]
    rt_stream    = db["realtime_stream"]   # Schema: timestamp,ph,do,turbidity,temperature

    test_number  = rt_col.count_documents({}) + 1

    log.info(f"Listening on {SERIAL_PORT} — Ctrl+C to stop")

    while True:
        try:
            raw_line = ser.readline().decode("utf-8", errors="ignore")
            sensor   = parse_line(raw_line)

            if sensor is None:
                continue

            # Save raw realtime stream (lightweight, no prediction)
            rt_stream.insert_one({
                "timestamp"      : datetime.now(timezone.utc),
                "ph"             : sensor["ph"],
                "do"             : sensor["dissolvedOxygen"],
                "turbidity"      : sensor["turbidity"],
                "temperature"    : sensor["temperature"]
            })

            print(f"\n{'═'*52}")
            print(f"  📡  READING #{test_number}")
            print(f"{'═'*52}")
            print(f"  pH          : {sensor['ph']}")
            print(f"  Dissolved O₂: {sensor['dissolvedOxygen']} mg/L")
            print(f"  Temperature : {sensor['temperature']} °C")
            print(f"  Turbidity   : {sensor['turbidity']} NTU")

            ammonia = get_ammonia_input()

            water_data = {**sensor, "ammonia": ammonia}

            log.info(f"Running prediction — test #{test_number}")
            p1_doc = predict_document(
                water_data   = water_data,
                projectTitle = PROJECT_TITLE,
                testNumber   = test_number
            )

            # Merge stockingRatio into stackingData for exact schema match
            now = datetime.now(timezone.utc)
            mongo_doc = {
                "testNumber"  : p1_doc["testNumber"],
                "projectTitle": p1_doc["projectTitle"],
                "status"      : p1_doc["status"],
                "waterParameters": p1_doc["waterParameters"],
                "fishPrediction" : p1_doc["fishPrediction"],
                "stackingData"   : {
                    **p1_doc["stackingData"],
                    "stockingRatio": p1_doc["stockingRatio"]
                },
                "__v"      : 0,
                "createdAt": now,
                "updatedAt": now
            }

            r1 = rt_col.insert_one(mongo_doc)
            r2 = test_col.insert_one(build_test_doc(p1_doc, PHONE_ID, test_number))

            print(f"\n{'─'*52}")
            print(f"  Species  : {p1_doc['fishPrediction']['predictedSpecies']}")
            print(f"  System   : {p1_doc['stackingData']['cultureSystem']} | {p1_doc['stackingData']['priority']} | {p1_doc['stackingData']['status']}")
            print(f"  Saved    : realtime={r1.inserted_id}")
            print(f"             test    ={r2.inserted_id}")
            print(f"{'─'*52}")

            test_number += 1

        except KeyboardInterrupt:
            log.info("Pipeline stopped.")
            ser.close()
            sys.exit(0)
        except ServerSelectionTimeoutError:
            log.error("MongoDB connection lost. Retrying in 5s...")
            time.sleep(5)
        except Exception as e:
            log.error(f"Error: {e}", exc_info=True)
            time.sleep(1)

if __name__ == "__main__":
    main()
