#!/bin/bash
cd "$(dirname "$0")" || exit 1

BUILD_VERSION="$(tr -d '[:space:]' < "$PWD/VERSION" 2>/dev/null)"
[ -n "$BUILD_VERSION" ] || BUILD_VERSION="2.0.0"
BUILD_STATUS="DEBUG"

# IA-TB Shutdown Console
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

shutdown_banner(){
  echo
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                                                              ║"
  echo "║                     IA TRADING BOT                           ║"
  printf "║                    v%-8s %-5s                       ║\n" "$BUILD_VERSION" "$BUILD_STATUS"
  echo "║                                                              ║"
  echo "║                  SYSTEM SHUTDOWN CONSOLE                     ║"
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
  if command -v nc >/dev/null 2>&1; then nc -z 127.0.0.1 "$port" >/dev/null 2>&1 && return 0; fi
  curl -s --connect-timeout 1 --max-time 1 "http://127.0.0.1:$port/" >/dev/null 2>&1 && return 0
  return 1
}
wait_port_free(){
  port="$1"; i=0
  while [ "$i" -lt 20 ]; do
    port_busy "$port" || return 0
    sleep 0.2
    i=$((i+1))
  done
  return 1
}
stop_known_on_port(){
  port="$1"
  a="$(http_get http://127.0.0.1:$port/api/health)"
  r="$(http_get http://127.0.0.1:$port/router-health)"
  k="$(http_get http://127.0.0.1:$port/health)"
  ui="$(http_get http://127.0.0.1:$port/ui-health)"
  pid=""; label=""
  if echo "$ui" | grep -q 'IA-TB UI Service'; then pid="$(json_pid "$ui")"; label="UI Service"
  elif echo "$r" | grep -q '"router"[[:space:]]*:[[:space:]]*true'; then pid="$(json_pid "$r")"; label="Router"
  elif echo "$k" | grep -q 'IA-TB Supervisor'; then pid="$(json_pid "$k")"; label="IA Supervisor"
  elif echo "$a" | grep -q 'IA-Trading-Bot'; then pid="$(json_pid "$a")"; label="Core"
  elif echo "$k" | grep -q 'Kraken Add-On'; then pid="$(json_pid "$k")"; label="Kraken Add-On"
  elif echo "$k" | grep -q 'IA-TB Indicator Engine'; then pid="$(json_pid "$k")"; label="Indicator Engine"
  elif echo "$k" | grep -q 'IA-TB Market Data'; then pid="$(json_pid "$k")"; label="Market Data"
  elif echo "$k" | grep -q 'IA-TB Liquidity Engine'; then pid="$(json_pid "$k")"; label="Liquidity Engine"
  elif echo "$k" | grep -q 'IA-TB Fundamental Engine'; then pid="$(json_pid "$k")"; label="Fundamental Engine"
  elif echo "$k" | grep -q 'IA-TB Trading Engine'; then pid="$(json_pid "$k")"; label="Trading Engine"
  elif echo "$k" | grep -q 'IA-TB Firewall Service'; then pid="$(json_pid "$k")"; label="Firewall Service"
  elif echo "$k" | grep -q 'IA-TB Strategy Engine v2'; then pid="$(json_pid "$k")"; label="Strategy Engine v2"
  elif echo "$k" | grep -q 'IA-TB Risk Engine'; then pid="$(json_pid "$k")"; label="Risk Manager Engine"
  elif echo "$k" | grep -q 'IA-TB Portfolio Engine'; then pid="$(json_pid "$k")"; label="Portfolio Engine"
  fi

  if [ -n "$pid" ]; then
    printf "         ${C_GRAY}↳ PID %s · port %s${C_RESET}\n" "$pid" "$port"
    kill "$pid" >/dev/null 2>&1 || true
    if ! wait_port_free "$port"; then
      status_warn "$label" "graceful stop timeout"
      printf "         ${C_GRAY}↳ PID %s · forcing shutdown${C_RESET}\n" "$pid"
      kill -9 "$pid" >/dev/null 2>&1 || true
      wait_port_free "$port" || true
    fi
  fi

  # Fallback limite a un service IA-TB qui a ete formellement reconnu par son endpoint health.
  if port_busy "$port" && [ -n "$label" ] && command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')"
    for x in $pids; do
      [ -n "$x" ] || continue
      status_warn "$label" "residual listener"
      printf "         ${C_GRAY}↳ PID %s · port %s · cleanup${C_RESET}\n" "$x" "$port"
      kill "$x" >/dev/null 2>&1 || true
    done
    wait_port_free "$port" || {
      for x in $pids; do [ -n "$x" ] && kill -9 "$x" >/dev/null 2>&1 || true; done
      wait_port_free "$port" || true
    }
  fi

  if port_busy "$port"; then
    if [ -n "$label" ]; then
      status_fail "$label" ":$port still occupied"
    else
      status_warn "Unknown process" ":$port still occupied"
      echo "         ↳ external process was not terminated"
    fi
    return 1
  fi
  return 0
}

