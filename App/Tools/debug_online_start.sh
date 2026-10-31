#!/usr/bin/env bash
# Dedicated authenticated DEBUG runtime. Never starts the production launcher.
set -Eeuo pipefail
cd /opt/iatb/App
umask 077
: "${IATB_DATA_ROOT:?Missing isolated DEBUG data root}"
: "${IATB_RUNTIME_ROOT:?Missing isolated DEBUG runtime root}"
: "${IATB_AUTH_ORIGIN:?Missing HTTPS origin}"
: "${IATB_AUTH_TLS_CERT:?Missing dedicated TLS certificate}"
: "${IATB_AUTH_TLS_KEY:?Missing dedicated TLS key}"
[[ "$IATB_AUTH_MODE" == "authenticated" ]] || { echo "AUTH MUST BE ENABLED" >&2; exit 10; }
[[ "$IATB_DEPLOYMENT_MODE" == "AUTHENTICATED" ]] || exit 11
[[ "$IATB_TRADING_LIVE" == "0" ]] || exit 12
[[ "$IATB_DATA_ROOT" == /debug-private/data ]] || exit 13
[[ "$IATB_RUNTIME_ROOT" == /debug-private/runtime ]] || exit 14
test -f "$IATB_AUTH_TLS_CERT" && test -f "$IATB_AUTH_TLS_KEY"
mkdir -p "$IATB_RUNTIME_ROOT/logs"
pids=()
stop() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap stop EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
launch() {
  local name="$1" path="$2"
  node "$path" >>"$IATB_RUNTIME_ROOT/logs/$name.log" 2>&1 &
  pids+=("$!")
  sleep 0.7
  kill -0 "${pids[-1]}" 2>/dev/null || { echo "FAILED: $name (inspect log)" >&2; return 1; }
  echo "[DEBUG] started $name"
}
# All canonical engine ports remain on loopback INSIDE the private Docker namespace.
export IATB_PORT=8001 CORE_PUBLIC_PORT=8001 IATB_UI_PORT=8000
export ROUTER_PORT=8021 IATB_FIREWALL_PORT=8017 IATB_TRADING_ENGINE_PORT=8016
export IATB_INDICATOR_PORT=8012 IATB_MARKET_DATA_PORT=8013
export IATB_LIQUIDITY_PORT=8014 IATB_FUNDAMENTAL_PORT=8015
export IATB_STRATEGY_PORT=8018 IATB_RISK_ENGINE_PORT=8019
export IATB_PORTFOLIO_PORT=8020 IATB_SUPERVISOR_PORT=3000
export IATB_DEBUG_BOOTSTRAP=0 IATB_DEBUG_MODE=0 IATB_AUTH21_TRADING_ADMIN_BRIDGE=0

launch core Core/Server/server.js
sleep 2
launch router Core/Router/router.js
launch firewall Core/Firewall/firewall_service.js
launch marketdata MarketData/market_data_service.js
launch indicator Indicators/Engine/indicator_service.js
launch fundamental Fundamental/Engine/fundamental_service.js
launch liquidity Liquidity/Engine/liquidity_service.js
launch risk Risk/Engine/risk_service.js
launch trading services/trading-engine/trading_service.js
launch portfolio Portfolio/Engine/portfolio_service.js
launch strategy Strategy/Engine/strategy_service.js
launch supervisor Supervisor/supervisor_service.js
launch ui UI/Gateway/ui_service.js
# TLS stream forwarder: maps host loopback port 18000 to internal UI loopback 8000.
# This never disables Auth21 and never accesses Docker/RELEASE.
launch edge Tools/debug_online_forward.js
echo "[DEBUG] all processes started. Live trading disabled."
while :; do
  for pid in "${pids[@]}"; do kill -0 "$pid" 2>/dev/null || { echo "Unexpected child exit; stopping stack" >&2; exit 1; }; done
  sleep 3
done
