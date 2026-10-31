#!/usr/bin/env python3
"""IA-TB admin console: loopback-only, read-only, SSH-tunnel-first viewer.

No operation endpoints, no grants, no SSH, no Docker, no write-capable DB access.
Basic authentication is acceptable ONLY through localhost-over-SSH or a trusted
private HTTPS reverse proxy. Not intended for direct public internet exposure.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import getpass
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import time
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
AGENT = HERE.parent
REDACT = re.compile(
    r"(Bearer\s+\S+|-----BEGIN\s+[A-Z ]*PRIVATE KEY-----|"
    r"(?:api[_-]?key|access[_-]?token|password|passwd|secret)[\"\']?\s*[:=]\s*[\"\']?\S+|(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}))", re.I)
MAX_ITEMS = 100
FAIL_LIMIT = 8
FAIL_WINDOW = 300
LOCKOUT = 300


def clean(value: object, limit: int = 240) -> str:
    """Only short display-safe text may cross the API boundary."""
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(value)
    if not isinstance(value, str):
        return ""
    return REDACT.sub("[REDACTED]", value).replace("\x00", "")[:limit]


def credential_file(path: Path) -> Path:
    path = Path(path)
    if not path.is_absolute() or path.is_symlink():
        raise ValueError("Credential file requires an absolute non-symlink path")
    if not path.is_file() or not path.parent.is_dir():
        raise ValueError("Credentials are not initialized")
    if path.parent.is_symlink():
        raise PermissionError("Credential parent symlink forbidden")
    pstat = path.stat()
    if not stat.S_ISREG(pstat.st_mode) or pstat.st_mode & 0o077:
        raise PermissionError("Credentials must be a regular file with mode 0600")
    if path.parent.stat().st_mode & 0o077:
        raise PermissionError("Credential directory must have mode 0700")
    return path


def init_admin(path: Path) -> None:
    path = Path(path)
    if not path.is_absolute() or path.is_symlink():
        raise ValueError("Use a non-symlink absolute credential path")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.parent.is_symlink() or path.parent.stat().st_mode & 0o077:
        raise PermissionError("Credential parent must be private (0700)")
    if path.exists():
        raise FileExistsError("Refusing overwrite; rotate credentials offline")
    first = getpass.getpass("New independent ADMIN password (16+ characters): ")
    second = getpass.getpass("Confirm ADMIN password: ")
    if len(first) < 16 or len(first) > 256 or first != second:
        raise ValueError("Passwords mismatch or invalid length")
    salt = secrets.token_bytes(24)
    digest = hashlib.scrypt(first.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    payload = {"algorithm": "scrypt", "salt": salt.hex(), "digest": digest.hex()}
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(str(path), flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
        handle.write("\n")
    print("ADMIN_READY (credential hash stored outside Git)")


def load_admin(path: Path) -> tuple[bytes, bytes]:
    path = credential_file(path)
    values = json.loads(path.read_text(encoding="utf-8"))
    if values.get("algorithm") != "scrypt":
        raise ValueError("Unsupported credential algorithm")
    salt = bytes.fromhex(values["salt"])
    digest = bytes.fromhex(values["digest"])
    if len(salt) != 24 or len(digest) != 32:
        raise ValueError("Invalid stored hash")
    return salt, digest


def verify_admin(authorization: str, salt: bytes, digest: bytes) -> bool:
    if not authorization.startswith("Basic ") or len(authorization) > 1200:
        return False
    try:
        decoded = base64.b64decode(authorization[6:], validate=True).decode("utf-8")
        username, password = decoded.split(":", 1)
        if len(password) > 256 or not password or username != "admin":
            return False
        candidate = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
        return hmac.compare_digest(candidate, digest)
    except (ValueError, UnicodeError, binascii.Error):
        return False


def read_json_rules(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("rules"), list):
        raise ValueError("Invalid policy manifest")
    return raw["rules"][:MAX_ITEMS]


def readonly_rows(db_env: str, query: str) -> tuple[list[dict], str]:
    source = os.environ.get(db_env)
    if not source:
        return [], "not_configured"
    path = Path(source)
    if not path.is_absolute() or path.is_symlink() or not path.is_file():
        return [], "unavailable"
    try:
        with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=2) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA query_only=ON")
            rows = [dict(row) for row in db.execute(query)]
            return rows, "connected"
    except (OSError, sqlite3.Error):
        return [], "unavailable"


def collect(section: str) -> dict:
    """Read only allowlisted files/queries; exclude secrets and permissions evidence."""
    if section == "permissions":
        rules = read_json_rules(AGENT / "Rules/Authorized/permissions.json")
        return {"status": "declarative", "items": [
            {"id": clean(r.get("id")), "action": clean(r.get("action")),
             "resource": clean(r.get("resource")), "principal": clean(r.get("principal")),
             "access": clean(r.get("access")),
             "effective": "DENIED_NO_CONTROLLER",
             "state": "DECLARED_ONLY" if r.get("enabled") else "DISABLED"}
            for r in rules if isinstance(r, dict)]}
    if section == "denied":
        rules = read_json_rules(AGENT / "Rules/Non-Authorized/denied.json")
        return {"status": "declarative", "items": [
            {"id": clean(r.get("id")), "action": clean(r.get("action")),
             "resource": clean(r.get("resource")), "level": clean(r.get("level")),
             "reason": clean(r.get("why")),
             "exception": "YES" if r.get("exception_allowed") else "NO"}
            for r in rules if isinstance(r, dict)]}
    if section == "skills":
        # The catalog validator is intentionally read-only and never loads executable Skills.
        import importlib.util
        path = AGENT / "Engine/SkillLoader/loader.py"
        spec = importlib.util.spec_from_file_location("iatb_skill_catalog", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        items = module.inspect_skills(AGENT / "Skills")
        return {"status": "catalog_only", "items": [
            {"name": clean(i["name"]), "version": clean(i["version"]),
             "actions": ", ".join(clean(a) for a in i["actions"]), "folder": clean(i["folder"]),
             "state": "CATALOG_ONLY"} for i in items]}
    if section == "requests":
        rows, status = readonly_rows("IATB_ADMIN_REQUESTS_DB",
            "SELECT * FROM requests ORDER BY created_at_utc DESC LIMIT 100")
        keys = ("id", "created_at_utc", "principal", "action", "resource", "reason",
                "risks", "conditions", "rollback", "expires_at", "status",
                "requested_duration_seconds", "decided_by", "decided_at_utc", "procedure", "consequences")
        return {"status": status, "items": [
            {**{k: clean(row.get(k), 360 if k in ("reason", "risks", "conditions", "rollback") else 160)
                for k in keys}, "max_uses": row.get("max_uses")} for row in rows]}
    if section == "audit":
        rows, status = readonly_rows("IATB_ADMIN_AUDIT_DB",
            "SELECT id, timestamp_utc, principal, action, resource, decision, policy_version,"
            " result, request_id, commit_sha, exit_code, execution_duration_ms FROM audit_events ORDER BY id DESC LIMIT 100")
        return {"status": status, "items": [
            {k: clean(row.get(k), 220) for k in
             ("id", "timestamp_utc", "principal", "action", "resource", "decision",
              "policy_version", "result", "request_id", "commit_sha", "exit_code", "execution_duration_ms")} for row in rows]}
    if section == "memory":
        rows, status = readonly_rows("IATB_ADMIN_MEMORY_DB",
            "SELECT id, created_at_utc, kind, source, reference, confidence, summary "
            "FROM general_memory ORDER BY id DESC LIMIT 100")
        return {"status": status, "items": [
            {k: clean(row.get(k), 180 if k == "summary" else 120) for k in
             ("id", "created_at_utc", "kind", "source", "reference", "confidence", "summary")}
            for row in rows]}
    raise ValueError("Unknown section")


def collect_soul() -> dict:
    """Fixed allowlist of text-only Soul documents, no arbitrary path input."""
    names = ("identity.md", "behavior.md", "personality.json", "objectives.json")
    items = []
    for name in names:
        file = AGENT / "Soul" / name
        if not file.is_file() or file.is_symlink() or file.stat().st_size > 32000:
            continue
        raw = file.read_text(encoding="utf-8")
        # Never publish a file with a detected credential. These are public manifests.
        if REDACT.search(raw):
            continue
        items.append({"name": name, "content": raw[:12000], "mode": "READ_ONLY"})
    return {"status": "read_only", "items": items}


def collect_journal() -> dict:
    """Join allowlisted audit and requests as an event feed; never invent model thoughts."""
    events = []
    audit = collect("audit")
    requests = collect("requests")
    for entry in audit["items"]:
        events.append({
            "timestamp": entry["timestamp_utc"], "type": "AUDIT",
            "status": {"ALLOW": "VALIDATED", "DENY": "DENIED", "HARD_DENY": "DENIED", "RESTRICTED": "PENDING"}.get(entry["decision"], "ERROR"), "message": entry["action"] + " · " + entry["result"],
            "source": "AUDIT", "reference": entry["id"],
            "correlation_id": entry["request_id"] or "audit:" + entry["id"],
            "commit_sha": entry["commit_sha"] or None, "exit_code": entry["exit_code"] or None,
            "execution_duration_ms": entry["execution_duration_ms"] or None,
            "result": entry["result"],
        })
    for entry in requests["items"]:
        events.append({
            "timestamp": entry["created_at_utc"], "type": "PERMISSION",
            "status": "PENDING", "recorded_decision": entry["status"], "message": entry["action"] + " · " + entry["reason"],
            "source": "PERMISSION", "reference": entry["id"],
            "correlation_id": entry["id"], "result": "REQUEST_CREATED",
            "commit_sha": None, "exit_code": None, "execution_duration_ms": None,
        })
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    sources = {"audit": audit["status"], "requests": requests["status"]}
    state = "unavailable" if "unavailable" in sources.values() else ("read_only" if "connected" in sources.values() else "not_configured")
    return {"status": state, "sources": sources, "items": events[:MAX_ITEMS]}


def collect_connections() -> dict:
    """Only local facts. Configuration and reachability are never conflated."""
    from datetime import datetime, timezone
    observed = datetime.now(timezone.utc).isoformat()
    return {"status": "local_observation", "items": [
        {"name": "Admin backend", "state": "LOCAL", "endpoint": "127.0.0.1:18082", "detail": "API de consultation authentifiée", "observed_at_utc": observed},
        {"name": "GitHub", "state": "NOT_CONFIGURED", "endpoint": "florian74410/IA-Trading-Bot---DEBUG---IA-Workspace", "detail": "Aucun connecteur réseau du panneau", "observed_at_utc": observed},
        {"name": "ChatGPT / fournisseurs IA", "state": "NOT_CONFIGURED", "endpoint": "—", "detail": "Aucune session fournisseur vérifiée", "observed_at_utc": observed},
        {"name": "VPS DEBUG / SSH", "state": "UNVERIFIED", "endpoint": "GEN-1 DEBUG", "detail": "Passerelle non raccordée ; aucun diagnostic distant", "observed_at_utc": observed},
        {"name": "Contrôleur indépendant", "state": "NOT_CONFIGURED", "endpoint": "—", "detail": "Zéro autorisation exécutable ; approbations verrouillées", "observed_at_utc": observed},
        {"name": "Caddy / MFA", "state": "UNVERIFIED", "endpoint": "https://ia.iatb.duckdns.org", "detail": "Phase B bloquée ; déploiement et HTTPS non vérifiés", "observed_at_utc": observed},
    ]}


class AdminServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, bind: tuple[str, int], credentials: tuple[bytes, bytes]):
        if bind[0] != "127.0.0.1":
            raise ValueError("Loopback bind required")
        super().__init__(bind, AdminHandler)
        self.credentials = credentials
        self.attempts: list[float] = []
        import threading
        self.lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(8)
        self.allowed_hosts = {f"127.0.0.1:{self.server_address[1]}", f"localhost:{self.server_address[1]}"}


    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class AdminHandler(BaseHTTPRequestHandler):
    server_version = "IATB-Admin/1.1"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, fmt, *args):
        # No raw URLs/headers, basic credentials or secret-bearing logs.
        pass

    def headers_safe(self, content_type: str, length: int, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Content-Security-Policy",
                         "default-src 'none'; script-src 'self'; style-src 'self'; "
                         "connect-src 'self'; img-src 'self'; form-action 'none'; "
                         "frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()

    def send_bytes(self, data: bytes, mime: str, status: int = 200):
        self.headers_safe(mime, len(data), status)
        self.wfile.write(data)

    def send_json(self, value: object, status: int = 200):
        self.send_bytes(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode(),
                        "application/json; charset=utf-8", status)

    def do_GET(self):
        # The public surface is only on loopback. Reject DNS rebinding.
        if len(self.headers.get_all("Host", [])) != 1 or self.headers.get("Host", "") not in self.server.allowed_hosts:
            self.send_json({"error": "invalid_host"}, 400)
            return
        if any(self.headers.get(h) is not None for h in ("Forwarded", "X-Forwarded-Host", "X-Forwarded-For", "X-Forwarded-Proto", "X-Remote-User")):
            self.send_json({"error": "proxy_not_enabled"}, 400)
            return
        if self.path == "/healthz":
            self.send_json({"ok": True, "mode": "read_only"})
            return
        if len(self.headers.get_all("Authorization", [])) > 1:
            self.send_json({"error": "ambiguous_identity"}, 400)
            return
        now = time.monotonic()
        with self.server.lock:
            self.server.attempts = [t for t in self.server.attempts if now - t < FAIL_WINDOW]
            locked = len(self.server.attempts) >= FAIL_LIMIT
        if locked:
            self.send_json({"error": "temporarily_locked"}, 429)
            return
        if not verify_admin(self.headers.get("Authorization", ""), *self.server.credentials):
            with self.server.lock:
                self.server.attempts.append(now)
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="IA-TB ADMIN (SSH tunnel)", charset="UTF-8"')
            self.send_header("Content-Length", "0")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        path = urlsplit(self.path).path
        files = {"/": ("index.html", "text/html; charset=utf-8"),
                 "/index.html": ("index.html", "text/html; charset=utf-8"),
                 "/app.css": ("app.css", "text/css; charset=utf-8"),
                 "/app.js": ("app.js", "text/javascript; charset=utf-8")}
        if path in files and self.path == path:
            filename, mime = files[path]
            self.send_bytes((HERE / filename).read_bytes(), mime)
            return
        sections = {"permissions", "denied", "requests", "audit", "skills", "memory", "soul", "journal", "dashboard", "connections"}
        if path.startswith("/api/") and path[5:] in sections and self.path == path:
            try:
                result = collect_connections() if path[5:] in ("dashboard", "connections") else collect_soul() if path[5:] == "soul" else (collect_journal() if path[5:] == "journal" else collect(path[5:]))
            except (ValueError, OSError, KeyError):
                self.send_json({"status": "unavailable", "items": []}, 503)
                return
            self.send_json(result)
            return
        if path == "/api/overview" and self.path == path:
            self.send_json({"mode": "read_only", "principal": "ADMIN",
                            "environment": "GEN-1 DEBUG / ISOLATED",
                            "permissions": "DECLARATIVE_ONLY",
                            "gateway": "UNCONNECTED",
                            "execution": False})
            return
        self.send_json({"error": "not_found"}, 404)

    def do_POST(self):
        self.send_json({"error": "read_only"}, 405)
    do_PUT = do_PATCH = do_DELETE = do_POST


def main():
    parser = argparse.ArgumentParser(description="SSH-only IA-TB ADMIN viewer; never deploy from this script")
    sub = parser.add_subparsers(dest="command", required=True)
    setup = sub.add_parser("init-admin")
    setup.add_argument("--credential-file", type=Path, required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--credential-file", type=Path, required=True)
    serve.add_argument("--port", type=int, default=18082)
    args = parser.parse_args()
    if os.geteuid() == 0:
        parser.error("Refuse to run as root")
    if args.command == "init-admin":
        init_admin(args.credential_file)
    else:
        if not 1024 <= args.port <= 65535:
            parser.error("Invalid port")
        credentials = load_admin(args.credential_file)
        server = AdminServer(("127.0.0.1", args.port), credentials)
        print(f"IA-TB ADMIN read-only bound to 127.0.0.1:{args.port} (SSH tunnel required)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
