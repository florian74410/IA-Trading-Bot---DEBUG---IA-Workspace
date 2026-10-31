#!/usr/bin/env python3
"""Root-owned IA-TB DEBUG-only operator, invoked through a forced SSH command.

Allowlist: status, start, stop, restart, deploy <40-hex-SHA>.
Not a general command runner. Never accepts a path, container name or compose file.
Does not configure Caddy, create accounts, edit /var/lib/iatb, or modify RELEASE.
"""
from __future__ import annotations

import json
import hashlib
import os
from pathlib import Path
import re
import sqlite3
import ssl
import subprocess
import sys
import time
import urllib.request
import socket

SOURCE = Path("/srv/iatb-debug/online/source")
PRIVATE = Path("/srv/iatb-debug/online/private")
COMPOSE = SOURCE / "Infrastructure/DEBUG_ONLINE/compose.yml"
REPO = "https://github.com/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace.git"
API = "https://api.github.com/repos/florian74410/IA-Trading-Bot---DEBUG---IA-Workspace"
BASELINE = "c793c95d534cb342a8251eb7ce32656b0168f428"
BRANCH = "work/debug-online-v1"
PROJECT = "iatb-debug-online"
CONTAINER = "iatb-debug-online-app"
IMAGE = "iatb-debug-online:local"
APPROVED_BLOBS = {
    "Infrastructure/DEBUG_ONLINE/compose.yml": "8dda6c3918b83007174e15d874c2239f956e4a18",
    "App/Dockerfile.app": "9527f539a796ea504959408799064d8976f11ac5",
}
SHA = re.compile(r"^[0-9a-f]{40}$")

def error(reason: str) -> None:
    raise RuntimeError(reason)

def run(*args: str, timeout: int = 240, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, timeout=timeout, check=False)
    if check and result.returncode:
        # Do not leak command stderr: it may contain credentials or app settings.
        error(f"Step failed ({args[0]} exit {result.returncode}); consult controlled diagnostic")
    return result

def git(*args: str, check: bool = True) -> str:
    return run("git", "-C", str(SOURCE), *args, timeout=90, check=check).stdout.strip()

def compose(*args: str, timeout: int = 240) -> subprocess.CompletedProcess:
    return run("docker", "compose", "--project-name", PROJECT,
               "--file", str(COMPOSE), *args, timeout=timeout)

def preflight():
    if os.geteuid() != 0:
        error("Root-owned controller must run through one fixed sudoers rule")
    for p in (SOURCE.parent.parent, SOURCE.parent, SOURCE, PRIVATE, COMPOSE):
        if p.is_symlink() or not p.exists():
            error("Unsafe or missing DEBUG path")
    if not (SOURCE / ".git").is_dir():
        error("DEBUG source checkout missing")
    if git("remote", "get-url", "origin") != REPO:
        error("Unexpected Git remote")
    if not (PRIVATE / "data" / "Database" / "clients.sqlite").is_file():
        error("DEBUG identity store missing: bootstrap must complete first")
    # Compare against pinned Git blob hashes, independent of checkout history.
    # Prevent branch changes from mounting RELEASE data or enabling host access.
    for relative, approved_blob in APPROVED_BLOBS.items():
        target = SOURCE / relative
        if target.is_symlink() or not target.is_file():
            error("Missing or unsafe approved deployment file")
        actual = target.read_bytes()
        digest = hashlib.sha1(b"blob " + str(len(actual)).encode() + b"\x00" + actual).hexdigest()
        if digest != approved_blob:
            error(f"Unapproved deployment definition: {relative}")
    config = json.loads(compose("config", "--format", "json").stdout)
    services = config.get("services", {})
    if list(services) != ["app"]:
        error("Unexpected service in Compose")
    app = services["app"]
    if app.get("container_name") != CONTAINER or app.get("user") != "10053:10053":
        error("Unsafe container identity")
    if app.get("privileged", False) or app.get("network_mode") in ("host", "service:"):
        error("Unsafe container privileges")
    if not app.get("cap_drop") == ["ALL"]:
        error("Capabilities must remain dropped")
    env = app.get("environment", {})
    for k, v in {"IATB_TRADING_LIVE": "0", "IATB_AUTH_MODE": "authenticated",
                 "IATB_DEPLOYMENT_MODE": "AUTHENTICATED",
                 "IATB_DATA_ROOT": "/debug-private/data"}.items():
        if env.get(k) != v:
            error("Unexpected authenticated DEBUG environment")
    volumes = app.get("volumes", [])
    if len(volumes) != 1 or volumes[0].get("source") != str(PRIVATE) or volumes[0].get("target") != "/debug-private":
        error("Unexpected mounted volume")
    ports = app.get("ports", [])
    if len(ports) != 1 or ports[0].get("host_ip") != "127.0.0.1" or str(ports[0].get("published")) != "18000":
        error("Public ingress forbidden")
    # Never act on a colliding Docker container or a different Compose project.
    state = run("docker", "inspect", CONTAINER, check=False)
    if state.returncode == 0:
        existing = json.loads(state.stdout)[0]
        labels = existing.get("Config", {}).get("Labels") or {}
        if labels.get("com.docker.compose.project") != PROJECT or labels.get("com.docker.compose.service") != "app":
            error("Container name collision: refusing action")

