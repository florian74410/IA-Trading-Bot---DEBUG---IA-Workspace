#!/bin/bash
# IA-TB - Online Access Console
# Outil independant du runtime IA-TB.
# Compatible macOS High Sierra / Intel (Bash 3.2).
# Expose uniquement 127.0.0.1:8000 via un Quick Tunnel Cloudflare.

cd "$(dirname "$0")" || exit 1
PORT="${IATB_UI_PORT:-8000}"
LEGACY_VERSION="2022.10.3"
LEGACY_ARCHIVE="cloudflared-${LEGACY_VERSION}-darwin-amd64.tgz"
LEGACY_URL="https://github.com/cloudflare/cloudflared/releases/download/${LEGACY_VERSION}/cloudflared-darwin-amd64.tgz"
LEGACY_BIN="./cloudflared-highsierra"
RUNTIME_DIR="./.runtime"
TUNNEL_LOG="$RUNTIME_DIR/cloudflared.log"

# Couleurs ANSI - compatibles Terminal.app / High Sierra.
if [ -t 1 ]; then
  C_RESET='\033[0m'
  C_BOLD='\033[1m'
  C_DIM='\033[2m'
  C_GREEN='\033[1;32m'
  C_CYAN='\033[1;36m'
  C_BLUE='\033[1;34m'
  C_YELLOW='\033[1;33m'
  C_RED='\033[1;31m'
  C_MAGENTA='\033[1;35m'
  C_GRAY='\033[0;90m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_GREEN=''; C_CYAN=''
  C_BLUE=''; C_YELLOW=''; C_RED=''; C_MAGENTA=''; C_GRAY=''
fi
TUNNEL_PID=""
PUBLIC_URL=""

pause_exit() {
  echo ""
  read -p "Appuie sur Entree pour fermer..."
  exit "${1:-1}"
}

banner() {
  clear
  printf "${C_CYAN}${C_BOLD}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                                                              ║"
  echo "║                 IA-TB · ONLINE ACCESS                       ║"
  echo "║                    CONTROL CONSOLE                           ║"
  echo "║                                                              ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  printf "${C_RESET}"
  printf "  ${C_GRAY}Secure temporary gateway · localhost → Internet${C_RESET}\n"
  echo ""
}
local_health() {
  curl -fsS --max-time 3 "http://127.0.0.1:$PORT/ui-health" >/dev/null 2>&1
}

