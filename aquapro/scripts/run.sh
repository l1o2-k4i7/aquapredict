#!/bin/bash
# =============================================================================
# scripts/run.sh
# AquaPro – Master startup script for Jetson Nano
# Starts: MongoDB → Node.js backend → Serial reader (ESP32-RX bridge)
# All processes run in the background simultaneously.
# =============================================================================

set -e

# ── CONFIG (edit these if needed) ────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"  # root of aquapro repo
MONGO_DATA="/data/db"
MONGO_LOG="/tmp/aquapro_mongo.log"
BACKEND_LOG="/tmp/aquapro_backend.log"
SERIAL_LOG="/tmp/aquapro_serial.log"
SERIAL_PORT="${SERIAL_PORT:-/dev/ttyUSB0}"
PORT="${PORT:-3000}"

# ── COLORS ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║          🐟  AquaPro – System Start          ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

cd "$PROJECT_DIR"

# ── STEP 1: Read pondId from .env or argument ─────────────────────────────────
POND_ID="${1:-}"
if [ -z "$POND_ID" ]; then
  # Try reading from .env
  if grep -q "POND_ID" .env 2>/dev/null; then
    POND_ID=$(grep "^POND_ID" .env | cut -d '=' -f2 | tr -d ' ')
  fi
fi

if [ -z "$POND_ID" ]; then
  echo -e "${YELLOW}⚠️  No pondId provided."
  echo "   Run: node seed.js first, then:"
  echo "   bash scripts/run.sh <pondId>${NC}"
  echo ""
fi

# ── STEP 2: Start MongoDB ─────────────────────────────────────────────────────
echo -e "${GREEN}[1/3] Starting MongoDB...${NC}"

# Create data dir if not exists
sudo mkdir -p "$MONGO_DATA"
sudo chmod -R 777 "$MONGO_DATA"

# Kill any existing mongod
pkill -f mongod 2>/dev/null || true
sleep 1

# Start MongoDB with 256MB cache (safe for 2GB RAM Jetson Nano)
mongod --dbpath "$MONGO_DATA" \
       --wiredTigerCacheSizeGB 0.25 \
       --logpath "$MONGO_LOG" \
       --fork

echo -e "${GREEN}✅ MongoDB started. Log: $MONGO_LOG${NC}"
sleep 2

# ── STEP 3: Install Node dependencies if needed ───────────────────────────────
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📦 Installing Node.js dependencies...${NC}"
  npm install
fi

# ── STEP 4: Start Node.js backend ────────────────────────────────────────────
echo -e "${GREEN}[2/3] Starting Node.js backend on port $PORT...${NC}"

pkill -f "node server.js" 2>/dev/null || true
sleep 1

nohup node server.js > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID). Log: $BACKEND_LOG${NC}"
sleep 2

# Check it's actually up
if curl -s "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Backend health check passed ✓${NC}"
else
  echo -e "${YELLOW}⚠️  Backend may still be starting up. Check log: $BACKEND_LOG${NC}"
fi

# ── STEP 5: Start serial reader (ESP32-RX bridge) ─────────────────────────────
if [ -n "$POND_ID" ]; then
  echo -e "${GREEN}[3/3] Starting serial reader on $SERIAL_PORT for pond $POND_ID...${NC}"

  # Check if serial port exists
  if [ ! -e "$SERIAL_PORT" ]; then
    echo -e "${RED}❌ Serial port $SERIAL_PORT not found."
    echo "   Is the ESP32-RX connected via USB?"
    echo "   Try: ls /dev/ttyUSB* or ls /dev/ttyACM*${NC}"
  else
    pkill -f "node serial_reader.js" 2>/dev/null || true
    sleep 1

    SERIAL_PORT="$SERIAL_PORT" nohup node serial_reader.js "$POND_ID" > "$SERIAL_LOG" 2>&1 &
    SERIAL_PID=$!
    echo -e "${GREEN}✅ Serial reader started (PID: $SERIAL_PID). Log: $SERIAL_LOG${NC}"
  fi
else
  echo -e "${YELLOW}[3/3] Skipping serial reader (no pondId given).${NC}"
  echo -e "      Once you have a pondId, run:"
  echo -e "      ${CYAN}node serial_reader.js <pondId>${NC}"
fi

# ── DONE ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗"
echo    "║          ✅  AquaPro is Running!             ║"
echo -e "╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐 Dashboard   : ${CYAN}http://localhost:$PORT${NC}"
echo -e "  📡 Sensor API  : ${CYAN}http://localhost:$PORT/api/sensor${NC}"
echo -e "  🧪 Test API    : ${CYAN}http://localhost:$PORT/api/test/create${NC}"
echo -e "  ❤️  Health      : ${CYAN}http://localhost:$PORT/api/health${NC}"
echo ""
echo -e "  📄 Logs:"
echo -e "     MongoDB  → tail -f $MONGO_LOG"
echo -e "     Backend  → tail -f $BACKEND_LOG"
echo -e "     Serial   → tail -f $SERIAL_LOG"
echo ""
echo -e "  🛑 To stop all: ${YELLOW}bash scripts/stop.sh${NC}"
