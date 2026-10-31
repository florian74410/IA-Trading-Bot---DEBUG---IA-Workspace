#!/usr/bin/env python3
"""Non-destructive repository preflight for IA-TB DEBUG Online (no VPS access)."""
from __future__ import annotations
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP = ROOT / "App"

def check(condition: bool, reason: str) -> None:
    if not condition:
        raise RuntimeError(reason)

def main() -> int:
    package = json.loads((APP / "package.json").read_text(encoding="utf-8"))
    version = str(package.get("version", ""))
    check(re.fullmatch(r"2\.\d+\.\d+", version) is not None,
          "Unexpected IA-TB package version")
    check(package.get("engines", {}).get("node") == ">=22 <23",
          "Node 22 constraint has changed; re-audit the runtime image")
    dockerfile = (APP / "Dockerfile.app").read_text(encoding="utf-8")
    check("FROM node:22-" in dockerfile,
          "Docker runtime no longer explicitly targets Node 22")
    for name in (
        "UI/Gateway/ui_service.js",
        "Core/Server/server.js",
        "start_auth21_local_safe.command",
        "package-lock.json",
        "VERSION",
    ):
        check((APP / name).is_file(), f"Missing required source: {name}")
    check("IATB_TRADING_LIVE=0" in
          (APP / "start_auth21_local_safe.command").read_text(encoding="utf-8"),
          "Safety launch flag missing from baseline; review before deployment")
    # Deliberately avoid reading secrets or the VPS filesystem here.
    print(f"PASS: IA-TB v{version} source/Node/preflight checks")
    print("NOTE: This is not a deployability or Auth21 integration test.")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
