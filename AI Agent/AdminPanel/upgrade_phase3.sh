#!/usr/bin/env bash
# IA-TB Admin Phase 3 — IN-PLACE upgrade is prohibited.
# Publishes a *parallel*, versioned, read-only Admin backend, preserving /opt/iatb-admin.
# Requires interactive GEN-1 admin SSH. The restricted DEBUG GitHub SSH user cannot run it.
set -Eeuo pipefail
umask 077

fail(){ printf 'PHASE3_UPGRADE_ABORT: %s\n' "$*" >&2; exit 1; }
[[ $# -eq 1 ]] || fail 'One full Git commit SHA is required'
REV="$1"
[[ "$REV" =~ ^[0-9a-f]{40}$ ]] || fail 'Invalid full SHA'
[[ "$EUID" -eq 0 && -t 0 && -t 1 ]] || fail 'Interactive admin sudo/TTY required'
DOMAIN='ia.iatb.duckdns.org'
REPO='https://github.com/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace.git'
ACCOUNT='iatb-admin-panel'
ORIGINAL='/opt/iatb-admin/AI Agent'
ROOT='/opt/iatb-admin-phase3'
STAGE="$ROOT/releases/$REV"
STATE='/var/lib/iatb-admin-panel'
UNIT='/etc/systemd/system/iatb-admin-public.service'
SITE='/etc/caddy/iatb-admin-phase3.caddy'
MAIN='/etc/caddy/Caddyfile'
SERVICE='iatb-admin-public'

for cmd in git curl python3 caddy systemctl ss getent sudo tar sed; do
  command -v "$cmd" >/dev/null || fail "Missing command: $cmd"
done
[[ -d "$ORIGINAL" && ! -L "$ORIGINAL" ]] || fail 'The expected existing Admin installation is absent or symlinked'
[[ -f "$ORIGINAL/AdminPanel/server.py" ]] || fail 'Existing Admin installation has an unknown layout'
[[ -f "$MAIN" ]] || fail 'Caddyfile missing'
systemctl is-active --quiet caddy || fail 'Caddy inactive; do not alter it'
[[ ! -e "$UNIT" && ! -L "$UNIT" ]] || fail 'Public Admin unit exists; this is not a first Phase 3 upgrade'
[[ ! -e "$SITE" && ! -L "$SITE" ]] || fail 'Phase 3 Caddy site exists; inspect manually'
[[ ! -e "$STAGE" && ! -L "$STAGE" ]] || fail 'Versioned Phase 3 stage already exists; inspect it'
[[ ! -e /etc/caddy/iatb-admin-phase3.caddy ]] || fail 'Phase 3 Caddy file already configured'
# No import or existing vhost may be overwritten. Preserve unrelated sites and RELEASE.
if grep -R -Fq "$DOMAIN" /etc/caddy --include='*.caddy' --include='Caddyfile' 2>/dev/null; then
  fail 'Domain already configured in Caddy; review the existing vhost before publishing'
fi
IPS="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u)"
[[ "$IPS" == '169.58.177.163' ]] || fail 'DNS IPv4 record does not exclusively target GEN-1'
[[ -z "$(getent ahostsv6 "$DOMAIN" || true)" ]] || fail 'DNS IPv6 requires a separate review'
if ss -ltn '( sport = :18083 )' | grep -Fq ':18083'; then
  fail 'Port 18083 is already in use'
fi
if id "$ACCOUNT" >/dev/null 2>&1; then
  [[ "$(getent passwd "$ACCOUNT" | cut -d: -f7)" == '/usr/sbin/nologin' ]] || fail 'Unexpected Admin account shell'
  if id -nG "$ACCOUNT" | tr ' ' '\n' | grep -Eq '^(root|sudo|wheel|docker|lxd|disk)$'; then
    fail 'Service account has dangerous supplemental groups'
  fi
fi
[[ ! -L "$STATE" ]] || fail 'Private state directory must not be a symlink'
if [[ -e "$STATE" ]]; then
  [[ -d "$STATE" ]] || fail 'Private state is not a directory'
  [[ "$(stat -c '%a' "$STATE")" == '700' ]] || fail 'Existing private state directory is not 0700'
  [[ "$(stat -c '%U' "$STATE")" == "$ACCOUNT" ]] || fail 'Existing private state owner differs'
fi
printf 'Existing installation retained at %s\n' "$ORIGINAL"
printf 'Versioned Phase3 deployment at %s\n' "$STAGE"
printf 'To approve Phase3 HTTPS on %s, type PUBLISH IA-TB ADMIN PHASE3: ' "$DOMAIN"
IFS= read -r ACCEPT < /dev/tty
[[ "$ACCEPT" == 'PUBLISH IA-TB ADMIN PHASE3' ]] || fail 'Operator declined'

TMP="$(mktemp -d /tmp/iatb-admin-phase3-upgrade.XXXXXXXX)"
CADDY_BACKUP=''
CADDY_CHANGED=0
SERVICE_CREATED=0
UNIT_CREATED=0
SITE_CREATED=0
cleanup(){
  code="$?"
  trap - EXIT ERR
  set +e
  if [[ "$code" != 0 ]]; then
    if [[ "$CADDY_CHANGED" == 1 && -f "$CADDY_BACKUP" ]]; then
      cp -a "$CADDY_BACKUP" "$MAIN"
      caddy validate --config "$MAIN" --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy
      printf 'RESTORED_CADDYFILE: %s\n' "$CADDY_BACKUP" >&2
    fi
    if [[ "$SERVICE_CREATED" == 1 ]]; then
      systemctl stop "$SERVICE" >/dev/null 2>&1
      printf 'STOPPED_NEW_PHASE3_SERVICE\n' >&2
    fi
    if [[ "$UNIT_CREATED" == 1 ]]; then
      rm -f -- "$UNIT"
      systemctl daemon-reload >/dev/null 2>&1
    fi
    if [[ "$SITE_CREATED" == 1 ]]; then
      rm -f -- "$SITE"
    fi
    printf 'Existing installation left unchanged at %s\n' "$ORIGINAL" >&2
  fi
  rm -rf "$TMP"
  exit "$code"
}
trap cleanup EXIT

curl -fsSL --max-time 25 -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace/actions/runs?head_sha=$REV&per_page=50" \
  -o "$TMP/runs.json"
python3 - "$TMP/runs.json" "$REV" <<'PY'
import json,sys
runs=json.load(open(sys.argv[1], encoding='utf8')).get('workflow_runs',[])
sha=sys.argv[2]
assert any(x.get('head_sha')==sha
    and x.get('head_branch')=='work/ai-agent-admin-phase3'
    and x.get('name')=='IA-TB Admin Panel security tests'
    and x.get('conclusion')=='success' for x in runs), 'Exact SHA lacks passing security CI'
print('CI_EXACT_SHA_OK')
PY

git clone --quiet --depth 1 --single-branch --no-tags \
  --branch work/ai-agent-admin-phase3 "$REPO" "$TMP/checkout"
[[ "$(git -C "$TMP/checkout" rev-parse HEAD)" == "$REV" ]] || fail 'Branch HEAD differs from approved SHA'
[[ -f "$TMP/checkout/AI Agent/AdminPanel/public_server.py" ]] || fail 'Phase3 backend missing'
[[ -f "$TMP/checkout/AI Agent/AdminPanel/login.css" ]] || fail 'Phase3 login stylesheet missing'
[[ -z "$(find "$TMP/checkout/AI Agent" -type l -print -quit)" ]] || fail 'Unexpected symlinks in Phase3 source'
python3 -m py_compile "$TMP/checkout/AI Agent/AdminPanel/server.py" "$TMP/checkout/AI Agent/AdminPanel/public_server.py"
caddy validate --config "$TMP/checkout/AI Agent/AdminPanel/caddy/iatb-admin-phase3.caddy.example" --adapter caddyfile >/dev/null

if ! id "$ACCOUNT" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin "$ACCOUNT"
fi
install -d -o root -g root -m 0755 "$ROOT" "$ROOT/releases" "$STAGE"
install -d -o "$ACCOUNT" -g "$ACCOUNT" -m 0700 "$STATE"
tar -C "$TMP/checkout" -cf "$TMP/agent.tar" 'AI Agent'
tar -C "$STAGE" -xf "$TMP/agent.tar" --no-same-owner --no-same-permissions
chown -R root:root "$STAGE"
chmod -R go-w "$STAGE"

# Keep old credentials in the same private directory; never reinitialize or print them.
if [[ ! -e "$STATE/credentials.json" ]]; then
  echo 'ADMIN password initialization (only once, private terminal):'
  sudo -u "$ACCOUNT" python3 "$STAGE/AI Agent/AdminPanel/server.py" init-admin \
    --credential-file "$STATE/credentials.json" < /dev/tty
fi
if [[ ! -e "$STATE/mfa.json" ]]; then
  echo 'TOTP enrollment (do not share the private seed or code):'
  sudo -u "$ACCOUNT" python3 "$STAGE/AI Agent/AdminPanel/public_server.py" init-mfa \
    --mfa-file "$STATE/mfa.json" < /dev/tty
fi
sudo -u "$ACCOUNT" python3 "$STAGE/AI Agent/AdminPanel/preflight.py" \
  --credential-file "$STATE/credentials.json" || fail 'Identity preflight failed'
# Fail closed if credentials were changed/invalid. Never overwrite.
sudo -u "$ACCOUNT" python3 - "$STAGE/AI Agent/AdminPanel" "$STATE" <<'PY'
import importlib.util,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from server import load_admin
from public_server import read_mfa
load_admin(Path(sys.argv[2])/'credentials.json')
read_mfa(Path(sys.argv[2])/'mfa.json')
print('PASSWORD_AND_MFA_FILES_VALID')
PY

# Generate a dedicated unit for the *versioned* code, leaving the original service untouched.
sed "s|/opt/iatb-admin/AI Agent|$STAGE/AI Agent|g; s|WorkingDirectory=/opt/iatb-admin|WorkingDirectory=$STAGE|g" \
  "$STAGE/AI Agent/AdminPanel/systemd/iatb-admin-public.service.example" > "$TMP/iatb-admin-public.service"
install -o root -g root -m 0644 "$TMP/iatb-admin-public.service" "$UNIT"
UNIT_CREATED=1
systemd-analyze verify "$UNIT" || fail 'Generated systemd unit invalid'
systemctl daemon-reload
SERVICE_CREATED=1
systemctl start "$SERVICE"
systemctl is-active --quiet "$SERVICE" || fail 'Phase3 service could not start'
LISTEN="$(ss -ltn '( sport = :18083 )')"
printf '%s\n' "$LISTEN" | grep -Fq '127.0.0.1:18083' || fail 'Phase3 backend not on loopback'
if printf '%s\n' "$LISTEN" | grep -Eq '0[.]0[.]0[.]0:18083|\[::\]:18083'; then
  fail 'Phase3 backend must not bind publicly'
fi
curl -fsS --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1:18083/healthz \
  | grep -Fq '"mode":"mfa_read_only"' || fail 'Backend health failed'
CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1:18083/api/overview)"
[[ "$CODE" == 401 ]] || fail 'Unauthenticated API did not return 401'

install -o root -g root -m 0644 \
  "$STAGE/AI Agent/AdminPanel/caddy/iatb-admin-phase3.caddy.example" "$SITE"
SITE_CREATED=1
CADDY_BACKUP="$MAIN.phase3-upgrade-$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$MAIN" "$CADDY_BACKUP"
CADDY_CHANGED=1
printf '\n# Independent IA-TB Admin Phase3\nimport %s\n' "$SITE" >> "$MAIN"
caddy validate --config "$MAIN" --adapter caddyfile || fail 'Caddy validation failed'
systemctl reload caddy || fail 'Caddy reload failed'
CADDY_CHANGED=0
echo 'PHASE3_UPGRADE_CADDY_RELOADED'
echo "PUBLIC_URL=https://$DOMAIN"
echo "ORIGINAL_PRESERVED=$ORIGINAL"
echo "VERSIONED_SHA=$REV"
echo 'PUBLICATION_NOT_YET_VERIFIED: Check valid external TLS, MFA login, public /healthz blocked, and unrelated sites.'
