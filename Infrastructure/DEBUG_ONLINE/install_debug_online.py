#!/usr/bin/env python3
"""IA-TB DEBUG Online: fail-closed bootstrap of isolated preview, no RELEASE access.

Run via SSH as root after review. Never touches /var/lib/iatb or legacy Compose.
The public HTTPS site is enabled only if source, CI, Auth21, DNS and Caddy pass.
"""
from __future__ import annotations
import datetime as dt
import json
import os
import pathlib
import pwd
import shutil
import socket
import sqlite3
import ssl
import subprocess
import sys
import time
import urllib.request
import http.client

REPO = "https://github.com/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace.git"
API = "https://api.github.com/repos/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace"
BRANCH = "work/debug-online-v1"
DOMAIN = "trading.debug.iatb.dns.org"
VPS_IPV4 = "169.58.177.163"  # Server address supplied by owner; re-check before use.
BASE = pathlib.Path("/srv/iatb-debug/online")
SOURCE = BASE / "source"
PRIVATE = BASE / "private"
COMPOSE_REL = "Infrastructure/DEBUG_ONLINE/compose.yml"
TLS = PRIVATE / "tls"
CADDY_MAIN = pathlib.Path("/etc/caddy/Caddyfile")
CADDY_SITE = pathlib.Path("/etc/caddy/iatb-debug-online.caddy")
CADDY_CA = pathlib.Path("/etc/caddy/iatb-debug-localhost.crt")
RUNTIME_UID = 10053
RUNTIME_GID = 10053

def run(*args: str, check: bool = True, input_data: str | None = None):
    p = subprocess.run([str(a) for a in args], check=False, text=True,
                       input=input_data)
    if check and p.returncode: raise RuntimeError(f"Command failed: {args[0]} (exit {p.returncode})")
    return p.returncode

def out(*args: str):
    return subprocess.check_output([str(a) for a in args], text=True).strip()

def assert_safe_base():
    if os.geteuid() != 0: raise RuntimeError("Must be root via sudo")
    if not shutil.which("docker") or not shutil.which("git"):
        raise RuntimeError("Docker and Git must be installed")
    if "Docker Compose version" not in out("docker", "compose", "version"):
        raise RuntimeError("Docker Compose plugin missing")
    if not BASE.parent.is_dir(): raise RuntimeError("/srv/iatb-debug does not exist")
    for path in (BASE, SOURCE, PRIVATE):
        if path.is_symlink(): raise RuntimeError(f"Symlink not allowed: {path}")
    # Existing environment is left untouched; no old Compose project is selected.
    existing = out("docker","ps","-a","--format","{{.Names}}")
    for name in existing.splitlines():
        if name == "iatb-debug-online-app":
            project = out("docker","inspect","-f","{{index .Config.Labels \"com.docker.compose.project\"}}",name)
            if project != "iatb-debug-online": raise RuntimeError("Conflicting container name")
    if not sys.stdin.isatty(): raise RuntimeError("Interactive SSH TTY required")

def prepare_source():
    BASE.mkdir(mode=0o755, parents=True, exist_ok=True)
    if not SOURCE.exists():
        run("git","clone","--no-tags","--single-branch","--branch",BRANCH,REPO,str(SOURCE))
    else:
        if not (SOURCE / ".git").is_dir(): raise RuntimeError("Existing source is not a Git repository")
        if out("git","-C",str(SOURCE),"remote","get-url","origin") != REPO:
            raise RuntimeError("Unexpected Git remote")
        if out("git","-C",str(SOURCE),"status","--porcelain"):
            raise RuntimeError("Local source has changes; refusing to discard")
        run("git","-C",str(SOURCE),"fetch","--no-tags","origin",BRANCH)
        # Exact origin ref, never local unreviewed changes.
        run("git","-C",str(SOURCE),"checkout","-B",BRANCH,"FETCH_HEAD")
    sha = out("git","-C",str(SOURCE),"rev-parse","HEAD")
    if out("git","-C",str(SOURCE),"status","--porcelain"):
        raise RuntimeError("Unclean checkout")
    for f in (COMPOSE_REL,"App/Tools/debug_online_start.sh","App/Tools/debug_online_forward.js"):
        if not (SOURCE / f).is_file(): raise RuntimeError(f"Missing {f}")
    print("Source pinned:",sha)
    return sha

def verify_ci(sha: str):
    req = urllib.request.Request(API+f"/actions/runs?head_sha={sha}&per_page=40",
                                 headers={"User-Agent":"IA-TB-safe-debug-deployer","Accept":"application/vnd.github+json"})
    with urllib.request.urlopen(req,timeout=12) as res:
        runs = json.load(res).get("workflow_runs",[])
    success = any(x.get("head_sha")==sha and x.get("head_branch")==BRANCH
                  and x.get("name")=="IA-TB Workspace - build-only CI"
                  and x.get("conclusion")=="success" for x in runs)
    if not success: raise RuntimeError("No successful CI for exact commit; no deployment")
    print("CI PASSED for exact commit")

