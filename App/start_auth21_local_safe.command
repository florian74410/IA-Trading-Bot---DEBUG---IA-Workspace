#!/usr/bin/env bash
# Auth21 local SAFE smoke-test; unlike start.command, never kills arbitrary services.
set -Eeuo pipefail
cd "$(dirname "$0")"
PRIVATE="${IATB_AUTH21_LOCAL_PRIVATE:-$HOME/IA-TB-v23-Auth21-private}"
[ -f "$PRIVATE/data/Database/clients.sqlite" ] || { echo "Base Auth21 introuvable"; exit 1; }
[ -f "$PRIVATE/data/Security/client_master.key" ] || { echo "Clé Auth21 introuvable"; exit 1; }
[ -f "$PRIVATE/tls/localhost.crt" ] && [ -f "$PRIVATE/tls/localhost.key" ] || { echo "TLS local absent"; exit 1; }
[ -d node_modules ] || { echo "Dépendances manquantes: cd App && npm ci"; exit 1; }
NODE="$(command -v node)"
[[ "$("$NODE" -v)" == v22.* ]] || { echo "Node 22 requis"; exit 1; }
PORTS=(8000 8001 8012 8013 8014 8015 8016 8017 8018 8019 8020 8021 3000)
for port in "${PORTS[@]}"; do
 if (echo >"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then echo "Port $port déjà utilisé : arrêter proprement l'ancienne instance, aucun processus n'a été tué"; exit 1; fi
done
umask 077
mkdir -p "$PRIVATE/runtime/logs"
export IATB_DATA_ROOT="$PRIVATE/data"
export IATB_RUNTIME_ROOT="$PRIVATE/runtime"
export IATB_AUTH_MODE=authenticated
export IATB_DEPLOYMENT_MODE=AUTHENTICATED
export IATB_AUTH_ORIGIN=https://localhost:8000
export IATB_AUTH_TLS_CERT="$PRIVATE/tls/localhost.crt"
export IATB_AUTH_TLS_KEY="$PRIVATE/tls/localhost.key"
export IATB_RELEASE_VERSION="$(tr -d '[:space:]' < VERSION)"
export IATB_TRADING_LIVE=0
export IATB_AUTH21_TRADING_ADMIN_BRIDGE="${IATB_AUTH21_TRADING_ADMIN_BRIDGE:-0}"
export IATB_AUTH21_TRADING_ADMIN_REQUESTED="$IATB_AUTH21_TRADING_ADMIN_BRIDGE"
if P3_PREFLIGHT="$("$NODE" Tools/CLI/trading_p3_preflight.js)"; then
 echo "Pont ADMIN P3 — $P3_PREFLIGHT"
else
 echo "Pont ADMIN P3 : activation refusée — $P3_PREFLIGHT"
 export IATB_AUTH21_TRADING_ADMIN_BRIDGE=0
fi
export IATB_DEBUG_MODE=0
export IATB_PORT=8001 CORE_PUBLIC_PORT=8001 IATB_UI_PORT=8000
export ROUTER_PORT=8021 IATB_FIREWALL_PORT=8017 IATB_TRADING_ENGINE_PORT=8016
export IATB_INDICATOR_PORT=8012 IATB_MARKET_DATA_PORT=8013
export IATB_LIQUIDITY_PORT=8014 IATB_FUNDAMENTAL_PORT=8015
export IATB_STRATEGY_PORT=8018 IATB_RISK_ENGINE_PORT=8019
export IATB_PORTFOLIO_PORT=8020 IATB_SUPERVISOR_PORT=3000
PIDS=()
cleanup(){
 echo "Arrêt des processus lancés par cette console..."
 for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
 wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
launch(){
 local name="$1" file="$2"
 case "$name" in
  core) "$NODE" "$file" >>"$PRIVATE/runtime/logs/$name.log" 2>&1 & ;;
  firewall|trading)
   if [[ "$IATB_AUTH21_TRADING_ADMIN_BRIDGE" == 1 ]]; then
    "$NODE" "$file" >>"$PRIVATE/runtime/logs/$name.log" 2>&1 &
   else
    env -u IATB_AUTH21_TRADING_IPC_KEY_FILE -u IATB_AUTH21_TRADING_IPC_KEY_ROOT "$NODE" "$file" >>"$PRIVATE/runtime/logs/$name.log" 2>&1 &
   fi ;;
  *) env -u IATB_AUTH21_TRADING_IPC_KEY_FILE -u IATB_AUTH21_TRADING_IPC_KEY_ROOT "$NODE" "$file" >>"$PRIVATE/runtime/logs/$name.log" 2>&1 & ;;
 esac
 PIDS+=("$!")
 sleep 0.6
 if ! kill -0 "${PIDS[-1]}" 2>/dev/null; then echo "ECHEC $name : voir $PRIVATE/runtime/logs/$name.log"; return 1; fi
 echo "[START] $name (PID ${PIDS[-1]})"
}
launch core Core/Server/server.js
sleep 2
curl --cacert "$IATB_AUTH_TLS_CERT" -fsS --max-time 5 https://localhost:8001/api/health >/dev/null || { echo "Core Auth21 ne répond pas en HTTPS"; exit 1; }
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
sleep 2
curl --cacert "$IATB_AUTH_TLS_CERT" -fsS --max-time 5 https://localhost:8000/ui-health || { echo "UI indisponible, consulter les logs"; exit 1; }
echo
echo "IA-TB Auth21 SAFE : https://localhost:8000"
echo "Trading LIVE=0 ; diagnostic P3 complet disponible dans ADMIN → Maintenance (session ADMIN requise)."
echo "Ctrl+C pour arrêter uniquement les processus de cette session."
while :; do
 for pid in "${PIDS[@]}"; do
  if ! kill -0 "$pid" 2>/dev/null; then echo "Un service s'est arrêté : consulter $PRIVATE/runtime/logs"; exit 1; fi
 done
 sleep 3
done
