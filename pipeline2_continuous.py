#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
AquaPredict — Pipeline 2 (Web-Driven Ammonia, Continuous)
FILE: ~/aquapredict/pipeline2_continuous.py

USE WHEN:
  - Jetson is running headless (no keyboard/monitor)
  - Ammonia is entered through the web dashboard by the user
  - System runs 24/7 unattended

HOW AMMONIA IS PASSED FROM WEB TO THIS PIPELINE:
  1. User signs in on web dashboard
  2. User creates a Test → enters ammonia on the web form
  3. Node.js server writes ammonia to:  ~/aquapredict/ammonia.txt
     Format:  {"ammonia": 0.3, "userId": "abc123", "testName": "Pond A Morning"}
  4. This pipeline reads that file when the next sensor reading arrives
  5. After prediction is saved, ammonia.txt is consumed (cleared)

FLOW:
  ESP32-RX → USB Serial → parse_line()
      ↓
  Read ammonia.txt  (waits until file exists and is non-empty)
      ↓
  predict_document()  →  MongoDB realtime_monitoring + test_sessions

p1.py / esp32_tx.ino / esp32_rx.ino — NOT MODIFIED
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
        logging.FileHandler(os.path.expanduser("~/aquapredict/logs/pipeline2.log"))
    ]
)
log = logging.getLogger("pipeline2")

# ================================================================
# CONFIGURATION
# ================================================================
SERIAL_PORT    = "/dev/ttyUSB0"       # ← change if needed: ls /dev/ttyUSB*
BAUD_RATE      = 115200
MONGO_URI      = "mongodb://localhost:27017/"
DATABASE_NAME  = "aquapredict"
AMMONIA_FILE   = os.path.expanduser("~/aquapredict/ammonia.txt")
PROJECT_TITLE  = "Pond A – Water Quality Trial"

# How long to wait for ammonia.txt before using default (seconds)
AMMONIA_WAIT_TIMEOUT = 300   # 5 minutes

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
        log.error("MongoDB not reachable.")
        log.error("Start: mongod --dbpath /data/db --wiredTigerCacheSizeGB 0.25")
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
        sys.exit(1)

# ================================================================
# parse_line() — same fix as pipeline1
# Handles: "Received: {json}" prefix from unchanged RX code
# ================================================================
def parse_line(line):
    try:
        line = line.strip()
        if not line:
            return None

        if "Received:" in line:
            idx = line.index("Received:") + len("Received:")
            line = line[idx:].strip()

        if not line.startswith("{"):
            return None

        brace_end = line.rfind("}")
        if brace_end == -1:
            return None
        line = line[:brace_end + 1]

        raw = json.loads(line)

        for key in ["ph", "do", "temp", "turbidity"]:
            if key not in raw:
                return None

        return {
            "ph"             : float(raw["ph"]),
            "dissolvedOxygen": float(raw["do"]),
            "temperature"    : float(raw["temp"]),
            "turbidity"      : float(raw["turbidity"]),
        }

    except (json.JSONDecodeError, ValueError, TypeError):
        return None

# ================================================================
# read_ammonia_from_file()
#
# Web dashboard writes ammonia.txt when user creates a test:
#   {"ammonia": 0.3, "userId": "abc123", "testName": "...", "projectTitle": "..."}
#
# Returns: (ammonia_float, metadata_dict)
# Waits up to AMMONIA_WAIT_TIMEOUT seconds.
# Falls back to 0.0 if timeout or file is invalid.
# ================================================================
def read_ammonia_from_file(timeout_sec=AMMONIA_WAIT_TIMEOUT):
    log.info(f"Waiting for ammonia input via web dashboard...")
    log.info(f"File: {AMMONIA_FILE}")
    log.info(f"Or update via web: Dashboard → Create Test → Enter ammonia")

    start = time.time()
    while time.time() - start < timeout_sec:
        if os.path.exists(AMMONIA_FILE):
            try:
                with open(AMMONIA_FILE, "r") as f:
                    content = f.read().strip()
                if not content:
                    time.sleep(1)
                    continue

                data = json.loads(content)
                ammonia = float(data.get("ammonia", 0.0))
                ammonia = max(0.0, min(5.0, ammonia))

                # Consume the file so it's not reused for the next reading
                os.remove(AMMONIA_FILE)

                log.info(f"Ammonia read from web: {ammonia:.3f} mg/L")
                return ammonia, data

            except (json.JSONDecodeError, ValueError, OSError) as e:
                log.warning(f"ammonia.txt read error: {e} — retrying")
                time.sleep(2)
                continue

        time.sleep(1)

    log.warning(f"Ammonia wait timeout ({timeout_sec}s). Using 0.00 mg/L as default.")
    return 0.0, {}