tunnel_alive() {
  [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" >/dev/null 2>&1
}

stop_tunnel() {
  if tunnel_alive; then
    kill "$TUNNEL_PID" >/dev/null 2>&1 || true
    wait "$TUNNEL_PID" >/dev/null 2>&1 || true
  fi
  TUNNEL_PID=""
}

cleanup() {
  stop_tunnel
}
trap cleanup EXIT INT TERM

show_status() {
  echo ""
  printf "${C_BLUE}${C_BOLD}┌──────────────────────── LIVE STATUS ─────────────────────────┐${C_RESET}\n"
  if local_health; then
    printf "│  IA-TB LOCAL       ${C_GREEN}● ONLINE${C_RESET}                                │\n"
  else
    printf "│  IA-TB LOCAL       ${C_RED}● OFFLINE${C_RESET}                               │\n"
  fi
  if tunnel_alive; then
    printf "│  INTERNET TUNNEL   ${C_GREEN}● ONLINE${C_RESET}                                │\n"
  else
    printf "│  INTERNET TUNNEL   ${C_RED}● OFFLINE${C_RESET}                               │\n"
  fi
  printf "│  LOCAL             ${C_CYAN}http://127.0.0.1:%-5s${C_RESET}                  │\n" "$PORT"
  if [ -n "$PUBLIC_URL" ]; then
    printf "└──────────────────────────────────────────────────────────────┘\n"
    printf "  ${C_YELLOW}${C_BOLD}PUBLIC URL${C_RESET}  ${C_CYAN}%s${C_RESET}\n" "$PUBLIC_URL"
  else
    printf "└──────────────────────────────────────────────────────────────┘\n"
    printf "  ${C_YELLOW}PUBLIC URL${C_RESET}  indisponible\n"
  fi
  if [ -f "$TUNNEL_LOG" ]; then
    CONNECTIONS="$(grep -c 'registered connIndex=' "$TUNNEL_LOG" 2>/dev/null || echo 0)"
    printf "  ${C_MAGENTA}Cloudflare links${C_RESET} : %s connexion(s) enregistree(s)\n" "$CONNECTIONS"
  fi
  echo ""
}
show_help() {
  printf "${C_BLUE}${C_BOLD}┌──────────────────────── COMMANDES ───────────────────────────┐${C_RESET}\n"
  printf "│  ${C_CYAN}status${C_RESET}       Tableau de bord du tunnel                     │\n"
  printf "│  ${C_CYAN}url${C_RESET}          Afficher l'adresse publique                   │\n"
  printf "│  ${C_CYAN}connections${C_RESET}  Connexions Cloudflare                        │\n"
  printf "│  ${C_CYAN}logs${C_RESET}         30 derniers evenements du tunnel              │\n"
  printf "│  ${C_CYAN}health${C_RESET}       Diagnostic IA-TB + tunnel                     │\n"
  printf "│  ${C_CYAN}clear${C_RESET}        Rafraichir la console                         │\n"
  printf "│  ${C_CYAN}help${C_RESET}         Afficher cette aide                           │\n"
  printf "│  ${C_RED}stop${C_RESET}         Couper immediatement l'acces Internet          │\n"
  printf "└──────────────────────────────────────────────────────────────┘\n"
  echo ""
}
banner

# 1) IA-TB doit deja etre demarre.
if ! local_health; then
  echo "[ERREUR] IA-TB ne repond pas sur http://127.0.0.1:$PORT"
  echo "Demarre d'abord IA-TB avec son start.command."
  pause_exit 1
fi
echo "[OK] IA-TB repond sur 127.0.0.1:$PORT"

# 2) Chercher un cloudflared qui s'execute reellement.
CLOUDFLARED=""
for candidate in "$LEGACY_BIN" "./cloudflared" "$HOME/bin/cloudflared" "/usr/local/bin/cloudflared"; do
  if [ -x "$candidate" ]; then
    "$candidate" --version >/dev/null 2>&1
    RC=$?
    if [ "$RC" -eq 0 ]; then
      CLOUDFLARED="$candidate"
      break
    fi
  fi
done

# 3) High Sierra : installation locale du binaire compatible si necessaire.
if [ -z "$CLOUDFLARED" ]; then
  echo "[INFO] Installation locale de cloudflared $LEGACY_VERSION pour High Sierra..."
  rm -f "$LEGACY_ARCHIVE"
  if ! curl -fL --connect-timeout 15 -o "$LEGACY_ARCHIVE" "$LEGACY_URL"; then
    echo "[ERREUR] Telechargement impossible."
    pause_exit 1
  fi
  rm -rf .cloudflared_extract
  mkdir -p .cloudflared_extract
  if ! tar -xzf "$LEGACY_ARCHIVE" -C .cloudflared_extract; then
    rm -rf .cloudflared_extract
    echo "[ERREUR] Archive cloudflared invalide."
    pause_exit 1
  fi
  if [ ! -f .cloudflared_extract/cloudflared ]; then
    rm -rf .cloudflared_extract
    echo "[ERREUR] Binaire absent de l'archive."
    pause_exit 1
  fi
  mv .cloudflared_extract/cloudflared "$LEGACY_BIN"
  rm -rf .cloudflared_extract
  rm -f "$LEGACY_ARCHIVE"
  chmod +x "$LEGACY_BIN"
  if ! "$LEGACY_BIN" --version >/dev/null 2>&1; then
    echo "[ERREUR] cloudflared $LEGACY_VERSION ne peut pas s'executer sur ce Mac."
    pause_exit 1
  fi
  CLOUDFLARED="$LEGACY_BIN"
fi

echo "[OK] cloudflared : $CLOUDFLARED"
"$CLOUDFLARED" --version
mkdir -p "$RUNTIME_DIR"
: > "$TUNNEL_LOG"

echo ""
echo "[INFO] Creation du tunnel HTTPS temporaire..."
"$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Attendre jusqu'a 30 secondes l'URL Quick Tunnel.
I=0
while [ "$I" -lt 30 ]; do
  if ! tunnel_alive; then
    echo "[ERREUR] Le tunnel s'est arrete pendant son demarrage."
    tail -30 "$TUNNEL_LOG" 2>/dev/null
    pause_exit 1
  fi
  PUBLIC_URL="$(grep -Eo 'https://[A-Za-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)"
  [ -n "$PUBLIC_URL" ] && break
  sleep 1
  I=$((I + 1))
done

if [ -z "$PUBLIC_URL" ]; then
  echo "[ERREUR] Aucune URL publique recue apres 30 secondes."
  tail -30 "$TUNNEL_LOG" 2>/dev/null
  pause_exit 1
fi

banner
printf "\${C_GREEN}\${C_BOLD}[ OK ] Tunnel Internet actif.\${C_RESET}\\n"
echo ""
printf " \${C_YELLOW}\${C_BOLD}URL PUBLIQUE :\${C_RESET}\\n"
printf " \${C_CYAN}\${C_BOLD}%s\${C_RESET}\\n" "$PUBLIC_URL"
echo ""
echo " Cette URL est temporaire et publique : partage-la uniquement"
echo " avec la personne autorisee. 'stop' coupe immediatement l'acces."
show_status
show_help

# Console interactive. cloudflared reste en arriere-plan et ecrit dans TUNNEL_LOG.
while tunnel_alive; do
  printf "\${C_GREEN}\${C_BOLD}ONLINE\${C_RESET}\${C_CYAN} > \${C_RESET}"
  if ! read CMD; then
    break
  fi
  case "$CMD" in
    status)
      show_status
      ;;
    url)
      echo ""
      echo "$PUBLIC_URL"
      echo ""
      ;;
    connections)
      echo ""
      grep 'registered connIndex=' "$TUNNEL_LOG" 2>/dev/null | tail -10
      echo ""
      ;;
    logs)
      echo ""
      echo "------------------- CLOUDFARE LOGS -------------------------"
      tail -30 "$TUNNEL_LOG" 2>/dev/null
      echo "------------------------------------------------------------"
      echo ""
      ;;
    health)
      echo ""
      if local_health; then echo "[OK] IA-TB local ONLINE"; else echo "[ERREUR] IA-TB local OFFLINE"; fi
      if tunnel_alive; then echo "[OK] Tunnel ONLINE"; else echo "[ERREUR] Tunnel OFFLINE"; fi
      echo ""
      ;;
    clear)
      banner
      show_status
      ;;
    help|?)
      show_help
      ;;
    stop|quit|exit)
      echo ""
      echo "[INFO] Arret du tunnel..."
      stop_tunnel
      echo "[OK] Acces Internet coupe."
      break
      ;;
    "")
      ;;
    *)
      echo "Commande inconnue : $CMD"
      echo "Tape 'help' pour voir les commandes."
      ;;
  esac
done

if [ -n "$TUNNEL_PID" ]; then
  echo ""
  echo "[INFO] Le tunnel s'est arrete."
fi
cleanup
echo ""
echo "IA-TB reste actif localement. Seul l'acces Internet est coupe."
read -p "Appuie sur Entree pour fermer..."
exit 0
