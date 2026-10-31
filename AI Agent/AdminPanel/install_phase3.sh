#!/usr/bin/env bash
# IA-TB Admin Phase 3: owner-only one-time deployment; never use the CI SSH identity.
set -Eeuo pipefail
umask 077
fail(){ echo "PHASE3_ABORT: $*" >&2; exit 1; }
[[ $# -eq 1 ]] || fail 'Pass exact full commit SHA'
REV="$1"
[[ "$EUID" -eq 0 && -t 0 && -t 1 ]] || fail 'Interactive root/admin SSH TTY required'
[[ "$REV" =~ ^[0-9a-f]{40}$ ]] || fail 'Invalid full SHA'
DOMAIN=ia.iatb.duckdns.org
REPO=https://github.com/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace.git
ACCOUNT=iatb-admin-panel
ROOT=/opt/iatb-admin
STATE=/var/lib/iatb-admin-panel
SITE=/etc/caddy/iatb-admin-phase3.caddy
MAIN=/etc/caddy/Caddyfile
for cmd in git curl python3 caddy systemctl ss getent sudo; do command -v "$cmd" >/dev/null || fail "Missing $cmd"; done
[[ -f "$MAIN" && -d /srv/iatb-debug/online && -d /srv/iatb-mcp-workspace ]] || fail 'Expected GEN-1 services absent'
systemctl is-active --quiet caddy || fail 'Caddy is not active'
[[ ! -e "$ROOT/AI Agent" && ! -L "$ROOT/AI Agent" ]] || fail 'Existing installation: use separately reviewed upgrade'
[[ ! -e /etc/systemd/system/iatb-admin-public.service && ! -e "$SITE" ]] || fail 'Existing public service or Caddy site'
grep -R -Fq "$DOMAIN" /etc/caddy --include='*.caddy' --include='Caddyfile' 2>/dev/null && fail 'Domain already configured'
IPS="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u)"
[[ "$IPS" == '169.58.177.163' ]] || fail 'DNS A record is missing or not exclusively GEN-1'
[[ -z "$(getent ahostsv6 "$DOMAIN" || true)" ]] || fail 'Unreviewed DNS AAAA record'
printf 'Authorize publication of %s at SHA %s? Type PUBLISH IA-TB ADMIN PHASE3: ' "$DOMAIN" "$REV"
IFS= read -r ACCEPT < /dev/tty
[[ "$ACCEPT" == 'PUBLISH IA-TB ADMIN PHASE3' ]] || fail 'Owner did not approve'
TMP="$(mktemp -d /tmp/iatb-admin-phase3.XXXXXXXX)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL --max-time 25 -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace/actions/runs?head_sha=$REV&per_page=50" \
  -o "$TMP/runs.json"
python3 - "$TMP/runs.json" "$REV" <<'PY'
import json,sys
runs=json.load(open(sys.argv[1],encoding='utf-8')).get('workflow_runs',[])
sha=sys.argv[2]
assert any(x.get('head_sha')==sha and x.get('head_branch')=='work/ai-agent-admin-phase3'
    and x.get('name')=='IA-TB Admin Panel security tests' and x.get('conclusion')=='success'
    for x in runs), 'CI for exact commit must succeed before installation'
print('CI_EXACT_SHA_OK')
PY
git clone --quiet --depth 1 --single-branch --no-tags --branch work/ai-agent-admin-phase3 "$REPO" "$TMP/checkout"
[[ "$(git -C "$TMP/checkout" rev-parse HEAD)" == "$REV" ]] || fail 'Approved SHA mismatch'
python3 -m py_compile "$TMP/checkout/AI Agent/AdminPanel/public_server.py"
caddy validate --config "$TMP/checkout/AI Agent/AdminPanel/caddy/iatb-admin-phase3.caddy.example" --adapter caddyfile >/dev/null
if id "$ACCOUNT" >/dev/null 2>&1; then
  [[ "$(id -nG "$ACCOUNT" | wc -w)" == 1 && "$(getent passwd "$ACCOUNT" | cut -d: -f7)" == '/usr/sbin/nologin' ]] || fail 'Existing service identity is not isolated'
else
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin "$ACCOUNT"
fi
install -d -o root -g root -m 0755 "$ROOT"
install -d -o "$ACCOUNT" -g "$ACCOUNT" -m 0700 "$STATE"
tar -C "$TMP/checkout" -cf "$TMP/agent.tar" 'AI Agent'
tar -C "$ROOT" -xf "$TMP/agent.tar" --no-same-owner --no-same-permissions
chown -R root:root "$ROOT/AI Agent"
chmod -R go-w "$ROOT/AI Agent"
if [[ ! -e "$STATE/credentials.json" ]]; then
  sudo -u "$ACCOUNT" python3 "$ROOT/AI Agent/AdminPanel/server.py" init-admin --credential-file "$STATE/credentials.json" < /dev/tty
fi
if [[ ! -e "$STATE/mfa.json" ]]; then
  sudo -u "$ACCOUNT" python3 "$ROOT/AI Agent/AdminPanel/public_server.py" init-mfa --mfa-file "$STATE/mfa.json" < /dev/tty
fi
sudo -u "$ACCOUNT" python3 "$ROOT/AI Agent/AdminPanel/preflight.py" --credential-file "$STATE/credentials.json" || fail 'Service account preflight failed'
install -o root -g root -m 0644 "$ROOT/AI Agent/AdminPanel/systemd/iatb-admin-public.service.example" /etc/systemd/system/iatb-admin-public.service
systemd-analyze verify /etc/systemd/system/iatb-admin-public.service || fail 'Invalid unit'
systemctl daemon-reload
systemctl start iatb-admin-public
systemctl is-active --quiet iatb-admin-public || fail 'Public backend failed to start'
ss -ltn '( sport = :18083 )' | grep -Fq '127.0.0.1:18083' || fail 'Backend not bound to loopback'
curl -fsS --max-time 6 -H "Host: $DOMAIN" http://127.0.0.1:18083/healthz | grep -Fq '"mode":"mfa_read_only"' || fail 'Health failed'
CODE="$(curl -sS --max-time 6 -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1:18083/api/overview)"
[[ "$CODE" == 401 ]] || fail 'Anonymous API leak'
install -o root -g root -m 0644 "$ROOT/AI Agent/AdminPanel/caddy/iatb-admin-phase3.caddy.example" "$SITE"
BACKUP="$MAIN.phase3-$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$MAIN" "$BACKUP"
printf '\n# IA-TB Admin Phase 3\nimport %s\n' "$SITE" >> "$MAIN"
if ! caddy validate --config "$MAIN" --adapter caddyfile; then
  cp -a "$BACKUP" "$MAIN"
  fail 'Caddy validation failed; global config restored'
fi
if ! systemctl reload caddy; then
  cp -a "$BACKUP" "$MAIN"
  systemctl reload caddy || true
  fail 'Caddy reload failed; global config restored'
fi
echo 'PHASE3_CADDY_RELOADED'
echo "URL=https://$DOMAIN"
echo 'NEXT: externally verify TLS certificate, login TOTP, denied /healthz and other existing sites.'
echo 'Admin read-only; DEBUG deployment is controlled by a separate SSH gateway.'
