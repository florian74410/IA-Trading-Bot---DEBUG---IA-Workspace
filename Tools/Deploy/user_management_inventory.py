#!/usr/bin/env python3
"""Offline metadata inventory. Never decrypts or assigns historical data.

Run after stopping writers, on a private copy of the installation. Immutable
SQLite connections cannot create WAL/SHM files. Nonempty WALs are rejected: an
operator must checkpoint the original database before copying it.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import stat


def inventory(data_root):
    root = Path(data_root)
    if not root.is_absolute() or root.resolve(strict=True) != root:
        raise ValueError("CANONICAL_ABSOLUTE_DATA_ROOT_REQUIRED")
    report = {"schema": "iatb.user-management.inventory/1", "writes": False,
              "automaticAttribution": False, "files": [], "issues": []}
    for rel in ("Database/clients.sqlite", "Security/client_master.key", "Security/wallet_master.key",
                "User Data/default/user_data.db", "User Data/default/portfolio.db"):
        file = root / rel
        if not file.exists():
            report["files"].append({"path": rel, "exists": False})
            if rel in ("Database/clients.sqlite", "Security/client_master.key", "Security/wallet_master.key"):
                report["issues"].append(rel + ": REQUIRED_ORIGINAL_FILE_MISSING")
            continue
        info = file.lstat()
        if not stat.S_ISREG(info.st_mode) or file.resolve() != file or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError("PRIVATE_OWNER_REGULAR_FILE_REQUIRED: " + rel)
        item = {"path": rel, "exists": True, "bytes": info.st_size}
        report["files"].append(item)
        if rel.endswith(".key"):
            if len(file.read_text().strip()) != 64 or any(c not in "0123456789abcdefABCDEF" for c in file.read_text().strip()):
                report["issues"].append(rel + ": INVALID_KEY_FORMAT")
            continue
        wal = Path(str(file) + "-wal")
        if wal.exists() and wal.stat().st_size:
            report["issues"].append(rel + ": NONEMPTY_WAL_CHECKPOINT_BEFORE_COPY")
            continue
        with sqlite3.connect(file.as_uri() + "?mode=ro&immutable=1", uri=True) as db:
            item["integrity"] = "ok" if db.execute("PRAGMA integrity_check").fetchone()[0] == "ok" else "FAILED"
            item["foreignKeys"] = "ok" if not db.execute("PRAGMA foreign_key_check").fetchall() else "FAILED"
            tables = {x[0] for x in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            item["tableCount"] = len(tables)
            if "clients" in tables:
                item["accountCount"] = db.execute("SELECT COUNT(*) FROM clients").fetchone()[0]
            if "client_schema_migrations" in tables:
                item["migrationVersions"] = [x[0] for x in db.execute("SELECT version FROM client_schema_migrations ORDER BY version")]
            if item["integrity"] != "ok" or item["foreignKeys"] != "ok":
                report["issues"].append(rel + ": SQLITE_CHECK_FAILED")
    report["readyForOperatorReview"] = not report["issues"]
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_root")
    args = parser.parse_args()
    try:
        result = inventory(args.data_root)
        print(json.dumps(result, indent=2))
        raise SystemExit(0 if result["readyForOperatorReview"] else 1)
    except (ValueError, OSError, sqlite3.Error):
        print(json.dumps({"error": "INVENTORY_FAILED_CHECK_PRIVATE_OFFLINE_COPY"}))
        raise SystemExit(1)