def setup_private():
    if PRIVATE.is_symlink(): raise RuntimeError("Private symlink forbidden")
    if PRIVATE.exists():
        s=PRIVATE.stat()
        if s.st_uid != RUNTIME_UID or s.st_gid != RUNTIME_GID or s.st_mode & 0o077:
            raise RuntimeError("Existing DEBUG private directory has unexpected ownership/permissions")
    else:
        PRIVATE.mkdir(mode=0o700,parents=True)
        os.chown(PRIVATE,RUNTIME_UID,RUNTIME_GID)
    for name in ("data","runtime","state","annex","updates","tls"):
        p=PRIVATE / name
        if p.is_symlink(): raise RuntimeError(f"Unexpected symlink {p}")
        if not p.exists():
            p.mkdir(mode=0o700)
            os.chown(p,RUNTIME_UID,RUNTIME_GID)
        if p.stat().st_uid != RUNTIME_UID: raise RuntimeError(f"Wrong owner: {p}")
    cert,key=TLS/"localhost.crt",TLS/"localhost.key"
    if cert.exists() != key.exists(): raise RuntimeError("Partial TLS credentials: manual intervention")
    if not cert.exists():
        run("openssl","req","-x509","-nodes","-newkey","rsa:3072",
            "-sha256","-days","365","-keyout",str(key),"-out",str(cert),
            "-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost")
        for p in (cert,key): os.chown(p,RUNTIME_UID,RUNTIME_GID)
        key.chmod(0o600);cert.chmod(0o600)
    if cert.is_symlink() or key.is_symlink(): raise RuntimeError("TLS symlink forbidden")
    if key.stat().st_mode & 0o077: raise RuntimeError("TLS key too permissive")
    return cert

def compose(*args: str, check: bool=True):
    return run("docker","compose","--project-name","iatb-debug-online",
               "-f",str(SOURCE/COMPOSE_REL),*args,check=check)

def local_https_status(path):
    c=ssl.create_default_context(cafile=str(TLS/"localhost.crt"))
    c.check_hostname=True
    sock=socket.create_connection(("127.0.0.1",18000),timeout=4)
    try:
        with c.wrap_socket(sock,server_hostname="localhost") as conn:
            conn.settimeout(5)
            conn.sendall(f"GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n".encode())
            result=conn.recv(4096)
            return int(result.split(b" ",2)[1])
    except Exception:
        sock.close();raise

def wait_private_health():
    for n in range(36):
        try:
            a=local_https_status("/ui-health")
            b=local_https_status("/")
            c=local_https_status("/auth21/me")
            if a==200 and b==303 and c==401:
                print("Private Auth21 HTTPS OK (health 200, anonymous redirect 303, protected endpoint 401)")
                return
        except Exception: pass
        time.sleep(3)
    raise RuntimeError("DEBUG HTTP/Auth21 not healthy; remains private. docker compose logs --tail=80")

def has_admin():
    db=PRIVATE/"data"/"Database"/"clients.sqlite"
    if not db.is_file(): return False
    conn=sqlite3.connect("file:"+str(db)+"?mode=ro",uri=True,timeout=3)
    try:
        r=conn.execute("SELECT COUNT(*) FROM client_accounts a JOIN clients c USING(client_id) "
                       "WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE'").fetchone()
        return bool(r and r[0])
    except sqlite3.Error:
        return False
    finally:
        conn.close()

def migration_done():
    db = PRIVATE / "data" / "Database" / "clients.sqlite"
    if not db.is_file(): return False
    conn = sqlite3.connect("file:" + str(db) + "?mode=ro", uri=True, timeout=3)
    try:
        row = conn.execute("SELECT 1 FROM client_schema_migrations WHERE version=5").fetchone()
        return bool(row)
    except sqlite3.Error:
        return False
    finally:
        conn.close()

def init_admin():
    if has_admin(): return
    print("\nFirst-time DEBUG ADMIN initialization (separate from RELEASE).")
    print("Existing RELEASE users and databases will NOT be imported.")
    # Offline sequence: seed fresh identity database -> migrate -> create ADMIN.
    # No authenticated Core process may start before UserManagement migration.
    compose("stop","app",check=False)
    print("Creating isolated database OFFLINE (never from /var/lib/iatb).")
    compose("run","--rm","--no-deps","--entrypoint","node","app","Tools/debug_online_seed_db.js")
    db=PRIVATE/"data"/"Database"/"clients.sqlite"
    if not db.exists(): raise RuntimeError("Fresh DEBUG database not initialized; public exposure blocked")
    if not migration_done():
        print("\n=== MIGRATION AUTH21 (DB DEBUG UNIQUEMENT) ===")
        print("At the next prompt, TYPE EXACTLY: MIGRATE USER MANAGEMENT V1")
        print("Text is visible; press Enter. No RELEASE data are imported.", flush=True)
        compose("run","--rm","--no-deps","-it","--entrypoint","node","app",
                "Tools/debug_online_operator_cli.js","migrate")
    else:
        print("User management migration version 5 already present; skipping.")
    print("\n=== CREATE A SEPARATE TEST ADMIN ===")
    print("Enter a test identity and a NEW password (password remains hidden).")
    print("At the final confirmation, TYPE EXACTLY: CREATE FIRST ADMIN", flush=True)
    compose("run","--rm","--no-deps","-it","--entrypoint","node","app",
            "Tools/debug_online_operator_cli.js","create-first-admin")
    if not has_admin(): raise RuntimeError("DEBUG ADMIN not validated; public exposure blocked")

