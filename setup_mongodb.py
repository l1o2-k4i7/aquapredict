#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
AquaPredict — MongoDB Setup
FILE: ~/aquapredict/setup_mongodb.py

SAFE TO RE-RUN — checks before inserting, never duplicates.

Collections created:
  realtime_monitoring  ← full prediction document per reading
  test_sessions        ← per-user test record
  realtime_stream      ← lightweight raw sensor stream (no prediction)
  users                ← user accounts (managed by Node.js web app)

RUN ONCE:
  python3 ~/aquapredict/setup_mongodb.py
================================================================
"""

import sys
import os
from datetime import datetime, timezone
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ServerSelectionTimeoutError

MONGO_URI     = "mongodb://localhost:27017/"
DATABASE_NAME = "aquapredict"

def setup():
    print("=" * 52)
    print("  AquaPredict — MongoDB Setup")
    print("=" * 52)

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.server_info()
        print("✅ MongoDB Connected\n")
    except ServerSelectionTimeoutError:
        print("❌ Cannot connect to MongoDB.")
        print("   Run: mongod --dbpath /data/db --wiredTigerCacheSizeGB 0.25 &")
        sys.exit(1)

    db = client[DATABASE_NAME]

    # ================================================================
    # 1. realtime_monitoring
    # Full prediction document matching exact schema.
    # ================================================================
    print("[Step 1] realtime_monitoring indexes...")
    rt = db["realtime_monitoring"]
    existing = [idx["name"] for idx in rt.list_indexes()]

    if "testNumber_1" not in existing:
        rt.create_index([("testNumber", ASCENDING)],  unique=True, name="testNumber_1")
    if "createdAt_-1" not in existing:
        rt.create_index([("createdAt",  DESCENDING)], name="createdAt_-1")
    if "userId_1" not in existing:
        rt.create_index([("userId",     ASCENDING)],  name="userId_1")
    if "stackingData.status_1" not in existing:
        rt.create_index([("stackingData.status", ASCENDING)], name="stackingData.status_1")
    print("   ✅")

    # Sample doc only if collection is empty
    if rt.count_documents({}) == 0:
        rt.insert_one({
            "testNumber"  : 0,
            "projectTitle": "Setup Sample",
            "status"      : "Completed",
            "waterParameters": {
                "ph":7.5,"dissolvedOxygen":7.2,"temperature":26.0,"ammonia":0.2,"turbidity":3.0
            },
            "fishPrediction": {
                "predictedSpecies": ["Rohu","Catla","Mrigal","Silver Carp","Grass Carp"],
                "removedPredators": ["Catfish","Snakehead"],
                "groupedSpecies"  : {
                    "surface":["Silver Carp"],"middle":["Rohu","Catla","Mrigal"],
                    "bottom":["Common Carp"],"vegetation":["Grass Carp"]
                }
            },
            "stackingData": {
                "cultureSystem":"Polyculture","priority":"High","status":"Approved",
                "stockingRatio":{"Rohu":30,"Catla":25,"Mrigal":20,"Silver Carp":15,"Grass Carp":10}
            },
            "__v":0,
            "createdAt":datetime.now(timezone.utc),
            "updatedAt":datetime.now(timezone.utc)
        })
        print("   Sample document inserted ✅")
    else:
        print("   Sample skipped (collection already has data) ✅")

    # ================================================================
    # 2. test_sessions
    # ================================================================
    print("[Step 2] test_sessions indexes...")
    ts = db["test_sessions"]
    existing = [idx["name"] for idx in ts.list_indexes()]

    if "userId_1" not in existing:
        ts.create_index([("userId",   ASCENDING)],  name="userId_1")
    if "testedAt_-1" not in existing:
        ts.create_index([("testedAt", DESCENDING)], name="testedAt_-1")
    print("   ✅")

    if ts.count_documents({}) == 0:
        ts.insert_one({
            "userId"     : "setup_user",
            "sessionName": "Setup Sample",
            "projectTitle":"Setup Sample",
            "testIndex"  : 0,
            "testedAt"   : datetime.now(timezone.utc),
            "waterParameters": {
                "ph":7.5,"dissolvedOxygen":7.2,"temperature":26.0,"ammonia":0.2,"turbidity":3.0
            },
            "prediction" : {
                "predictedSpecies":["Rohu","Catla"],"cultureSystem":"Polyculture",
                "priority":"High","status":"Approved",
                "stockingRatio":{"Rohu":30,"Catla":25}
            },
            "createdAt": datetime.now(timezone.utc)
        })
        print("   Sample test session inserted ✅")
    else:
        print("   Sample skipped ✅")

    # ================================================================
    # 3. realtime_stream (raw sensor values, lightweight)
    # Schema: timestamp, ph, do, turbidity, temperature
    # ================================================================
    print("[Step 3] realtime_stream indexes...")
    rs = db["realtime_stream"]
    existing = [idx["name"] for idx in rs.list_indexes()]
    if "timestamp_-1" not in existing:
        rs.create_index([("timestamp", DESCENDING)], name="timestamp_-1")
    # TTL index — auto-delete stream docs older than 7 days (saves RAM)
    if "timestamp_ttl" not in existing:
        rs.create_index([("timestamp", ASCENDING)],
                        expireAfterSeconds=604800,   # 7 days
                        name="timestamp_ttl")
    print("   ✅")

    # ================================================================
    # 4. users (managed by Node.js — just ensure index exists)
    # ================================================================
    print("[Step 4] users indexes...")
    users = db["users"]
    existing = [idx["name"] for idx in users.list_indexes()]
    if "email_1" not in existing:
        try:
            users.create_index([("email", ASCENDING)], unique=True, name="email_1")
        except Exception:
            pass  # May already exist from Node.js app
    print("   ✅")

    print("\n" + "=" * 52)
    print("  Setup Complete!")
    print("=" * 52)
    print(f"  DB         : {DATABASE_NAME}")
    print(f"  Collections: realtime_monitoring, test_sessions,")
    print(f"               realtime_stream, users")
    print(f"\n  Verify:")
    print(f"    mongo aquapredict")
    print(f"    db.realtime_monitoring.find().pretty()")

if __name__ == "__main__":
    setup()
