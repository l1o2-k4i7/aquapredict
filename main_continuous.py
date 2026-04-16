#!/usr/bin/env python3
# =============================================================
# pipeline2_continuous.py  —  Pipeline 2: Continuous Monitoring
#
# Use when: system runs unattended / auto-start on boot.
# Reads ammonia value from ammonia.txt automatically.
# Saves every reading to MongoDB without any keyboard input.
# Auto-saves a Test Session every AUTO_SAVE_TEST_EVERY readings.
# Logs everything to pipeline2_log.txt
# Press Ctrl+C to stop.
# =============================================================

import serial
import json
import time
import sys
import os
import logging
from datetime import datetime, timezone
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1 import predict_document

# =============================================================
# CONFIGURATION  ← Edit these values
# =============================================================
SERIAL_PORT           = "/dev/ttyUSB0"
BAUD_RATE             = 115200
PHONE_ID              = "919876543210"
PROJECT_TITLE         = "Pond A – Water Quality Trial"
MONGO_URI             = "mongodb://localhost:27017"
DB_NAME               = "aquapredict"
AUTO_SAVE_TEST_EVERY  = 10     # save a test session every N readings (0 = off)
DEFAULT_AMMONIA       = 0.2    # used if ammonia.txt is missing or unreadable
# =============================================================

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
AMMONIA_FILE = os.path.join(BASE_DIR, "ammonia.txt")
LOG_FILE     = os.path.join(BASE_DIR, "pipeline2_log.txt")

# ── Logging setup ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger("pipeline2")

# ── MongoDB ──────────────────────────────────────────────────
def connect_mongo(retries=5):
    for attempt in range(1, retries + 1):
        try:
            c = MongoClient(MONGO_URI, serverSelectionTimeoutMS=4000)
            c.server_info()
            log.info("MongoDB connected ✅")
            return c
        except Exception as e:
            log.warning(f"MongoDB attempt {attempt}/{retries} failed: {e}")
            time.sleep(3)
    log.error("Cannot connect to MongoDB after retries. Is mongod running?")
    sys.exit(1)

client       = connect_mongo()
db           = client[DB_NAME]
realtime_col = db["realtime_monitoring"]
test_col     = db["test_sessions"]

# ── Serial port ───────────────────────────────────────────────
def open_serial(retries=10):
    for attempt in range(1, retries + 1):
        try:
            s = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=5)
            log.info(f"Serial port {SERIAL_PORT} open ✅")
            return s
        except Exception as e:
            log.warning(f"Serial attempt {attempt}/{retries}: {e}")
            time.sleep(3)
    log.error(f"Cannot open serial port {SERIAL_PORT}. Is ESP32-RX plugged in?")
    sys.exit(1)

ser = open_serial()

# ── Helpers ───────────────────────────────────────────────────
def next_test_number():
    last = realtime_col.find_one(sort=[("testNumber", -1)])
    if last and "testNumber" in last and last["testNumber"] >= 1:
        return last["testNumber"] + 1
    return 1

def read_ammonia():
    """Read ammonia from file. Returns DEFAULT_AMMONIA if file missing."""
    if os.path.isfile(AMMONIA_FILE):
        try:
            with open(AMMONIA_FILE) as f:
                val = float(f.read().strip())
            if val < 0:
                log.warning(f"ammonia.txt has negative value {val}, using {DEFAULT_AMMONIA}")
                return DEFAULT_AMMONIA
            return val
        except Exception as e:
            log.warning(f"Cannot read ammonia.txt: {e} — using {DEFAULT_AMMONIA}")
    else:
        log.warning(f"ammonia.txt not found — using default {DEFAULT_AMMONIA} mg/L")
        log.warning(f"  Create it:  echo '{DEFAULT_AMMONIA}' > {AMMONIA_FILE}")
    return DEFAULT_AMMONIA

def clean_line(raw):
    line = raw.decode("utf-8", errors="ignore").strip()
    for prefix in ["Received: ", "received: ", "Data: ", "data: "]:
        if line.startswith(prefix):
            line = line[len(prefix):]
            break
    return line.strip('\x00').strip('\r').strip('\xef\xbb\xbf')

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
    log.info(f"Saved realtime — Test#{test_num}  ID:{result.inserted_id}")

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
    log.info(f"Auto-saved test session — ID:{result.inserted_id}")

DEBUG_WORDS = ["rx ", "tx ", "starting", "ready", "from mac", "my mac",
               "size error", "send status", "esp-now", "wifi", "peer",
               "init", "receiver", "sender"]

log.info("Pipeline 2 (Continuous) started")
log.info(f"Serial: {SERIAL_PORT}  |  Phone: {PHONE_ID}")
log.info(f"Auto test session every {AUTO_SAVE_TEST_EVERY} readings (0=off)")
log.info(f"Ammonia file: {AMMONIA_FILE}")
log.info("Press Ctrl+C to stop")

reading_count = 0

while True:
    try:
        raw = ser.readline()
        if not raw:
            continue

        line = clean_line(raw)
        if not line:
            continue

        if not line.startswith("{"):
            low = line.lower()
            if not any(low.startswith(d) for d in DEBUG_WORDS):
                log.debug(f"Skipped non-JSON: {line[:60]}")
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError as e:
            log.warning(f"JSON error: {e}  line: {line[:60]}")
            continue

        try:
            water = {
                "ph"              : float(data.get("ph",        0)),
                "temperature"     : float(data.get("temp",      0)),
                "turbidity"       : float(data.get("turbidity", 0)),
                "dissolvedOxygen" : float(data.get("do",        0)),
                "ammonia"         : read_ammonia()
            }
        except (ValueError, TypeError) as e:
            log.warning(f"Bad sensor value: {e}")
            continue

        log.info(f"Received: pH={water['ph']}  Temp={water['temperature']}°C  "
                 f"Turbidity={water['turbidity']} NTU  DO={water['dissolvedOxygen']} mg/L  "
                 f"Ammonia={water['ammonia']} mg/L")

        # Predict
        test_num = next_test_number()
        pred = predict_document(
            water_data   = water,
            projectTitle = PROJECT_TITLE,
            testNumber   = test_num
        )
        species = pred["fishPrediction"]["predictedSpecies"]
        log.info(f"Predicted species: {species}")

        # Save realtime (every reading)
        save_realtime(water, pred, test_num)
        reading_count += 1

        # Auto-save test session every N readings
        if AUTO_SAVE_TEST_EVERY > 0 and reading_count % AUTO_SAVE_TEST_EVERY == 0:
            name = f"Auto Test #{reading_count} — {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            save_test_session(water, pred, name)

    except KeyboardInterrupt:
        log.info("Pipeline 2 stopped by user.")
        ser.close()
        client.close()
        sys.exit(0)
    except serial.SerialException as e:
        log.error(f"Serial error: {e} — reconnecting in 5s...")
        time.sleep(5)
        try:
            ser = open_serial()
        except SystemExit:
            pass
    except Exception as e:
        log.error(f"Unexpected error: {e}")
        time.sleep(2)