def check_dns():
    try:
        records=socket.getaddrinfo(DOMAIN,None,proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise RuntimeError(f"DNS not configured for {DOMAIN}: {e}")
    ips={x[4][0] for x in records}
    if ips != {VPS_IPV4}:
        raise RuntimeError(f"DNS mismatch {sorted(ips)}; expected only {VPS_IPV4}")
    print("DNS VERIFIED:",ips)

def publish_caddy(cert):
    if not shutil.which("caddy") or not CADDY_MAIN.is_file():
        raise RuntimeError("Caddy binary or existing Caddyfile missing")
    if out("systemctl","is-active","caddy")!="active":
        raise RuntimeError("Existing Caddy service not active")
    main=CADDY_MAIN.read_text()
    import_line="import /etc/caddy/iatb-debug-online.caddy"
    if DOMAIN in main or (CADDY_SITE.exists() and CADDY_SITE.is_symlink()):
        raise RuntimeError("Domain already in main Caddyfile or unsafe site symlink")
    if CADDY_SITE.exists() and CADDY_SITE.read_text().find("reverse_proxy https://127.0.0.1:18000")<0:
        raise RuntimeError("Existing site config unexpected; refusing overwrite")
    # Cert is public. Do NOT give Caddy access to private directory.
    shutil.copyfile(cert,CADDY_CA)
    CADDY_CA.chmod(0o644)
    site=f"""# Auto-managed IA-TB DEBUG (never RELEASE)
{DOMAIN} {{
    encode zstd gzip
    reverse_proxy https://127.0.0.1:18000 {{
        transport http {{
            tls_server_name localhost
            tls_trust_pool file {CADDY_CA}
        }}
    }}
    header {{
        X-Content-Type-Options nosniff
        Referrer-Policy no-referrer
        X-Frame-Options DENY
        Strict-Transport-Security "max-age=31536000"
    }}
}}
"""
    new_main=main if import_line in main else main.rstrip()+"\n\n"+import_line+"\n"
    backup=CADDY_MAIN.with_name("Caddyfile.iatb-debug-backup-"+dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    shutil.copy2(CADDY_MAIN,backup)
    old_site=CADDY_SITE.read_bytes() if CADDY_SITE.exists() else None
    try:
        CADDY_SITE.write_text(site)
        CADDY_SITE.chmod(0o644)
        CADDY_MAIN.write_text(new_main)
        run("caddy","validate","--config",str(CADDY_MAIN),"--adapter","caddyfile")
        run("systemctl","reload","caddy")
    except Exception:
        shutil.copy2(backup,CADDY_MAIN)
        if old_site is None: CADDY_SITE.unlink(missing_ok=True)
        else: CADDY_SITE.write_bytes(old_site)
        run("systemctl","reload","caddy",check=False)
        raise
    print("Caddy HTTPS route activated; DNS and ACME certificate issuance still require external validation.")
    print("Caddyfile backup:",backup)

def main():
    assert_safe_base()
    print("=== IA-TB isolated DEBUG Online bootstrap ===")
    print("WARNING: builds and STARTS DEBUG Docker only; never reuses RELEASE data.")
    print("No generic Docker access is given to the MCP.")
    answer=input("Type DEPLOY DEBUG to proceed: ").strip()
    if answer!="DEPLOY DEBUG": raise RuntimeError("Cancelled")
    sha=prepare_source()
    verify_ci(sha)
    cert=setup_private()
    compose("config","--quiet")
    compose("build","--pull","app")
    init_admin()
    compose("up","-d","--no-build","app")
    wait_private_health()
    check_dns()
    publish_caddy(cert)
    print("Local DEBUG checked. PUBLIC URL: https://"+DOMAIN)
    print("Check externally: curl -I https://"+DOMAIN+"/login")
    print("Pinned commit:",sha)

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("\nSAFE STOP:",str(e),file=sys.stderr)
        print("Existing RELEASE and /var/lib/iatb not modified.",file=sys.stderr)
        print("DEBUG may be running privately; do not expose until checks pass.",file=sys.stderr)
        sys.exit(1)
