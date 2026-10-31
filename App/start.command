#!/bin/bash
cd "$(dirname "$0")" || exit 1

APP_NAME="IA-Trading-Bot"
BUILD_VERSION="$(tr -d '[:space:]' < "$PWD/VERSION" 2>/dev/null)"
[ -n "$BUILD_VERSION" ] || BUILD_VERSION="2.0.0"
BUILD_STATUS="DEBUG"
UI_PORT=8000
CORE_PORT=8001
INDICATOR_PORT=8012
MARKET_DATA_PORT=8013
LIQUIDITY_PORT=8014
FUNDAMENTAL_PORT=8015
TRADING_ENGINE_PORT=8016
FIREWALL_PORT=8017
STRATEGY_PORT=8018
RISK_ENGINE_PORT=8019
PORTFOLIO_PORT=8020
ROUTER_PORT=8021
SUPERVISOR_PORT=3000

# IA-TB Startup Console
if [ -t 1 ]; then
  C_RESET='\033[0m'
  C_GREEN='\033[1;32m'
  C_CYAN='\033[1;36m'
  C_YELLOW='\033[1;33m'
  C_RED='\033[1;31m'
  C_GRAY='\033[0;90m'
  C_BOLD='\033[1m'
else
  C_RESET=''
  C_GREEN=''
  C_CYAN=''
  C_YELLOW=''
  C_RED=''
  C_GRAY=''
  C_BOLD=''
fi

UI_DELAY="0.20"
STARTUP_SPACING="0.30"
say(){ echo "$1"; }

status_ok(){
  printf "  ${C_GREEN}[ OK ]${C_RESET} %-34s %s\n" "$1" "$2"
}

status_wait(){
  printf "  ${C_CYAN}[....]${C_RESET} %-34s %s\n" "$1" "$2"
  sleep "$UI_DELAY"
}

status_warn(){
  printf "  ${C_YELLOW}[WARN]${C_RESET} %-34s %s\n" "$1" "$2"
}

status_fail(){
  printf "  ${C_RED}[FAIL]${C_RESET} %-34s %s\n" "$1" "$2"
}

status_skip(){
  printf "  ${C_GRAY}[SKIP]${C_RESET} %-34s %s\n" "$1" "$2"
}

section(){
  echo
  echo "────────────────────────────────────────────────────────────────"
  printf "  ${C_BOLD}%s${C_RESET}\n" "$1"
  echo "────────────────────────────────────────────────────────────────"
  echo
}

startup_banner(){
  echo
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                                                              ║"
  echo "║                     IA TRADING BOT                           ║"
  echo "║                    v${BUILD_VERSION} ${BUILD_STATUS}                         ║"
  echo "║                                                              ║"
  echo "║                  SYSTEM STARTUP CONSOLE                      ║"
  echo "║                                                              ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo
}

