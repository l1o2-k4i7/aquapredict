#!/bin/bash
# ================================================================
# AquaPredict — Master Start Script (FIXED VERSION)
# ================================================================

set -e

# ── Paths ─────────────────────────────────────────────────────────
AQUA_DIR="$HOME/aquapredict"
LOG_DIR="$AQUA_DIR/logs"
AQUA_APP_DIR="$AQUA_DIR/aquapro"
AMMONIA_FILE="$AQUA_DIR/ammonia.txt"
MONGOD_PID_FILE="$LOG_DIR/mongod.pid"
PIPELINE_PID_FILE="$LOG_DIR/pipeline.pid"
WEBAPP_PID_FILE="$LOG_DIR/webapp.pid"

PYTHON="python3"
NODE="node"
MONGOD_BIN="mongod"
MONGO_DATA="/data/db"
MONGO_LOG="$LOG_DIR/mongod.log"

# ── Colours ───────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()  { echo -e "${GREEN}$1${NC}"; }
warn(){ echo -e "${YELLOW}$1${NC}"; }
err() { echo -e "${RED}$1${NC}"; }

# ── Helpers ───────────────────────────────────────────────────────
is_running() {
    local pidfile="$1"
    [[ -f "$pidfile" ]] && kill -0 "$(cat $pidfile)" 2>/dev/null
}

kill_pid_file() {
    local pidfile="$1"
    local name="$2"
    if [[ -f "$pidfile" ]]; then
        local pid
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null && ok "  Stopped $name (PID $pid)"
        fi
        rm -f "$pidfile"
    fi
}

get_jetson_ip() {
    hostname -I 2>/dev/null | awk '{print $1}'
}

# ================================================================
# STOP
# ================================================================
do_stop() {
    echo ""
    echo "Stopping AquaPredict..."
    kill_pid_file "$PIPELINE_PID_FILE" "Pipeline"
    kill_pid_file "$WEBAPP_PID_FILE"   "Web App"
    pkill -f mongod 2>/dev/null || true
    ok "All services stopped."
}

# ================================================================
# STATUS
# ================================================================
do_status() {
    echo ""
    echo "AquaPredict Service Status"
    echo "─────────────────────────────────────────"

    if pgrep -x "mongod" > /dev/null; then
        ok "  MongoDB  : running"
    else
        err "  MongoDB  : stopped"
    fi

    if is_running "$PIPELINE_PID_FILE"; then
        ok "  Pipeline : running"
    else
        warn "  Pipeline : stopped"
    fi

    if is_running "$WEBAPP_PID_FILE"; then
        IP=$(get_jetson_ip)
        ok "  Web App  : running  → http://$IP:5000"
    else
        warn "  Web App  : stopped"
    fi

    echo ""
}

# ================================================================
# LOGS
# ================================================================
do_logs() {
    echo "Tailing logs..."
    tail -f "$LOG_DIR/"*.log
}

# ================================================================
# START
# ================================================================
do_start() {
    local MODE="${1:-auto}"

    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║   🐟  AquaPredict — Water Quality Monitor        ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo ""

    mkdir -p "$LOG_DIR"
    mkdir -p "$MONGO_DATA"

    # ── [1/3] MongoDB ──────────────────────────────────────────
    echo -n "[1/3] Starting MongoDB..."

    if pgrep -x "mongod" > /dev/null
    then
        ok "  already running ✓"
    else
        $MONGOD_BIN \
            --dbpath "$MONGO_DATA" \
            --wiredTigerCacheSizeGB 0.25 \
            --bind_ip_all \
            --logpath "$MONGO_LOG" \
            --logappend \
            --fork \
            >> "$MONGO_LOG" 2>&1

        sleep 2
        ok "  started ✓"
    fi

    # Run setup
    $PYTHON "$AQUA_DIR/setup_mongodb.py" >> "$LOG_DIR/setup.log" 2>&1

    # ── [2/3] Web App ──────────────────────────────────────────
    echo -n "[2/3] Starting Web App..."

    if is_running "$WEBAPP_PID_FILE"; then
        ok "  already running ✓"
    else
        cd "$AQUA_APP_DIR"
        nohup $NODE server.js >> "$LOG_DIR/webapp.log" 2>&1 &
        echo $! > "$WEBAPP_PID_FILE"
        sleep 2

        if is_running "$WEBAPP_PID_FILE"; then
            ok "  started ✓"
        else
            err "  failed (check logs)"
        fi
        cd "$AQUA_DIR"
    fi

    # ── [3/3] Pipeline ─────────────────────────────────────────
    echo -n "[3/3] Starting Pipeline..."

    if is_running "$PIPELINE_PID_FILE"; then
        ok "  already running ✓"
    else
        nohup $PYTHON "$AQUA_DIR/pipeline2_continuous.py" \
            >> "$LOG_DIR/pipeline2.log" 2>&1 &
        echo $! > "$PIPELINE_PID_FILE"
        sleep 1

        if is_running "$PIPELINE_PID_FILE"; then
            ok "  started ✓"
        else
            err "  failed (check logs)"
        fi
    fi

    # ── Summary ────────────────────────────────────────────────
    IP=$(get_jetson_ip)

    echo ""
    ok "✅ All services started!"
    echo "Dashboard: http://$IP:5000"
    echo ""
}

# ================================================================
# ENTRY
# ================================================================
case "${1:-auto}" in
    stop)   do_stop ;;
    status) do_status ;;
    logs)   do_logs ;;
    *)      do_start ;;
esac
