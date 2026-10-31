#!/usr/bin/env python3
"""IA-TB Admin Phase 3: read-only HTTPS reverse-proxy backend with password + TOTP.

Bound to 127.0.0.1 only. HTTPS termination is the separately reviewed Caddy
configuration. No permission grants, shell, Docker, or data mutations.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import getpass
import hashlib
import hmac
from http import cookies
import html
import json
import os
from pathlib import Path
import re
import secrets
import struct
import sys
import time
import urllib.parse
import stat

import server as core

HOST = "ia.iatb.duckdns.org"
ORIGIN = "https://" + HOST
COOKIE = "__Host-iatb_admin"
IDLE_SECONDS = 1800
ABSOLUTE_SECONDS = 8 * 3600
MAX_SESSIONS = 32
TOTP_WINDOW = 1
MFA_FILE_MODE = 0o600
SAFE_GET = frozenset(("dashboard","connections","permissions","denied","requests",
                      "audit","skills","memory","soul","journal","overview"))
ASSET_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.css": ("app.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
}

def read_mfa(path: Path) -> bytes:
    path = core.credential_file(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    if set(data) != {"version", "totp_secret"} or data["version"] != 1:
        raise ValueError("Unrecognized MFA data")
    secret = data["totp_secret"]
    if not isinstance(secret, str) or not re.fullmatch(r"[A-Z2-7]{32}", secret):
        raise ValueError("Invalid TOTP seed")
    return base64.b32decode(secret)

def otp_code(seed: bytes, step: int) -> str:
    mac = hmac.new(seed, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = mac[-1] & 15
    value = (struct.unpack(">I", mac[offset:offset + 4])[0] & 0x7fffffff) % 1000000
    return f"{value:06d}"

def verify_totp(seed: bytes, supplied: str, now: float | None = None) -> int | None:
    if not re.fullmatch(r"[0-9]{6}", supplied):
        return None
    current = int((time.time() if now is None else now) // 30)
    for step in (current, current - 1, current + 1):
        if step >= 0 and hmac.compare_digest(otp_code(seed, step), supplied):
            return step
    return None

def init_mfa(path: Path) -> None:
    path = Path(path)
    if os.geteuid() == 0 or not sys.stdin.isatty() or not sys.stdout.isatty():
        raise ValueError("MFA enrollment requires a non-root interactive terminal")
    if not path.is_absolute() or path.is_symlink():
        raise ValueError("MFA file must be an absolute non-symlink path")
    if not path.parent.is_dir() or path.parent.is_symlink() or path.parent.stat().st_mode & 0o077:
        raise PermissionError("MFA directory must exist and have mode 0700")
    if path.exists():
        raise FileExistsError("MFA exists; use controlled offline rotation")
    seed = secrets.token_bytes(20)
    code = base64.b32encode(seed).decode()
    print("PRIVATE TOTP ENROLLMENT: never copy this seed to Git, ChatGPT or logs.")
    print("Issuer: IA-TB Admin; account: admin@" + HOST)
    print("Secret for authenticator app: " + code)
    uri = "otpauth://totp/" + urllib.parse.quote("IA-TB Admin:admin@" + HOST)
    uri += "?secret=" + code + "&issuer=IA-TB%20Admin&algorithm=SHA1&digits=6&period=30"
    print("Authenticator URI (private): " + uri)
    checked = getpass.getpass("Enter the current 6-digit authenticator code: ")
    if verify_totp(seed, checked) is None:
        raise ValueError("TOTP verification failed; no enrollment performed")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, MFA_FILE_MODE)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"version": 1, "totp_secret": code}, handle)
            handle.write("\n")
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    print("MFA_READY. Store the backup authenticator seed offline.")

class PublicHandler(core.BaseHTTPRequestHandler):
    server_version = "IATB-Admin-Public/phase3"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, fmt, *args):
        # Never log full URLs or cookie/password/TOTP.
        pass

    def respond(self, body: bytes, content_type="text/html; charset=utf-8", status=200, extra=None):
        self.send_response(status)
        for k, v in (
            ("Content-Type",content_type),("Content-Length",str(len(body))),
            ("Cache-Control","no-store"),("Pragma","no-cache"),
            ("X-Content-Type-Options","nosniff"),("X-Frame-Options","DENY"),
            ("Referrer-Policy","no-referrer"),
            ("Cross-Origin-Opener-Policy","same-origin"),
            ("Strict-Transport-Security","max-age=31536000"),
            ("Content-Security-Policy",
             "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; "
             "connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
        ):
            self.send_header(k,v)
        for k,v in extra or []:
            self.send_header(k,v)
        self.end_headers()
        self.wfile.write(body)

    def json(self, data, status=200):
        self.respond(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode(),
                     "application/json; charset=utf-8", status)

    def valid_host(self) -> bool:
        if len(self.headers.get_all("Host", [])) != 1 or self.headers.get("Host") != HOST:
            self.json({"error": "invalid_host"}, 400)
            return False
        if self.path != urllib.parse.urlsplit(self.path).path:
            self.json({"error": "invalid_path"}, 400)
            return False
        if len(self.headers.get_all("Cookie", [])) > 1 or len(self.headers.get_all("Authorization", [])) > 1:
            self.json({"error": "ambiguous_headers"}, 400)
            return False
        # Proxies must strip identity claims. We do not trust forwarded identity.
        if self.headers.get("X-Remote-User") or self.headers.get("X-Auth-Request-User"):
            self.json({"error": "untrusted_identity"}, 400)
            return False
        return True

    def session(self):
        c = cookies.SimpleCookie()
        try:
            raw = self.headers.get("Cookie", "")
            if len(raw) > 2000:
                return None
            c.load(raw)
            value = c.get(COOKIE)
            token = value.value if value else ""
        except cookies.CookieError:
            return None
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        now = time.monotonic()
        with self.server.lock:
            session = self.server.sessions.get(digest)
            if session is None:
                return None
            if now - session["last"] > IDLE_SECONDS or now > session["expires"]:
                self.server.sessions.pop(digest, None)
                return None
            session["last"] = now
            return session

    def login_page(self, error: bool = False):
        notice = "<p role='alert'>Identifiants ou code incorrects.</p>" if error else ""
        page = f"""<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IA-TB · ADMIN Login</title>
