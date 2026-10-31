#!/usr/bin/env python3
"""Read-only IA-TB DEBUG Online diagnostics. Never alter Docker/RELEASE."""
from __future__ import annotations
from collections import deque
import datetime
import json
import os
from pathlib import Path
import re
import socket
import ssl
import subprocess
import sys

PRIVATE = Path("/srv/iatb-debug/online/private")
LOGS = PRIVATE / "runtime" / "logs"
SOURCE = Path("/srv/iatb-debug/online/source")
CONTAINER = "iatb-debug-online-app"
SERVICES = ["core","router","firewall","marketdata","indicator","fundamental",
            "liquidity","risk","trading","portfolio","strategy","supervisor","ui","edge"]
DANGER = re.compile(
    r"(bearer\s+\S+|(?:password|passwd|secret|api[_-]?key|token|private[_-]?key|authorization|cookie)"
    r"\s*(?:=|:|\s+)\s*[^\s,;]+)",
    re.IGNORECASE,
)
EMAIL = re.compile(r"(?<![\w.-])[\w.+-]+@[\w.-]+\.[a-z]{2,}", re.IGNORECASE)
KEY = re.compile(r"\b[A-Za-z0-9_-]{45,}\b")
HEX = re.compile(r"\b[a-fA-F0-9]{64,}\b")

def safe_line(line):
    # Never print raw credentials; redact common secret patterns, identities and long tokens.
    line = DANGER.sub("[REDACTED_CREDENTIAL]", line)
    line = EMAIL.sub("[REDACTED_EMAIL]", line)
    line = HEX.sub("[REDACTED_HEX]", line)
    line = KEY.sub("[REDACTED_TOKEN]", line)
    return line[:300]

def run(args, timeout=8):
    try:
        r=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                         timeout=timeout,check=False)
        return r.returncode,r.stdout,r.stderr
    except Exception as exc:
        return 125,"",type(exc).__name__+": "+str(exc)

def local_tls(path):
    crt=PRIVATE/"tls"/"localhost.crt"
    if not crt.is_file(): return "certificate missing"
    try:
        context=ssl.create_default_context(cafile=str(crt))
        with socket.create_connection(("127.0.0.1",18000),timeout=4) as sock:
            with context.wrap_socket(sock,server_hostname="localhost") as tls:
                tls.settimeout(5)
                tls.sendall(("GET "+path+" HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").encode())
                first=tls.recv(2048).split(b"\r\n",1)[0]
                return first.decode("ascii",errors="replace")[:120]
    except Exception as exc:
        return type(exc).__name__+": "+str(exc)[:160]

def display_log(name, path, limit=14):
    print("\n===== "+name+" =====")
    if path.is_symlink() or not path.is_file():
        print("missing or unsafe log path");return
    if not str(path.resolve()).startswith(str(LOGS.resolve())+"/"):
        print("log is outside DEBUG; refused");return
    try:
        with path.open(encoding="utf-8",errors="replace") as file:
            lines=deque(file,maxlen=limit)
        print("".join(safe_line(x)+"\n" for x in lines) if lines else "(empty)")
    except Exception as exc:
        print("Read failed:",type(exc).__name__)

def main():
    if os.geteuid()!=0:
        print("Run with sudo to read isolated DEBUG logs");return 2
    print("IA-TB DEBUG online diagnostic — READ ONLY")
    print("UTC",datetime.datetime.now(datetime.timezone.utc).isoformat())
    print("No secrets, Docker mutation or RELEASE access.")
    r,sha,_=run(["git","-C",str(SOURCE),"rev-parse","HEAD"])
    if r==0: print("SOURCE_SHA",sha.strip())
    rc,stdout,stderr=run(["docker","inspect",CONTAINER])
    if rc==0:
        try:
            item=json.loads(stdout)[0]
            st=item.get("State",{})
            print("CONTAINER",json.dumps({
                "status":st.get("Status"),"running":st.get("Running"),
                "exitCode":st.get("ExitCode"),"error":st.get("Error"),
                "restarting":st.get("Restarting"),
                "health":(st.get("Health") or {}).get("Status"),
                "composeProject":item.get("Config",{}).get("Labels",{}).get("com.docker.compose.project")
            }))
        except Exception as exc:print("Inspect read issue:",type(exc).__name__)
    else:print("Container not found or inspect failed:",safe_line(stderr))
    for path in ("/ui-health","/","/auth21/me","/login"):
        print("HTTPS",path,local_tls(path))
    rc,stdout,stderr=run(["docker","logs","--tail","45",CONTAINER],timeout=10)
    print("\n===== DOCKER STARTUP LOG (sanitized) =====")
    for line in (stdout+"\n"+stderr).splitlines()[-45:]:
        print(safe_line(line))
    if not LOGS.is_dir() or LOGS.is_symlink():
        print("DEBUG log folder absent or unsafe");return 0
    for name in SERVICES:
        display_log(name,LOGS/(name+".log"),limit=16 if name in ("core","ui") else 8)
    print("\nREAD ONLY DIAGNOSTIC FINISHED. Review output for remaining sensitive content before sharing.")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
