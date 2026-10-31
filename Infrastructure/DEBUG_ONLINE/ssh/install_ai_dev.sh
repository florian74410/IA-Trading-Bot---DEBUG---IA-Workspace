#!/usr/bin/env bash
# Install a NEW non-admin SSH file-exchange account for IA-TB drafts.
# Invocation: sudo bash install_ai_dev.sh BASE64_ENCODED_ED25519_PUBLIC_KEY
set -Eeuo pipefail
umask 077
[[ "$EUID" -eq 0 ]] || { echo "Root via sudo required" >&2; exit 1; }
[[ "${1:-}" =~ ^[A-Za-z0-9+/=]+$ ]] || { echo "Expected base64 public key" >&2; exit 1; }
[[ -d /srv/iatb-debug/online ]] || { echo "DEBUG environment not found; abort" >&2; exit 1; }

ACCOUNT=iatb-ai-dev
HOME_DIR=/var/lib/iatb-ai-dev
GATEWAY=/usr/local/libexec/iatb-ai-dev-gateway
SOURCE_URL='https://raw.githubusercontent.com/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace/71f65f8a961f7a9340cd9a03732111a5a4943345/Infrastructure/DEBUG_ONLINE/ssh/ai_dev_gateway.py'
PUBLIC_KEY="$(printf '%s' "$1" | base64 --decode)"
read -r KEY_TYPE KEY_BODY _COMMENT <<<"$PUBLIC_KEY"
[[ "$KEY_TYPE" == "ssh-ed25519" && "$KEY_BODY" =~ ^[A-Za-z0-9+/]{40,}={0,3}$ ]] || {
  echo "Valid Ed25519 public key required" >&2; exit 1;
}

if id "$ACCOUNT" >/dev/null 2>&1; then
  [[ "$(getent passwd "$ACCOUNT" | cut -d: -f6)" == "$HOME_DIR" ]] || {
    echo "Existing account home does not match; refusing changes" >&2; exit 1;
  }
else
  [[ ! -e "$HOME_DIR" && ! -L "$HOME_DIR" ]] || {
    echo "Home already exists; refusing changes" >&2; exit 1;
  }
  useradd --system --user-group --create-home --home-dir "$HOME_DIR" --shell /bin/sh "$ACCOUNT"
fi
PRIMARY_GROUP="$(id -gn "$ACCOUNT")"
[[ "$(id -nG "$ACCOUNT" | wc -w)" -eq 1 ]] || {
  echo "Unexpected supplementary groups; abort" >&2; exit 1;
}
[[ "$PRIMARY_GROUP" == "$ACCOUNT" ]] || {
  echo "Unexpected primary group; abort" >&2; exit 1;
}
# No interactive password or password-based SSH login, but account must not be locked.
usermod --password '*' "$ACCOUNT"
[[ ! -L "$HOME_DIR" && ! -L "$HOME_DIR/.ssh" && ! -L "$HOME_DIR/workspace" ]] || {
  echo "Unsafe home symlink" >&2; exit 1;
}
install -d -o root -g root -m 0755 /usr/local/libexec
[[ ! -L "$GATEWAY" ]] || { echo "Unsafe gateway link" >&2; exit 1; }
TMP="$(mktemp /tmp/iatb-ai-gateway.XXXXXXXX)"
trap 'rm -f "$TMP"' EXIT
curl --fail --silent --show-error --location "$SOURCE_URL" -o "$TMP"
python3 -m py_compile "$TMP"
install -o root -g root -m 0755 "$TMP" "$GATEWAY"
install -d -o "$ACCOUNT" -g "$PRIMARY_GROUP" -m 0700 "$HOME_DIR" "$HOME_DIR/.ssh"
install -d -o "$ACCOUNT" -g "$PRIMARY_GROUP" -m 0700 \
  "$HOME_DIR/workspace" "$HOME_DIR/workspace/drafts" \
  "$HOME_DIR/workspace/patches" "$HOME_DIR/workspace/reports"
AUTHORIZED="$HOME_DIR/.ssh/authorized_keys"
if [[ -L "$AUTHORIZED" ]]; then
  echo "Unsafe authorized_keys link" >&2; exit 1
fi
TEMP_AUTH="$(mktemp "$HOME_DIR/.ssh/.authorized_keys.XXXXXXXX")"
printf 'restrict,command="%s" %s %s iatb-ai-dev\n' "$GATEWAY" "$KEY_TYPE" "$KEY_BODY" > "$TEMP_AUTH"
chown "$ACCOUNT:$PRIMARY_GROUP" "$TEMP_AUTH"
chmod 0600 "$TEMP_AUTH"
mv -f "$TEMP_AUTH" "$AUTHORIZED"
echo "IA-TB AI DEV installed: $ACCOUNT"
echo "HOME=$HOME_DIR"
echo "Allowed SSH commands: ping/list/read/write in isolated workspace only."
echo "No sudo, Docker, shell, port-forwarding, or production data access through this gateway."