def admin_exists() -> bool:
    db = PRIVATE / "data/Database/clients.sqlite"
    conn = sqlite3.connect("file:" + str(db) + "?mode=ro", uri=True, timeout=3)
    try:
        version = conn.execute("SELECT 1 FROM client_schema_migrations WHERE version=5").fetchone()
        admin = conn.execute("SELECT COUNT(*) FROM client_accounts a JOIN clients c USING(client_id) "
                             "WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE'").fetchone()
        return bool(version and admin and admin[0] > 0)
    finally:
        conn.close()

def status() -> dict:
    result = run("docker", "inspect", CONTAINER, check=False)
    if result.returncode:
        container = {"status": "absent", "health": "none"}
    else:
        st = json.loads(result.stdout)[0]["State"]
        container = {"status": st.get("Status"),
                     "health": (st.get("Health") or {}).get("Status", "unknown"),
                     "exitCode": st.get("ExitCode")}
    return {"project": PROJECT, "sourceSha": git("rev-parse", "HEAD"),
            "container": container, "tradingLive": False}

def healthy() -> bool:
    state = status()["container"]
    return state.get("status") == "running" and state.get("health") == "healthy"

def await_health(attempts=30, delay=5):
    for _ in range(attempts):
        if healthy():
            print("DEBUG_HEALTHY", flush=True)
            return
        time.sleep(delay)
    error("DEBUG_UNHEALTHY; inspect restricted logs. RELEASE untouched")

def ci_passed(sha: str) -> bool:
    req = urllib.request.Request(
        API + "/actions/runs?head_sha=" + sha + "&per_page=50",
        headers={"User-Agent": "iatb-debug-operator/1",
                 "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=15) as response:
        runs = json.load(response).get("workflow_runs", [])
    return any(x.get("head_sha") == sha and x.get("head_branch") == BRANCH
               and x.get("name") == "IA-TB Workspace - build-only CI"
               and x.get("conclusion") == "success" for x in runs)

def deploy(sha: str):
    if not SHA.fullmatch(sha):
        error("A full lowercase commit SHA is required")
    if not admin_exists():
        error("DEBUG ADMIN missing; no automated bootstrap")
    if git("status", "--porcelain"):
        error("DEBUG source contains local changes; refusing reset")
    previous = git("rev-parse", "HEAD")
    current_image = run("docker", "image", "inspect", IMAGE, "--format", "{{.Id}}", check=False)
    saved_image = current_image.stdout.strip() if current_image.returncode == 0 else None
    print("Checking requested commit and CI", flush=True)
    git("fetch", "--no-tags", "origin", BRANCH)
    if run("git", "-C", str(SOURCE), "merge-base", "--is-ancestor", sha, "FETCH_HEAD", check=False).returncode:
        error("Commit is not reachable from the approved DEBUG branch")
    if not ci_passed(sha):
        error("Exact commit lacks successful build-only CI")
    if run("git", "-C", str(SOURCE), "merge-base", "--is-ancestor", BASELINE, sha, check=False).returncode:
        error("Requested commit predates the approved DEBUG security baseline")
    try:
        git("checkout", "--detach", sha)
        preflight()
        compose("build", "app", timeout=900)
        compose("up", "--detach", "--no-build", "app", timeout=180)
        await_health()
        print("DEPLOY_OK " + sha)
    except Exception:
        # Best-effort restore old code and image; never delete volumes or stop RELEASE.
        try:
            git("checkout", "--detach", previous)
            if saved_image and SHA.fullmatch(sha):
                run("docker", "image", "tag", saved_image, IMAGE)
                compose("up", "--detach", "--no-build", "app", timeout=180)
                print("ROLLBACK_ATTEMPTED " + previous, flush=True)
        except Exception:
            print("ROLLBACK_NEEDS_OPERATOR", flush=True)
        raise

def main():
    args = sys.argv[1:]
    if args not in (["status"], ["start"], ["stop"], ["restart"]) and not (
        len(args) == 2 and args[0] == "deploy" and SHA.fullmatch(args[1])
    ):
        error("Only status, start, stop, restart or deploy <full SHA> are allowed")
    preflight()
    if args[0] == "status":
        print(json.dumps(status(), sort_keys=True))
    elif args[0] == "stop":
        compose("stop", "app", timeout=180)
        print("DEBUG_STOPPED", flush=True)
    elif args[0] in ("start", "restart"):
        if not admin_exists():
            error("DEBUG ADMIN missing; manual bootstrap required")
        if args[0] == "start":
            compose("up", "--detach", "--no-build", "app", timeout=180)
        else:
            compose("restart", "app", timeout=180)
        await_health()
        print("DEBUG_" + args[0].upper() + "_OK", flush=True)
    else:
        deploy(args[1])
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("DEBUG_OPERATOR_FAILED: " + str(exc), file=sys.stderr)
        raise SystemExit(1)