shutdown_banner

section "[ 1/3 ]  SERVICE SHUTDOWN"

STOP_FAILURE=0

stop_service(){
  label="$1"
  port="$2"

  if ! port_busy "$port"; then
    status_skip "$label" "already offline"
    return 0
  fi

  status_wait "$label" "stopping"

  # Réutilise la fonction sécurisée du stop.command existant :
  # elle n'arrête qu'une instance reconnue comme appartenant à IA-TB.
  stop_known_on_port "$port"
  rc=$?

  if [ "$rc" -eq 0 ] && ! port_busy "$port"; then
    status_ok "$label" "stopped"
    return 0
  fi

  if port_busy "$port"; then
    status_fail "$label" ":$port still occupied"
    STOP_FAILURE=1
    return 1
  fi

  status_ok "$label" "stopped"
  return 0
}

# Ordre inverse des couches de démarrage :
# consommateurs / interfaces avant leurs dépendances.
stop_service "UI Service"          "8000" || true
stop_service "IA Supervisor"       "3000" || true
stop_service "Strategy Engine"     "8018" || true
stop_service "Portfolio Engine"    "8020" || true
stop_service "Trading Engine"      "8016" || true
stop_service "Risk Engine"         "8019" || true
stop_service "Liquidity Engine"    "8014" || true
stop_service "Fundamental Engine"  "8015" || true
stop_service "Indicator Engine"    "8012" || true
stop_service "Market Data"         "8013" || true
stop_service "Kraken Adapter"      "8011" || true
stop_service "Firewall"            "8017" || true
stop_service "Router"              "8021" || true
stop_service "Core"                "8001" || true


section "[ 2/3 ]  PORT VERIFICATION"

verify_port(){
  port="$1"
  label="$2"

  if port_busy "$port"; then
    status_fail "$label" ":$port OCCUPIED"
    STOP_FAILURE=1
  else
    status_ok "$label" ":$port FREE"
  fi
}

verify_port "8000" "UI Service"
verify_port "8001" "Core"
verify_port "8011" "Kraken Adapter"
verify_port "8012" "Indicator Engine"
verify_port "8013" "Market Data"
verify_port "8014" "Liquidity Engine"
verify_port "8015" "Fundamental Engine"
verify_port "8016" "Trading Engine"
verify_port "8017" "Firewall"
verify_port "8018" "Strategy Engine"
verify_port "8019" "Risk Engine"
verify_port "8020" "Portfolio Engine"
verify_port "8021" "Router"
verify_port "3000" "IA Supervisor"


section "[ 3/3 ]  SYSTEM STATUS"

if [ "$STOP_FAILURE" -eq 0 ]; then
  printf "              ${C_GREEN}${C_BOLD}14 / 14 SERVICES OFFLINE${C_RESET}\n"
  echo
  printf "                 ${C_GREEN}${C_BOLD}SUPERVISOR OFFLINE${C_RESET}\n"
  echo
  printf "                    ${C_GREEN}${C_BOLD}IA-TB STOPPED${C_RESET}\n"
  echo
  echo "────────────────────────────────────────────────────────────────"
  echo
  exit 0
fi

printf "              ${C_RED}${C_BOLD}SHUTDOWN INCOMPLETE${C_RESET}\n"
echo
status_fail "IA-TB" "one or more ports remain occupied"
echo
echo "────────────────────────────────────────────────────────────────"
echo
exit 1