# ================================================================
# build_test_doc — Schema 2
# ================================================================
def build_test_doc(p1_doc, ammonia_meta, test_index):
    user_id   = ammonia_meta.get("userId",      "unknown")
    test_name = ammonia_meta.get("testName",     f"Test_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    proj      = ammonia_meta.get("projectTitle", p1_doc["projectTitle"])

    return {
        "userId"     : user_id,
        "sessionName": test_name,
        "projectTitle": proj,
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
        "createdAt": datetime.now(timezone.utc)
    }

# ================================================================
# MAIN
# ================================================================
def main():
    log.info("═" * 50)
    log.info("AquaPredict — Pipeline 2 (Web-Driven, Continuous)")
    log.info("═" * 50)

    db        = connect_mongodb()
    ser       = open_serial()
    rt_col    = db["realtime_monitoring"]
    test_col  = db["test_sessions"]
    rt_stream = db["realtime_stream"]

    test_number = rt_col.count_documents({}) + 1

    log.info(f"Listening on {SERIAL_PORT} — Ctrl+C to stop")
    log.info(f"Ammonia file: {AMMONIA_FILE}")

    while True:
        try:
            raw_line = ser.readline().decode("utf-8", errors="ignore")
            sensor   = parse_line(raw_line)

            if sensor is None:
                continue

            # Save to realtime stream (no prediction, just raw values)
            rt_stream.insert_one({
                "timestamp"  : datetime.now(timezone.utc),
                "ph"         : sensor["ph"],
                "do"         : sensor["dissolvedOxygen"],
                "turbidity"  : sensor["turbidity"],
                "temperature": sensor["temperature"]
            })

            log.info(f"Sensor received — ph={sensor['ph']} DO={sensor['dissolvedOxygen']} "
                     f"temp={sensor['temperature']} turb={sensor['turbidity']}")

            # Read ammonia from file (set by web dashboard)
            ammonia, ammonia_meta = read_ammonia_from_file()

            water_data = {**sensor, "ammonia": ammonia}

            project = ammonia_meta.get("projectTitle", PROJECT_TITLE)
            log.info(f"Predicting — test #{test_number} | ammonia={ammonia:.3f}")

            p1_doc = predict_document(
                water_data   = water_data,
                projectTitle = project,
                testNumber   = test_number
            )

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

            # Embed userId from web into the realtime doc too
            if ammonia_meta.get("userId"):
                mongo_doc["userId"] = ammonia_meta["userId"]

            r1 = rt_col.insert_one(mongo_doc)
            r2 = test_col.insert_one(build_test_doc(p1_doc, ammonia_meta, test_number))

            log.info(f"Saved — realtime={r1.inserted_id} | test={r2.inserted_id}")
            log.info(f"Species: {p1_doc['fishPrediction']['predictedSpecies']}")

            test_number += 1

        except KeyboardInterrupt:
            log.info("Pipeline stopped.")
            ser.close()
            sys.exit(0)
        except ServerSelectionTimeoutError:
            log.error("MongoDB connection lost. Retrying in 5s...")
            time.sleep(5)
        except Exception as e:
            log.error(f"Unexpected error: {e}", exc_info=True)
            time.sleep(1)

if __name__ == "__main__":
    main()
