#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# p1_wrapper.py
#
# This file is called by pythonService.js (Node.js).
# It reads a JSON payload from stdin, calls predict_document() from p1.py,
# and prints the result as JSON on the LAST line of stdout.
#
# p1.py is NOT modified. This wrapper just imports and calls it.
#
# stdin format:
# {
#   "waterParameters": {
#     "dissolvedOxygen": 7.2,
#     "ph": 7.5,
#     "temperature": 26,
#     "ammonia": 0.2,
#     "turbidity": 3
#   },
#   "projectTitle": "Pond A – Water Quality Trial",
#   "testNumber": 1
# }

import sys
import json
import os

# ── Read JSON from stdin ────────────────────────────────────────────────────
raw = sys.stdin.read().strip()

try:
    payload = json.loads(raw)
except json.JSONDecodeError as e:
    print(json.dumps({"error": f"Invalid JSON input: {str(e)}"}))
    sys.exit(1)

water_data    = payload.get("waterParameters", {})
project_title = payload.get("projectTitle", "AquaPro Test")
test_number   = payload.get("testNumber", 1)

# ── Import predict_document from p1.py ─────────────────────────────────────
# p1.py must be in the same directory as this wrapper
p1_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, p1_dir)

try:
    from p1 import predict_document
except ImportError as e:
    print(json.dumps({"error": f"Could not import p1.py: {str(e)}"}))
    sys.exit(1)

# ── Run prediction ──────────────────────────────────────────────────────────
try:
    result = predict_document(water_data, projectTitle=project_title, testNumber=test_number)
    # Print result as last line (Node.js reads last line)
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": f"Prediction failed: {str(e)}"}))
    sys.exit(1)