http_get(){ curl -fsS --connect-timeout 1 --max-time 2 "$1" 2>/dev/null || true; }
json_pid(){ echo "$1" | sed -n 's/.*"pid"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1; }
port_busy(){
  port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1 && return 0
  fi
  # Dernier recours HTTP : une reponse quelconque indique un service.
  curl -s --connect-timeout 1 --max-time 1 "http://127.0.0.1:$port/" >/dev/null 2>&1 && return 0
  return 1
}
stop_known_on_port(){
  port="$1"
  body_health="$(http_get "http://127.0.0.1:${port}/api/health")"
  body_router="$(http_get "http://127.0.0.1:${port}/router-health")"
  body_service="$(http_get "http://127.0.0.1:${port}/health")"
  body_ui="$(http_get "http://127.0.0.1:${port}/ui-health")"
  pid=""
  label=""
  if echo "$body_ui" | grep -q 'IA-TB UI Service'; then
    pid="$(json_pid "$body_ui")"; label="UI Service"
  elif echo "$body_router" | grep -q '"router"[[:space:]]*:[[:space:]]*true'; then
    pid="$(json_pid "$body_router")"; label="Router"
  elif echo "$body_health" | grep -q 'IA-Trading-Bot'; then
    pid="$(json_pid "$body_health")"; label="IA-TB"
  elif echo "$body_service" | grep -q 'IA-TB Indicator Engine'; then
    pid="$(json_pid "$body_service")"; label="Indicator Engine"
  elif echo "$body_service" | grep -q 'IA-TB Market Data'; then
    pid="$(json_pid "$body_service")"; label="Market Data"
  elif echo "$body_service" | grep -q 'IA-TB Liquidity Engine'; then
    pid="$(json_pid "$body_service")"; label="Liquidity Engine"
  elif echo "$body_service" | grep -q 'IA-TB Fundamental Engine'; then
    pid="$(json_pid "$body_service")"; label="Fundamental Engine"
  elif echo "$body_service" | grep -q 'IA-TB Trading Engine'; then
    pid="$(json_pid "$body_service")"; label="Trading Engine"
  elif echo "$body_service" | grep -q 'IA-TB Firewall Service'; then
    pid="$(json_pid "$body_service")"; label="Firewall Service"
  elif echo "$body_service" | grep -q 'IA-TB Strategy Engine v2'; then
    pid="$(json_pid "$body_service")"; label="Strategy Engine v2"
  elif echo "$body_service" | grep -q 'IA-TB Risk Engine'; then
    pid="$(json_pid "$body_service")"; label="Risk Manager Engine"
  elif echo "$body_service" | grep -q 'IA-TB Portfolio Engine'; then
    pid="$(json_pid "$body_service")"; label="Portfolio Engine"
  elif echo "$body_service" | grep -q 'IA-TB Supervisor'; then
    pid="$(json_pid "$body_service")"; label="IA Supervisor"
  fi
  if [ -n "$pid" ]; then
    say "Ancienne instance $label detectee sur le port $port -> arret PID $pid"
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    if port_busy "$port"; then
      kill -9 "$pid" >/dev/null 2>&1 || true
      sleep 1
    fi
  fi
  if port_busy "$port"; then
    # Si le PID n'etait pas expose (ancienne revision), tenter lsof uniquement pour une instance reconnue.
    if [ -n "$label" ] && command -v lsof >/dev/null 2>&1; then
      pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')"
      for x in $pids; do kill "$x" >/dev/null 2>&1 || true; done
      sleep 1
    fi
  fi
  if port_busy "$port"; then
    say "ERREUR: le port $port est encore utilise."
    say "Ferme l'ancienne fenetre Terminal/IA-TB qui utilise ce port puis relance start.command."
    return 1
  fi
  return 0
}

startup_banner
section "[ 1/4 ]  ENVIRONMENT"

status_wait "Previous instances" "cleanup"
stop_known_on_port "$UI_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$ROUTER_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$CORE_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$INDICATOR_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$MARKET_DATA_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$LIQUIDITY_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$FUNDAMENTAL_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$TRADING_ENGINE_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$FIREWALL_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$STRATEGY_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$RISK_ENGINE_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$PORTFOLIO_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
stop_known_on_port "$SUPERVISOR_PORT" || { read -p "Appuie sur Entree pour fermer..."; exit 1; }
status_ok "Previous instances" "clean"

status_wait "Node Runtime" "checking"
bash "./install_runtime.command"
if [ $? -ne 0 ]; then
  echo "Le runtime Node local n'a pas pu etre prepare."
  read -p "Appuie sur Entree pour fermer..."
  exit 1
fi

NODE_BIN="$PWD/.node/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  echo "Node.js local introuvable."
  read -p "Appuie sur Entree pour fermer..."
  exit 1
fi
status_ok "Node Runtime" "$($NODE_BIN -v)"

if [ -f "$PWD/Bank/install_dependencies.command" ]; then
  status_wait "Bank EVM Signer" "checking"
  if /bin/bash "$PWD/Bank/install_dependencies.command"; then
    status_ok "Bank EVM Signer" "ethers 5.7.2"
  else
    status_warn "Bank EVM Signer" "unavailable"
    echo "         ↳ Swap/Bridge quotes remain available, internal signing is disabled."
  fi
fi

LOG_DIR="$PWD/.runtime/logs"
mkdir -p "$LOG_DIR"
ROUTER_LOG="$LOG_DIR/router.log"
UI_LOG="$LOG_DIR/ui.log"
LAUNCHER_LOG="$LOG_DIR/launcher.log"
INDICATOR_LOG="$LOG_DIR/indicator.log"
MARKET_DATA_LOG="$LOG_DIR/market_data.log"
LIQUIDITY_LOG="$LOG_DIR/liquidity.log"
FUNDAMENTAL_LOG="$LOG_DIR/fundamental.log"
TRADING_LOG="$LOG_DIR/trading.log"
FIREWALL_LOG="$LOG_DIR/firewall.log"
STRATEGY_LOG="$LOG_DIR/strategy.log"
RISK_LOG="$LOG_DIR/risk.log"
PORTFOLIO_LOG="$LOG_DIR/portfolio.log"
SUPERVISOR_LOG="$LOG_DIR/supervisor.log"

# Fundamental Engine V3: SQLite native dependency tested with the local Node runtime.
# Echec non bloquant: IA-TB reste disponible et le FE apparaitra OFFLINE dans ADMIN.
FUNDAMENTAL_READY=0
if [ -f "$PWD/Fundamental/install_sqlite.command" ]; then
  status_wait "SQLite / Fundamental" "checking"
  if /bin/bash "$PWD/Fundamental/install_sqlite.command"; then
    FUNDAMENTAL_READY=1
    status_ok "SQLite / Fundamental" "ready"
  else
    status_warn "SQLite / Fundamental" "unavailable"
    echo "         ↳ IA-TB continues without Fundamental Engine"
  fi
fi

INDICATOR_PID=""
MARKET_DATA_PID=""
LIQUIDITY_PID=""
FUNDAMENTAL_PID=""
TRADING_ENGINE_PID=""
FIREWALL_PID=""
STRATEGY_PID=""
RISK_ENGINE_PID=""
PORTFOLIO_PID=""
SUPERVISOR_PID=""
UI_PID=""
ROUTER_PID=""
APP_PID=""
cleanup() {
  [ -n "$UI_PID" ] && kill "$UI_PID" >/dev/null 2>&1 || true
  [ -n "$ROUTER_PID" ] && kill "$ROUTER_PID" >/dev/null 2>&1 || true
  [ -n "$INDICATOR_PID" ] && kill "$INDICATOR_PID" >/dev/null 2>&1 || true
  [ -n "$MARKET_DATA_PID" ] && kill "$MARKET_DATA_PID" >/dev/null 2>&1 || true
  [ -n "$LIQUIDITY_PID" ] && kill "$LIQUIDITY_PID" >/dev/null 2>&1 || true
  [ -n "$FUNDAMENTAL_PID" ] && kill "$FUNDAMENTAL_PID" >/dev/null 2>&1 || true
  [ -n "$TRADING_ENGINE_PID" ] && kill "$TRADING_ENGINE_PID" >/dev/null 2>&1 || true
  [ -n "$FIREWALL_PID" ] && kill "$FIREWALL_PID" >/dev/null 2>&1 || true
  [ -n "$STRATEGY_PID" ] && kill "$STRATEGY_PID" >/dev/null 2>&1 || true
  [ -n "$RISK_ENGINE_PID" ] && kill "$RISK_ENGINE_PID" >/dev/null 2>&1 || true
  [ -n "$SUPERVISOR_PID" ] && kill "$SUPERVISOR_PID" >/dev/null 2>&1 || true
  [ -n "$PORTFOLIO_PID" ] && kill "$PORTFOLIO_PID" >/dev/null 2>&1 || true
  [ -n "$APP_PID" ] && kill "$APP_PID" >/dev/null 2>&1 || true
  sleep 1
  stop_known_on_port "$UI_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$ROUTER_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$INDICATOR_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$MARKET_DATA_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$LIQUIDITY_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$FUNDAMENTAL_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$TRADING_ENGINE_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$FIREWALL_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$STRATEGY_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$RISK_ENGINE_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$PORTFOLIO_PORT" >/dev/null 2>&1 || true
  stop_known_on_port "$SUPERVISOR_PORT" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

: > "$ROUTER_LOG"
: > "$UI_LOG"
: > "$LAUNCHER_LOG"
: > "$INDICATOR_LOG"
: > "$MARKET_DATA_LOG"
: > "$LIQUIDITY_LOG"
mkdir -p Fundamental/Data
: > "$FUNDAMENTAL_LOG"
: > "$TRADING_LOG"
: > "$FIREWALL_LOG"
: > "$STRATEGY_LOG"
: > "$RISK_LOG"
: > "$PORTFOLIO_LOG"
: > "$SUPERVISOR_LOG"

section "[ 2/4 ]  STARTING SERVICES"

echo "  Runtime     $($NODE_BIN -v)"
echo "  Build       $APP_NAME v$BUILD_VERSION $BUILD_STATUS"
echo "  Profile     ${IATB_USERDATA_USER:-default}"
echo "  Mode        DEBUG"
echo

wait_service(){
  local label="$1"
  local port="$2"
  local endpoint="$3"
  local marker="$4"
  local logfile="$5"
  local tries="${6:-10}"
  local i=1
  local body=""
  while [ "$i" -le "$tries" ]; do
    body="$(http_get "http://127.0.0.1:${port}${endpoint}")"
    echo "$body" | grep -q "$marker" && { status_ok "$label" ":${port}"; return 0; }
    sleep 1
    i=$((i+1))
  done
  status_fail "$label" ":${port}"
  [ -n "$logfile" ] && { echo "--- $logfile ---"; cat "$logfile" 2>/dev/null || true; }
  return 1
}

require_service(){
  wait_service "$@" && return 0
  cleanup
  read -p "Appuie sur Entree pour fermer..."
  exit 1
}

# 1. Core: configuration, settings, admin and internal API.
status_wait "Core" "starting first"
IATB_DEBUG_MODE="1" IATB_PORT="$CORE_PORT" ROUTER_PORT="$ROUTER_PORT" IATB_FIREWALL_PORT="$FIREWALL_PORT" "$NODE_BIN" launcher.js >> "$LAUNCHER_LOG" 2>&1 &
APP_PID=$!
require_service "Core" "$CORE_PORT" "/api/health" "IA-Trading-Bot" "$LAUNCHER_LOG" 12

# 2. Router: all following CP/1 components register against it.
status_wait "Router" "after Core"
CORE_PUBLIC_PORT="$CORE_PORT" IATB_INDICATOR_PORT="$INDICATOR_PORT" IATB_MARKET_DATA_PORT="$MARKET_DATA_PORT" IATB_LIQUIDITY_PORT="$LIQUIDITY_PORT" IATB_FUNDAMENTAL_PORT="$FUNDAMENTAL_PORT" IATB_TRADING_ENGINE_PORT="$TRADING_ENGINE_PORT" IATB_FIREWALL_PORT="$FIREWALL_PORT" IATB_STRATEGY_PORT="$STRATEGY_PORT" IATB_RISK_ENGINE_PORT="$RISK_ENGINE_PORT" IATB_PORTFOLIO_PORT="$PORTFOLIO_PORT" IATB_SUPERVISOR_PORT="$SUPERVISOR_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" Core/Router/router.js >> "$ROUTER_LOG" 2>&1 &
ROUTER_PID=$!
require_service "Router" "$ROUTER_PORT" "/router-health" "\"router\"" "$ROUTER_LOG" 10

# 3. Security boundary before Market Data or Trading.
status_wait "Firewall" "before data/trading"
IATB_FIREWALL_PORT="$FIREWALL_PORT" IATB_TRADING_ENGINE_PORT="$TRADING_ENGINE_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" Core/Firewall/firewall_service.js >> "$FIREWALL_LOG" 2>&1 &
FIREWALL_PID=$!
require_service "Firewall" "$FIREWALL_PORT" "/health" "IA-TB Firewall Service" "$FIREWALL_LOG" 10
fw_threads_ok=0
for i in 1 2 3 4 5 6; do
  body="$(http_get "http://127.0.0.1:$FIREWALL_PORT/health")"
  echo "$body" | grep -q '"thread":1' && echo "$body" | grep -q '"thread":2' && { fw_threads_ok=1; break; }
  sleep 1
done
if [ "$fw_threads_ok" -ne 1 ]; then
  status_fail "Firewall workers" "threads 1/2 unavailable"
  cat "$FIREWALL_LOG" 2>/dev/null || true
  cleanup
  read -p "Appuie sur Entree pour fermer..."
  exit 1
fi
status_ok "Firewall workers" "Trading + Market Data"

# 4. Universal Market Data Collector (native CEX/DEX providers).
status_wait "Market Data Collector" "CEX/DEX registry"
IATB_MARKET_DATA_PORT="$MARKET_DATA_PORT" IATB_FIREWALL_PORT="$FIREWALL_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" MarketData/market_data_service.js >> "$MARKET_DATA_LOG" 2>&1 &
MARKET_DATA_PID=$!
require_service "Market Data Collector" "$MARKET_DATA_PORT" "/health" "IA-TB Market Data" "$MARKET_DATA_LOG" 12

# 5. Read/analysis engines consume Router + Market Data.
status_wait "Indicator Engine" "after Market Data"
IATB_INDICATOR_PORT="$INDICATOR_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" Indicators/Engine/indicator_service.js >> "$INDICATOR_LOG" 2>&1 &
INDICATOR_PID=$!
require_service "Indicator Engine" "$INDICATOR_PORT" "/health" "IA-TB Indicator Engine" "$INDICATOR_LOG" 10

if [ "$FUNDAMENTAL_READY" -eq 1 ]; then
  status_wait "Fundamental Engine" "after Router"
  IATB_FUNDAMENTAL_PORT="$FUNDAMENTAL_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" Fundamental/Engine/fundamental_service.js >> "$FUNDAMENTAL_LOG" 2>&1 &
  FUNDAMENTAL_PID=$!
  if ! wait_service "Fundamental Engine" "$FUNDAMENTAL_PORT" "/health" "IA-TB Fundamental Engine" "$FUNDAMENTAL_LOG" 12; then
    status_warn "Fundamental Engine" "disabled after failed boot"
    FUNDAMENTAL_READY=0
    [ -n "$FUNDAMENTAL_PID" ] && kill "$FUNDAMENTAL_PID" >/dev/null 2>&1 || true
    FUNDAMENTAL_PID=""
  fi
else
  status_skip "Fundamental Engine" "SQLite unavailable"
fi

status_wait "Liquidity Engine" "after Market Data"
IATB_LIQUIDITY_PORT="$LIQUIDITY_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" Liquidity/Engine/liquidity_service.js >> "$LIQUIDITY_LOG" 2>&1 &
LIQUIDITY_PID=$!
require_service "Liquidity Engine" "$LIQUIDITY_PORT" "/health" "IA-TB Liquidity Engine" "$LIQUIDITY_LOG" 10

# 6. Risk is online before Trading accepts any mutating path.
status_wait "Risk Engine" "before Trading"
IATB_RISK_ENGINE_PORT="$RISK_ENGINE_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" Risk/Engine/risk_service.js >> "$RISK_LOG" 2>&1 &
RISK_ENGINE_PID=$!
require_service "Risk Engine" "$RISK_ENGINE_PORT" "/health" "IA-TB Risk Engine" "$RISK_LOG" 10

status_wait "Trading Engine" "after Firewall + Risk"
IATB_TRADING_ENGINE_PORT="$TRADING_ENGINE_PORT" ROUTER_PORT="$ROUTER_PORT" IATB_TRADING_LIVE="0" "$NODE_BIN" services/trading-engine/trading_service.js >> "$TRADING_LOG" 2>&1 &
TRADING_ENGINE_PID=$!
require_service "Trading Engine" "$TRADING_ENGINE_PORT" "/health" "IA-TB Trading Engine" "$TRADING_LOG" 10

# 7. Portfolio can now sync Trading history and marks through Router.
status_wait "Portfolio Engine" "after Trading"
IATB_PORTFOLIO_PORT="$PORTFOLIO_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" Portfolio/Engine/portfolio_service.js >> "$PORTFOLIO_LOG" 2>&1 &
PORTFOLIO_PID=$!
require_service "Portfolio Engine" "$PORTFOLIO_PORT" "/health" "IA-TB Portfolio Engine" "$PORTFOLIO_LOG" 10

# 8. Strategy sees all analysis/risk/portfolio dependencies.
status_wait "Strategy Engine" "after Risk + Portfolio"
IATB_STRATEGY_PORT="$STRATEGY_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" Strategy/Engine/strategy_service.js >> "$STRATEGY_LOG" 2>&1 &
STRATEGY_PID=$!
require_service "Strategy Engine" "$STRATEGY_PORT" "/health" "IA-TB Strategy Engine v2" "$STRATEGY_LOG" 10

# 9. Supervisor orchestrates only once the runtime topology is ready.
status_wait "IA Supervisor" "last backend service"
IATB_SUPERVISOR_PORT="$SUPERVISOR_PORT" ROUTER_PORT="$ROUTER_PORT" "$NODE_BIN" Supervisor/supervisor_service.js >> "$SUPERVISOR_LOG" 2>&1 &
SUPERVISOR_PID=$!
require_service "IA Supervisor" "$SUPERVISOR_PORT" "/health" "IA-TB Supervisor" "$SUPERVISOR_LOG" 10

# 10. Public UI is always last.
status_wait "UI Service" "public gateway"
IATB_UI_PORT="$UI_PORT" CORE_PUBLIC_PORT="$CORE_PORT" ROUTER_PORT="$ROUTER_PORT" IATB_FIREWALL_PORT="$FIREWALL_PORT" IATB_AUTH_MODE="disabled" IATB_UI_BYPASS_ROLE="SUPERADMIN" "$NODE_BIN" UI/Gateway/ui_service.js >> "$UI_LOG" 2>&1 &
UI_PID=$!
require_service "UI Service" "$UI_PORT" "/ui-health" "IA-TB UI Service" "$UI_LOG" 10

section "[ 3/4 ]  COMMUNICATION VALIDATION"

router_state="$(http_get "http://127.0.0.1:$ROUTER_PORT/router-health")"
echo "$router_state" | grep -q '"router"' || {
  status_fail "Router topology" "health unavailable"
  cleanup
  read -p "Appuie sur Entree pour fermer..."
  exit 1
}
status_ok "Router topology" "Core → Router → Engines"

comm_state="$(http_get "http://127.0.0.1:$ROUTER_PORT/communication-health")"
if echo "$comm_state" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
  status_ok "CP/1 communication" "registry reachable"
else
  status_warn "CP/1 communication" "registry health incomplete"
fi

section "[ 4/4 ]  SYSTEM STATUS"

ONLINE_COUNT=12
[ "$FUNDAMENTAL_READY" -eq 1 ] && ONLINE_COUNT=$((ONLINE_COUNT+1))
printf "              ${C_GREEN}${C_BOLD}%s / 13 SERVICES ONLINE${C_RESET}\n" "$ONLINE_COUNT"
echo
printf "                 ${C_GREEN}${C_BOLD}IA-TB READY${C_RESET} · v%s %s\n" "$BUILD_VERSION" "$BUILD_STATUS"
echo
echo "  UI        http://127.0.0.1:$UI_PORT"
echo "  Core      http://127.0.0.1:$CORE_PORT"
echo "  Router    http://127.0.0.1:$ROUTER_PORT"
echo "  Supervisor http://127.0.0.1:$SUPERVISOR_PORT"
echo
echo "────────────────────────────────────────────────────────────────"
echo

open "http://127.0.0.1:$UI_PORT" >/dev/null 2>&1 || true

# Acces Internet temporaire optionnel.
# Le tunnel reste un outil externe au runtime : start.command ne fait que proposer
# de lancer Tools/Online_Access/start_online.command dans une nouvelle fenetre Terminal.
echo
printf "  Activer l'acces Internet temporaire (Cloudflare Tunnel) ? [o/N] "
read IATB_TUNNEL_REPLY
case "$IATB_TUNNEL_REPLY" in
  o|O|oui|OUI|y|Y|yes|YES)
    ONLINE_SCRIPT="$PWD/../Tools/Online_Access/start_online.command"
    if [ -f "$ONLINE_SCRIPT" ]; then
      chmod +x "$ONLINE_SCRIPT" >/dev/null 2>&1 || true
      ONLINE_SCRIPT_ABS="$(cd "$(dirname "$ONLINE_SCRIPT")" 2>/dev/null && pwd)/$(basename "$ONLINE_SCRIPT")"
      if [ -n "$ONLINE_SCRIPT_ABS" ]; then
        osascript -e 'tell application "Terminal"' -e "do script \"\\\"$ONLINE_SCRIPT_ABS\\\"\"" -e 'activate' -e 'end tell' >/dev/null 2>&1 &
        status_ok "Online Access" "launch requested"
        echo "         ↳ Une nouvelle fenetre Terminal va afficher le lien HTTPS."
      else
        status_warn "Online Access" "path unavailable"
      fi
    else
      status_warn "Online Access" "tool not found"
      echo "         ↳ Attendu: Tools/Online_Access/start_online.command"
    fi
    ;;
  *)
    status_skip "Online Access" "local only"
    ;;
esac

wait "$APP_PID"
