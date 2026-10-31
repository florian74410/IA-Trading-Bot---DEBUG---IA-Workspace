"""Independent append-only structured audit writer; no arbitrary log content."""
from __future__ import annotations

import json
from pathlib import Path
import re
import sqlite3

CREDENTIAL = re.compile(r"(-----BEGIN .*PRIVATE KEY-----|Bearer\s+\S+|(?:token|password|secret|api_key)\s*[:=]\s*\S+)", re.I)
COLUMNS = ("request_id", "principal", "operator", "action", "resource",
           "policy_version", "decision", "approved_by", "approved_at_utc",
           "execution_duration_ms", "exit_code", "commit_sha", "github_run_id",
           "health_before", "health_after", "result")
REQUIRED = ("principal", "action", "resource", "policy_version", "decision")


class AuditLog:
    def __init__(self, db_file: Path):
        db_file = Path(db_file)
        if not db_file.is_absolute() or db_file.is_symlink():
            raise ValueError("Absolute, non-symlink audit DB required")
        db_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if db_file.parent.is_symlink() or db_file.parent.stat().st_mode & 0o077:
            raise PermissionError("Audit parent must be private")
        if db_file.exists() and (db_file.stat().st_mode & 0o077):
            raise PermissionError("Audit DB must be private")
        self.db = sqlite3.connect(db_file)
        db_file.chmod(0o600)
        self.db.executescript(Path(__file__).with_name("schema.sql").read_text())

    def append(self, **event: object) -> int:
        if set(event) - set(COLUMNS) or any(not event.get(k) for k in REQUIRED):
            raise ValueError("Missing required audit fields or unknown keys")
        if event["decision"] not in ("ALLOW", "DENY", "RESTRICTED", "HARD_DENY"):
            raise ValueError("Invalid audit decision")
        for key, value in event.items():
            if isinstance(value, str) and (CREDENTIAL.search(value) or len(value) > 2000):
                raise ValueError("Potential secret or oversized audit value")
        columns = list(event)
        query = f"INSERT INTO audit_events({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})"
        with self.db:
            cur = self.db.execute(query, [event[k] for k in columns])
        return int(cur.lastrowid)

    def export(self, limit: int = 100) -> list[dict]:
        if not 1 <= limit <= 1000:
            raise ValueError("Invalid limit")
        self.db.row_factory = sqlite3.Row
        return [dict(row) for row in self.db.execute(
            "SELECT * FROM audit_events ORDER BY id DESC LIMIT ?", (limit,))]

    def close(self) -> None:
        self.db.close()
