#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1

REQ_VERSION="v16.20.2"
ARCHIVE_NAME="node-v16.20.2-darwin-x64.tar.gz"
NODE_RUNTIME_DIR="$PWD/NodeRuntime"
LEGACY_RUNTIME_DIR="$PWD/Runtime"
ARCHIVE="$NODE_RUNTIME_DIR/$ARCHIVE_NAME"
LEGACY_ARCHIVE="$LEGACY_RUNTIME_DIR/$ARCHIVE_NAME"
URL="https://nodejs.org/download/release/v16.20.2/$ARCHIVE_NAME"
EXPECTED_SHA="d7a46eaf2b57ffddeda16ece0d887feb2e31a91ad33f8774da553da0249dc4a6"

# Fondation runtime applicative. Aucun moteur n'y est encore migre :
# ces dossiers deviennent seulement les emplacements canoniques futurs.
mkdir -p "$PWD/.runtime/logs" \
         "$PWD/.runtime/state" \
         "$PWD/.runtime/database" \
         "$PWD/.runtime/cache" \
         "$PWD/.runtime/config" \
         "$PWD/.runtime/pids" \
         "$PWD/.runtime/updates"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Ce runtime local est prevu pour macOS Intel."
fi

mkdir -p "$NODE_RUNTIME_DIR"

# Migration transparente depuis l'ancien dossier Runtime/ afin d'eviter
# de retelecharger l'archive Node sur une installation existante.
if [ ! -f "$ARCHIVE" ] && [ -f "$LEGACY_ARCHIVE" ]; then
  echo "Migration du runtime Node : Runtime -> NodeRuntime..."
  mv "$LEGACY_ARCHIVE" "$ARCHIVE"
fi
# Supprime l'ancien dossier uniquement s'il est devenu vide.
rmdir "$LEGACY_RUNTIME_DIR" >/dev/null 2>&1 || true

need_install=1
if [ -x "$PWD/.node/bin/node" ]; then
  current="$($PWD/.node/bin/node -v 2>/dev/null || true)"
  if [ "$current" = "$REQ_VERSION" ]; then
    need_install=0
  fi
fi

if [ "$need_install" -eq 0 ]; then
  echo "Runtime local Node $REQ_VERSION deja installe."
  exit 0
fi

echo "Installation/reinstallation du runtime local Node $REQ_VERSION..."

if [ ! -f "$ARCHIVE" ]; then
  echo "Telechargement du runtime officiel Node.js..."
  tmp="$ARCHIVE.part"
  rm -f "$tmp"
  if ! curl -L --fail --retry 3 --connect-timeout 20 "$URL" -o "$tmp"; then
    echo "ERREUR: impossible de telecharger Node.js."
    echo "Telecharge manuellement $ARCHIVE_NAME depuis nodejs.org et place-le dans le dossier NodeRuntime, puis relance start.command."
    rm -f "$tmp"
    exit 1
  fi
  mv "$tmp" "$ARCHIVE"
fi

actual="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
if [ "$actual" != "$EXPECTED_SHA" ]; then
  echo "ERREUR: SHA-256 du runtime Node incorrect."
  echo "Attendu: $EXPECTED_SHA"
  echo "Obtenu : $actual"
  exit 1
fi

rm -rf "$PWD/.node" "$NODE_RUNTIME_DIR/.node-install"
mkdir -p "$NODE_RUNTIME_DIR/.node-install"
if ! tar -xzf "$ARCHIVE" -C "$NODE_RUNTIME_DIR/.node-install"; then
  echo "ERREUR: extraction du runtime impossible."
  exit 1
fi
mv "$NODE_RUNTIME_DIR/.node-install/node-v16.20.2-darwin-x64" "$PWD/.node"
rm -rf "$NODE_RUNTIME_DIR/.node-install"
chmod +x "$PWD/.node/bin/node" 2>/dev/null || true

if [ ! -x "$PWD/.node/bin/node" ]; then
  echo "ERREUR: runtime local incomplet."
  exit 1
fi

echo "Runtime local installe: $($PWD/.node/bin/node -v)"
