#!/bin/bash
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUND="$ROOT/Fundamental"
NODE_BIN="$ROOT/.node/bin/node"
NPM_CLI="$ROOT/.node/lib/node_modules/npm/bin/npm-cli.js"
LOG_DIR="$ROOT/.runtime/logs"
LOG="$LOG_DIR/fundamental_sqlite_install.log"
cd "$ROOT" || exit 1
mkdir -p "$FUND" "$LOG_DIR"
check_sqlite(){
  "$NODE_BIN" -e "var p=require('./Fundamental/node_modules/better-sqlite3/package.json'); if(p.version!=='8.7.0')process.exit(2); var D=require('./Fundamental/node_modules/better-sqlite3'); var d=new D(':memory:'); var v=d.prepare('select sqlite_version() v').get().v; d.close(); console.log(v);" >/dev/null 2>&1
}
if [ ! -x "$NODE_BIN" ]; then echo "Node local introuvable" >> "$LOG"; exit 2; fi
if check_sqlite; then exit 0; fi
if [ ! -f "$NPM_CLI" ]; then echo "npm local introuvable" >> "$LOG"; exit 3; fi
printf '[%s] Installation explicite better-sqlite3@8.7.0 pour Node %s ABI %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$($NODE_BIN -v)" "$($NODE_BIN -p 'process.versions.modules')" >> "$LOG"
NO_UPDATE_NOTIFIER=1 npm_config_update_notifier=false npm_config_audit=false npm_config_fund=false \
  "$NODE_BIN" "$NPM_CLI" install --prefix "$FUND" --no-audit --no-fund --no-package-lock --save-exact better-sqlite3@8.7.0 >> "$LOG" 2>&1
rc=$?
if [ $rc -ne 0 ]; then printf '[%s] ECHEC npm rc=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$rc" >> "$LOG"; exit $rc; fi
if ! check_sqlite; then printf '[%s] ECHEC validation module\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"; exit 4; fi
printf '[%s] OK better-sqlite3 8.7.0\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"
exit 0