<style>body{{min-height:100vh;display:grid;place-items:center;background:#070e1c;color:#e2f4ff;font:16px system-ui}}
main{{width:min(360px,90vw);padding:2rem;background:#0e1b2e;border:1px solid #2472a0;border-radius:16px}}
label{{display:block;margin-top:1rem}}input{{width:100%;box-sizing:border-box;padding:.7rem;background:#081326;border:1px solid #2c7498;border-radius:8px;color:white}}
button{{margin-top:1.3rem;width:100%;padding:.8rem;background:#0877bb;color:white;border:0;border-radius:8px;font-weight:bold}}</style>
<main><h1>IA-TB · ADMIN</h1><p>Authentification renforcée</p>{notice}
<form method="post" action="/login" autocomplete="off">
<label>Compte<input name="username" value="admin" autocomplete="username" required></label>
<label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
<label>Code authenticator<input name="totp" inputmode="numeric" pattern="[0-9]{{6}}" maxlength="6" autocomplete="one-time-code" required></label>
<button type="submit">Connexion sécurisée</button>
</form></main></html>"""
        self.respond(page.encode("utf-8"), status=401 if error else 200)

    def do_GET(self):
        if not self.valid_host():
            return
        if self.path == "/healthz":
            # Caddy must block this public route; private loopback probe only.
            self.json({"ok": True, "mode": "mfa_read_only"})
            return
        session = self.session()
        if self.path == "/login":
            if session:
                self.respond(b"", status=303, extra=[("Location", "/")])
            else:
                self.login_page()
            return
        if not session:
            if self.path.startswith("/api/"):
                self.json({"error":"authentication_required"}, 401)
            else:
                self.respond(b"", status=303, extra=[("Location", "/login")])
            return
        if self.path in ASSET_FILES:
            name, kind = ASSET_FILES[self.path]
            self.respond((core.HERE / name).read_bytes(), kind)
            return
        if self.path.startswith("/api/") and self.path[5:] in SAFE_GET:
            name = self.path[5:]
            try:
                if name in ("dashboard", "connections"):
                    data = core.collect_connections()
                elif name == "soul":
                    data = core.collect_soul()
                elif name == "journal":
                    data = core.collect_journal()
                elif name == "overview":
                    data = {"mode":"mfa_read_only","principal":"ADMIN",
                            "environment":"GEN-1 DEBUG / ISOLATED",
                            "permissions":"DECLARATIVE_ONLY",
                            "gateway":"UNCONNECTED","execution":False}
                else:
                    data = core.collect(name)
            except (OSError, ValueError, KeyError, ImportError):
                self.json({"status":"unavailable","items":[]}, 503)
                return
            self.json(data)
            return
        self.json({"error":"not_found"},404)

    def do_POST(self):
        if not self.valid_host():
            return
        if self.headers.get("Origin") != ORIGIN:
            self.json({"error":"invalid_origin"},403)
            return
        if self.headers.get("Content-Type") != "application/x-www-form-urlencoded":
            self.json({"error":"invalid_content_type"},415)
            return
        try:
            length = int(self.headers.get("Content-Length","-1"))
        except ValueError:
            length = -1
        if not 0 <= length <= 2048:
            self.json({"error":"invalid_body_size"},413)
            return
        data = self.rfile.read(length)
        try:
            body = urllib.parse.parse_qs(data.decode("utf-8"),strict_parsing=True,max_num_fields=4)
        except (UnicodeError,ValueError):
            self.json({"error":"invalid_form"},400)
            return
        if any(len(values)!=1 for values in body.values()):
            self.json({"error":"duplicate_fields"},400)
            return
        if self.path == "/logout":
            sess = self.session()
            if not sess or set(body) != {"csrf"} or not hmac.compare_digest(sess["csrf"],body["csrf"][0]):
                self.json({"error":"invalid_csrf"},403)
                return
            with self.server.lock:
                self.server.sessions.pop(sess["digest"], None)
            self.respond(b"",status=303,extra=[("Location","/login"),
                ("Set-Cookie", COOKIE+"=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict")])
            return
        if self.path != "/login":
            self.json({"error":"read_only"},405)
            return
        if set(body) != {"username", "password", "totp"}:
            self.json({"error":"invalid_form"},400)
            return
        now=time.monotonic()
        with self.server.lock:
            self.server.attempts = [t for t in self.server.attempts if now-t < 300]
            locked = len(self.server.attempts) >= 8
        if locked:
            self.json({"error":"temporarily_locked"},429)
            return
        username=body["username"][0]
        password=body["password"][0]
        otp=body["totp"][0]
        ok_pwd = len(password) <= 256 and core.verify_admin(
            "Basic " + base64.b64encode((username+":"+password).encode()).decode(),
            *self.server.credentials)
        step = verify_totp(self.server.mfa_seed, otp)
        if not ok_pwd or step is None:
            with self.server.lock:
                self.server.attempts.append(now)
            self.login_page(error=True)
            return
        with self.server.lock:
            if step <= self.server.last_totp_step:
                self.server.attempts.append(now)
                self.login_page(error=True)
                return
            self.server.last_totp_step=step
            if len(self.server.sessions) >= MAX_SESSIONS:
                self.server.sessions.clear()
            token=secrets.token_urlsafe(32)
            digest=hashlib.sha256(token.encode()).hexdigest()
            self.server.sessions[digest]={"digest":digest,"csrf":secrets.token_urlsafe(32),
                                          "last":now,"expires":now+ABSOLUTE_SECONDS}
        self.respond(b"",status=303,extra=[
            ("Location","/"),
            ("Set-Cookie",f"{COOKIE}={token}; Path=/; Max-Age={ABSOLUTE_SECONDS}; Secure; HttpOnly; SameSite=Strict")
        ])

    def do_PUT(self):
        self.json({"error":"read_only"},405)
    do_PATCH = do_DELETE = do_PUT

class PublicServer(core.AdminServer):
    def __init__(self, port: int, credential_file: Path, mfa_file: Path):
        creds=core.load_admin(credential_file)
        mfa=read_mfa(mfa_file)
        super().__init__(("127.0.0.1", port), creds)
        self.RequestHandlerClass=PublicHandler
        self.mfa_seed=mfa
        self.sessions={}
        self.last_totp_step=-1
        self.allowed_hosts={HOST}

def main():
    parser=argparse.ArgumentParser(description="IA-TB read-only HTTPS/MFA Admin backend (loopback)")
    sub=parser.add_subparsers(dest="command",required=True)
    enroll=sub.add_parser("init-mfa")
    enroll.add_argument("--mfa-file",type=Path,required=True)
    serve=sub.add_parser("serve")
    serve.add_argument("--credential-file",type=Path,required=True)
    serve.add_argument("--mfa-file",type=Path,required=True)
    serve.add_argument("--port",type=int,default=18083)
    args=parser.parse_args()
    if os.geteuid()==0:
        parser.error("Never run as root")
    if args.command=="init-mfa":
        init_mfa(args.mfa_file)
        return
    if not 1024<=args.port<=65535:
        parser.error("Invalid port")
    service=PublicServer(args.port,args.credential_file,args.mfa_file)
    print(f"IA-TB PUBLIC MFA backend bound to 127.0.0.1:{args.port}; no admin actions",flush=True)
    try:
        service.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        service.server_close()

if __name__=="__main__":
    main()
