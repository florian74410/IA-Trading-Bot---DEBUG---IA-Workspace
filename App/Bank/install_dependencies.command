#!/bin/bash
set -u
cd "$(dirname "$0")/.." || exit 1
NODE_BIN="$PWD/.node/bin/node"
NPM_BIN="$PWD/.node/bin/npm"
PKG="$PWD/Bank/package.json"
ETHERS_PKG="$PWD/Bank/node_modules/ethers/package.json"

if [ ! -x "$NODE_BIN" ] || [ ! -x "$NPM_BIN" ]; then
  echo "Bank signer: runtime Node/npm indisponible."
  exit 1
fi

if [ -f "$ETHERS_PKG" ]; then
  ver="$("$NODE_BIN" -e "try{console.log(require('./Bank/node_modules/ethers/package.json').version)}catch(e){}" 2>/dev/null || true)"
  if [ "$ver" = "5.7.2" ]; then
    echo "Bank signer: ethers $ver ready."
    exit 0
  fi
fi

echo "Bank signer: installation ethers 5.7.2..."
"$NPM_BIN" --prefix "$PWD/Bank" install --omit=dev --no-audit --no-fund --loglevel=error
exit $?
