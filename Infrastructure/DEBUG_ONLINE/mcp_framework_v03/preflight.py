#!/usr/bin/env python3
"""IA-TB MCP v0.3 read-only deployment preflight.

No sudo, no network requests, no secrets, no writes.
Run under existing SSH user at final integration. Nonzero indicates that
operator must investigate before attempting an upgrade.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import socket
import subprocess
from pathlib import Path

CONFIG = {
    "debug": {"service": "iatb-mcp", "port": 8800, "source": "/opt/iatb-mcp/server.py",
              "workspace": "/srv/iatb-mcp-workspace"},
    "architecture": {"service": "iatb-architecture-mcp", "port": 8810,
                     "source": "/opt/iatb-architecture-mcp/server.py",
                     "workspace": "/srv/iatb-architecture/workspace"},
}


def command(argv: list[str], timeout: int = 5) -> dict:
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=False,
                           stdin=subprocess.DEVNULL,
                           env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
        return {"exit": p.returncode, "out": p.stdout.strip()[:2000]}
    except (OSError, subprocess.TimeoutExpired):
        return {"exit": -1, "out": ""}


def inspect(env: str, config: dict) -> dict:
    source = Path(config["source"])
    work = Path(config["workspace"])
    response = {
        "environment": env,
        "service": config["service"],
        "port": config["port"],
        "source_exists": source.is_file(),
        "source_sha256": None,
        "source_readable": os.access(source, os.R_OK),
        "workspace_exists": work.is_dir(),
        "service_active": False,
        "loopback_port_listening": False,
        "issues": [],
    }
    if response["source_readable"] and response["source_exists"]:
        response["source_sha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
    if not response["source_exists"]:
        response["issues"].append("source_missing_or_different_install_path")
    if not response["workspace_exists"]:
        response["issues"].append("workspace_missing_or_different_install_path")
    service = command(["systemctl", "is-active", config["service"]])
    response["service_active"] = service["exit"] == 0 and service["out"] == "active"
    if not response["service_active"]:
        response["issues"].append("service_not_active")
    # Loopback TCP probe only. Does not attempt an HTTP MCP session or send credentials.
    try:
        with socket.create_connection(("127.0.0.1", config["port"]), timeout=1):
            response["loopback_port_listening"] = True
    except OSError:
        response["issues"].append("loopback_port_not_listening")
    # A missing SHA may simply indicate the service account owns a private source.
    if response["source_exists"] and response["source_sha256"] is None:
        response["issues"].append("source_not_readable_as_current_user")
    return response


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--environment", choices=("debug", "architecture", "both"), default="both")
    args = parser.parse_args()
    profiles = list(CONFIG) if args.environment == "both" else [args.environment]
    checks = [inspect(k, CONFIG[k]) for k in profiles]
    print(json.dumps({"schema": "iatb-mcp-preflight-v1", "checks": checks,
                      "success": all(not c["issues"] for c in checks)},
                     sort_keys=True, indent=2))
    return 0 if all(not c["issues"] for c in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
