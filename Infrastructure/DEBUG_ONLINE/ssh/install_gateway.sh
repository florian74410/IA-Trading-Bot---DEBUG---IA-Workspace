#!/usr/bin/env bash
# Run as root via the owner's existing ADMIN SSH session. SSH key is PUBLIC only.
# Creates a dedicated unprivileged SSH identity, WITHOUT Docker/sudo permissions.
set -Eeuo pipefail
umask 077
[[ "${EUID}" -eq 0 ]] || { echo 'Must run as root via sudo' >&2; exit 1; }
[[ "${1:-}" =~ ^[A-Za-z0-9+/=]+$ ]] || { echo 'Invalid public-key encoding' >&2; exit 1; }
[[ -d /srv/iatb-debug ]] || { echo 'DEBUG root not found; refusing to create' >&2; exit 1; }
ACCOUNT='iatb-debug-ci'
HOME_DIR='/srv/iatb-debug/ssh-ci'
GATEWAY='/usr/local/libexec/iatb-debug-ssh-gateway'
SSH_DIR="$HOME_DIR/.ssh"
PUBLIC_KEY="$(printf '%s' "$1" | base64 --decode)"
read -r TYPE BLOB COMMENT <<<"$PUBLIC_KEY"
[[ "$TYPE" == 'ssh-ed25519' && "$BLOB" =~ ^[A-Za-z0-9+/=]{60,}$ ]] || {
  echo 'Expected Ed25519 public key' >&2; exit 1;
}
# Restrict to key type, base64 payload and fixed comment; ignore untrusted comments.
AUTHORIZED_KEY="$TYPE $BLOB iatb-debug-github-actions"
if id "$ACCOUNT" >/dev/null 2>&1; then
  [[ "$(getent passwd "$ACCOUNT" | cut -d: -f6)" == "$HOME_DIR" ]] || {
    echo 'Existing account home mismatch: abort' >&2; exit 1;
  }
else
  useradd --system --user-group --create-home --home-dir "$HOME_DIR" --shell /bin/sh "$ACCOUNT"
fi
PRIMARY_GROUP="$(id -gn "$ACCOUNT")"
# No privilege grants; no docker group, no sudoers rules, no production mounts.
id -nG "$ACCOUNT" | tr ' ' '\n' | grep -Exq "$PRIMARY_GROUP" || exit 1
[[ "$(id -nG "$ACCOUNT" | wc -w)" -eq 1 ]] || {
  echo 'Unexpected supplementary groups for SSH identity: abort' >&2; exit 1;
}
install -d -o root -g root -m 0755 /usr/local/libexec
if [[ ! -f "$GATEWAY" && -e "$GATEWAY" ]]; then
  echo 'Unsafe gateway destination' >&2; exit 1
fi
TMP_GATEWAY="$(mktemp /tmp/iatb-debug-ssh-gateway.XXXXXXXX)"
trap 'rm -f "$TMP_GATEWAY"' EXIT
curl --fail --silent --show-error --location \
  'https://raw.githubusercontent.com/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace/69df841987857c920060146e96b370e65a33b603/Infrastructure/DEBUG_ONLINE/ssh/ssh_gateway.sh' \
  -o "$TMP_GATEWAY"
/bin/sh -n "$TMP_GATEWAY"
install -o root -g root -m 0755 "$TMP_GATEWAY" "$GATEWAY"
install -d -o "$ACCOUNT" -g "$PRIMARY_GROUP" -m 0700 "$HOME_DIR" "$SSH_DIR"
TMP_AUTH="$(mktemp "$SSH_DIR/.authorized_keys.XXXXXX")"
printf 'restrict,command="%s" %s\n' "$GATEWAY" "$AUTHORIZED_KEY" > "$TMP_AUTH"
chown "$ACCOUNT:$PRIMARY_GROUP" "$TMP_AUTH"
chmod 0600 "$TMP_AUTH"
mv -f "$TMP_AUTH" "$SSH_DIR/authorized_keys"
printf '%s\n' 'SSH DEBUG identity installed. Restricted to the ping command.'
printf '%s\n' 'No Docker access, no sudoers rights, no RELEASE access; SSH service/firewall unchanged.'
