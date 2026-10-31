#!/bin/bash
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
NODE="$ROOT/.node/bin/node"
[ -x "$NODE" ] || NODE="$(command -v node)"
echo "=== IA-TB Fundamental V3 DEBUG ==="
FAIL=0
for f in \
  "$ROOT/Fundamental/Engine/fundamental_service.js" \
  "$ROOT/Fundamental/Engine/observability_v3.js" \
  "$ROOT/Fundamental/Engine/diagnostic_core.js" \
  "$ROOT/Fundamental/Engine/source_discovery.js" \
  "$ROOT/Fundamental/Engine/ai_synthesis.js" \
  "$ROOT/Core/Services/fundamental_ai_synthesis_v3.js" \
  "$ROOT/Core/Server/server.js" \
  "$ROOT/Frontend/JS/fundamental_controller_v3.js"
do
  echo "[CHECK] $f"
  "$NODE" --check "$f" || FAIL=1
done
echo "[TEST] static/runtime diagnostic"
"$NODE" "$ROOT/Fundamental/Tests/Debug/debug_fundamental_v3.js" || FAIL=1
if [ "$FAIL" -eq 0 ]; then echo "=== FUNDAMENTAL V3 DEBUG PASS ==="; else echo "=== FUNDAMENTAL V3 DEBUG FAIL ==="; fi
exit "$FAIL"
