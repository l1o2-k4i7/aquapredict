#!/bin/bash
# scripts/stop.sh — Stop all AquaPro processes

echo "🛑 Stopping AquaPro processes..."

pkill -f "node server.js"        2>/dev/null && echo "✅ Backend stopped"     || echo "ℹ️  Backend not running"
pkill -f "node serial_reader.js" 2>/dev/null && echo "✅ Serial reader stopped" || echo "ℹ️  Serial reader not running"
pkill -f mongod                  2>/dev/null && echo "✅ MongoDB stopped"     || echo "ℹ️  MongoDB not running"

echo "Done."
