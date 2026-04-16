#!/usr/bin/env python3
# =============================================================
# setup_mongodb.py
# Run ONCE before starting any pipeline.
# Safe to run again — checks before inserting, never duplicates.
# =============================================================

from pymongo import MongoClient, ASCENDING, DESCENDING
from datetime import datetime, timezone

print("=" * 52)
print("  AquaPredict — MongoDB Setup")
print("=" * 52)

# ── Connect ──────────────────────────────────────────────────
try:
    client = MongoClient("mongodb://localhost:27017",
                         serverSelectionTimeoutMS=4000)
    client.server_info()
    print("\n[MongoDB] Connected ✅")
except Exception as e:
    print(f"\n[MongoDB] ❌ Cannot connect: {e}")
    print("  Fix: Start MongoDB first →  mongod --dbpath /data/db --wiredTigerCacheSizeGB 0.25")
    exit(1)

db           = client["aquapredict"]
realtime_col = db["realtime_monitoring"]
test_col     = db["test_sessions"]

# =============================================================
# STEP 1 — realtime_monitoring indexes
# =============================================================
print("\n[Step 1] Setting up 'realtime_monitoring' collection...")
existing = [idx["name"] for idx in realtime_col.list_indexes()]
if "testNumber_1" not in existing:
    realtime_col.create_index([("testNumber", ASCENDING)], unique=True, name="testNumber_1")
    print("  ✅ Index testNumber_1 created")
else:
    print("  ✅ Index testNumber_1 already exists — skipped")
if "createdAt_-1" not in existing:
    realtime_col.create_index([("createdAt", DESCENDING)], name="createdAt_-1")
    print("  ✅ Index createdAt_-1 created")
else:
    print("  ✅ Index createdAt_-1 already exists — skipped")

# =============================================================
# STEP 2 — test_sessions indexes
# =============================================================
print("\n[Step 2] Setting up 'test_sessions' collection...")
existing2 = [idx["name"] for idx in test_col.list_indexes()]
if "phoneId_1" not in existing2:
    test_col.create_index([("phoneId", ASCENDING)], name="phoneId_1")
    print("  ✅ Index phoneId_1 created")
else:
    print("  ✅ Index phoneId_1 already exists — skipped")
if "testedAt_-1" not in existing2:
    test_col.create_index([("testedAt", DESCENDING)], name="testedAt_-1")
    print("  ✅ Index testedAt_-1 created")
else:
    print("  ✅ Index testedAt_-1 already exists — skipped")

# =============================================================
# STEP 3 — Sample document for realtime_monitoring
#           Only inserts if testNumber:0 does not exist
# =============================================================
print("\n[Step 3] Checking sample document in realtime_monitoring...")
existing_sample = realtime_col.find_one({"testNumber": 0})

if existing_sample:
    print("  ✅ Sample document already exists — skipped (no duplicate)")
else:
    now = datetime.now(timezone.utc)
    sample_realtime = {
        "testNumber"   : 0,
        "projectTitle" : "Pond A – Water Quality Trial",
        "status"       : "Completed",
        "waterParameters": {
            "dissolvedOxygen" : 7.2,
            "ph"              : 7.5,
            "temperature"     : 26.0,
            "ammonia"         : 0.2,
            "turbidity"       : 3.0
        },
        "fishPrediction": {
            "predictedSpecies" : ["Rohu", "Catla", "Mrigal", "Silver Carp", "Grass Carp"],
            "removedPredators" : ["Catfish", "Snakehead"],
            "groupedSpecies"   : {
                "surface"    : ["Silver Carp"],
                "middle"     : ["Rohu", "Catla", "Mrigal"],
                "bottom"     : ["Common Carp"],
                "vegetation" : ["Grass Carp"]
            }
        },
        "stackingData": {
            "cultureSystem" : "Polyculture",
            "priority"      : "High",
            "status"        : "Approved",
            "stockingRatio" : {
                "Rohu": 30, "Catla": 25, "Mrigal": 20,
                "Silver Carp": 15, "Grass Carp": 10
            }
        },
        "__v"       : 0,
        "createdAt" : now,
        "updatedAt" : now
    }
    r1 = realtime_col.insert_one(sample_realtime)
    print(f"  ✅ Sample inserted — ID: {r1.inserted_id}")

# =============================================================
# STEP 4 — Sample document for test_sessions
# =============================================================
print("\n[Step 4] Checking sample document in test_sessions...")
existing_test = test_col.find_one({"phoneId": "919876543210", "testIndex": 0})

if existing_test:
    print("  ✅ Sample test session already exists — skipped")
else:
    now = datetime.now(timezone.utc)
    sample_test = {
        "phoneId"     : "919876543210",
        "sessionName" : "Sample Test – Pond A",
        "testIndex"   : 0,
        "testedAt"    : now,
        "waterParameters": {
            "dissolvedOxygen" : 7.2,
            "ph"              : 7.5,
            "temperature"     : 26.0,
            "ammonia"         : 0.2,
            "turbidity"       : 3.0
        },
        "prediction": {
            "predictedSpecies" : ["Rohu", "Catla", "Mrigal", "Silver Carp", "Grass Carp"],
            "removedPredators" : [],
            "groupedSpecies"   : {
                "surface"    : ["Silver Carp"],
                "middle"     : ["Rohu", "Catla", "Mrigal"],
                "bottom"     : ["Common Carp"],
                "vegetation" : ["Grass Carp"]
            },
            "cultureSystem" : "Polyculture",
            "priority"      : "High",
            "status"        : "Approved",
            "stockingRatio" : {
                "Rohu": 30, "Catla": 25, "Mrigal": 20,
                "Silver Carp": 15, "Grass Carp": 10
            }
        },
        "createdAt" : now,
        "updatedAt" : now
    }
    r2 = test_col.insert_one(sample_test)
    print(f"  ✅ Sample test inserted — ID: {r2.inserted_id}")

# =============================================================
# STEP 5 — Verify
# =============================================================
print("\n[Step 5] Verifying...")
rt_count   = realtime_col.count_documents({})
test_count = test_col.count_documents({})
print(f"  realtime_monitoring : {rt_count} document(s)")
print(f"  test_sessions       : {test_count} document(s)")

print("\n" + "=" * 52)
print("  ✅ Setup Complete!")
print("  Next: run  bash start_aquapredict.sh")
print("=" * 52 + "\n")
client.close()
