#!/usr/bin/env bash
# One-time owner-authorized installation: fixed DEBUG operations only.
# Does not touch sshd_config, sshd service, firewall, Docker groups or RELEASE.
set -Eeuo pipefail
umask 077
[[ "$EUID" -eq 0 ]] || { echo 'Use sudo bash for owner-authorized install' >&2; exit 1; }
ACCOUNT='iatb-debug-ci'
HOME_DIR='/var/lib/iatb-debug-ci'
ROOT='/usr/local/libexec'
GATEWAY="$ROOT/iatb-debug-ssh-gateway"
OPERATOR="$ROOT/iatb-debug-operator"
SUDOERS='/etc/sudoers.d/iatb-debug-ci-operator'
GATEWAY_URL='https://raw.githubusercontent.com/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace/85acf3ae70118a9c763f431039fd1486a1850074/Infrastructure/DEBUG_ONLINE/ssh/ssh_gateway.sh'
OPERATOR_URL='https://raw.githubusercontent.com/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace/fb9e6bbc3fc02fdda64d38cfc92701ff54964abf/Infrastructure/DEBUG_ONLINE/ssh/debug_operator.py'
[[ -d /srv/iatb-debug/online/source && -d /srv/iatb-debug/online/private ]] || {
  echo 'Isolated DEBUG runtime absent; abort' >&2; exit 1;
}
id "$ACCOUNT" >/dev/null
[[ "$(getent passwd "$ACCOUNT" | cut -d: -f6)" == "$HOME_DIR" ]] || {
  echo 'Unexpected SSH CI account home; abort' >&2; exit 1;
}
[[ "$(id -nG "$ACCOUNT" | wc -w)" == '1' ]] || {
  echo 'Account has unexpected supplementary groups; abort' >&2; exit 1;
}
[[ ! -L "$ROOT" && ! -L "$GATEWAY" && ! -L "$OPERATOR" && ! -L "$SUDOERS" ]] || {
  echo 'Refusing unsafe symlink' >&2; exit 1;
}
command -v visudo >/dev/null || { echo 'visudo required' >&2; exit 1; }
install -d -o root -g root -m 0755 "$ROOT"
TMP="$(mktemp -d /tmp/iatb-debug-ops.XXXXXXXX)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$GATEWAY_URL" -o "$TMP/gateway"
curl -fsSL "$OPERATOR_URL" -o "$TMP/operator"
sh -n "$TMP/gateway"
python3 -m py_compile "$TMP/operator"
printf '%s\n' '# IA-TB DEBUG: single root-owned allowlisted control program.' \
  'iatb-debug-ci ALL=(root) NOPASSWD: /usr/local/libexec/iatb-debug-operator' > "$TMP/sudoers"
chmod 0440 "$TMP/sudoers"
visudo -cf "$TMP/sudoers"
# Gateway and operator always root-owned, never writable by CI identity.
install -o root -g root -m 0755 "$TMP/operator" "$OPERATOR"
install -o root -g root -m 0755 "$TMP/gateway" "$GATEWAY"
install -o root -g root -m 0440 "$TMP/sudoers" "$SUDOERS"
visudo -c >/dev/null
# authorized_keys already exists; only its forced command path is re-used.
if ! grep -Fq "command=\"$GATEWAY\"" "$HOME_DIR/.ssh/authorized_keys"; then
  echo 'Existing key must be pinned to the expected gateway; abort' >&2
  exit 1
fi
echo 'DEBUG_OPS_INSTALLED'
echo 'Owner-approved commands: ping, status, start, stop, restart, deploy SHA.'
echo 'No shell, no Docker group, no general sudo privileges, no RELEASE.'
