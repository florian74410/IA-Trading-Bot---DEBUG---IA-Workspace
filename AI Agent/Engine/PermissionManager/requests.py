"""Administrative request queue; never issues credentials or executable grants.

Admin proof MUST be checked by a separate trusted component outside the agent's
Git workspace. Approval here is a record only, NOT a capability at the gateway.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import sqlite3
import uuid
from typing import Protocol

IDENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
ACTION = re.compile(r"^[a-z][a-z0-9_.:-]{0,95}$")
RESOURCE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_./:-]{0,191}$")


class ApprovalVerifier(Protocol):
    def verify(self, *, proof: str, request_id: str, admin_identity: str,
               action: str, resource: str, duration_seconds: int,
               max_uses: int) -> bool: ...


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class RequestStore:
    """SQLite request registry. DB path must belong to an isolated protected directory."""

    def __init__(self, path: Path, verifier: ApprovalVerifier | None = None):
        path = Path(path)
        if not path.is_absolute() or path.is_symlink():
            raise ValueError("Private DB requires a non-symlink absolute path")
        if path.parent.exists() and path.parent.is_symlink():
            raise ValueError("Symlink parent prohibited")
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if path.parent.stat().st_mode & 0o077:
            raise PermissionError("Private directory required")
        if path.exists() and (not path.is_file() or path.stat().st_mode & 0o077):
            raise PermissionError("Private database required")
        self.path = path
        self.verifier = verifier
        self.db = sqlite3.connect(str(path), timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA busy_timeout=10000")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((Path(__file__).with_name("schema.sql")).read_text())
        path.chmod(0o600)

    def close(self) -> None:
        self.db.close()

    def _fetch(self, request_id: str) -> dict:
        row = self.db.execute("SELECT * FROM requests WHERE id=?", (request_id,)).fetchone()
        if row is None:
            raise KeyError("Unknown request")
        return dict(row)

    def submit(self, *, principal: str, action: str, resource: str,
               reason: str, risks: str, duration_seconds: int,
               max_uses: int, rollback: str = "", conditions: str = "") -> dict:
        if not IDENT.fullmatch(principal) or not ACTION.fullmatch(action) or not RESOURCE.fullmatch(resource):
            raise ValueError("Invalid request identity or scope")
        if any(x in resource.lower() for x in ("release", "production", "docker.sock")):
            raise ValueError("Protected resource")
        if not (10 <= len(reason.strip()) <= 2000 and 5 <= len(risks.strip()) <= 2000):
            raise ValueError("Explain reason and risks")
        if not (isinstance(duration_seconds, int) and 1 <= duration_seconds <= 3600):
            raise ValueError("Invalid duration")
        if not (isinstance(max_uses, int) and 1 <= max_uses <= 5):
            raise ValueError("Invalid use count")
        if len(rollback) > 2000 or len(conditions) > 2000:
            raise ValueError("Excessive free text")
        request_id = str(uuid.uuid4())
        deadline = (now_utc() + timedelta(seconds=duration_seconds)).isoformat()
        with self.db:
            self.db.execute("""INSERT INTO requests
                (id, principal, action, resource, reason, risks, conditions, rollback,
                 expires_at, max_uses, status) VALUES (?,?,?,?,?,?,?,?,?,?,'PENDING')""",
                (request_id, principal, action, resource, reason, risks,
                 conditions, rollback, deadline, max_uses))
        return self.get(request_id)

    def get(self, request_id: str) -> dict:
        item = self._fetch(request_id)
        if item["status"] == "PENDING" and datetime.fromisoformat(item["expires_at"]) <= now_utc():
            with self.db:
                self.db.execute("UPDATE requests SET status='EXPIRED' WHERE id=? AND status='PENDING'", (request_id,))
            item = self._fetch(request_id)
        return item

    def list(self, status: str = "PENDING", limit: int = 50) -> list[dict]:
        if status not in ("PENDING", "APPROVED", "REJECTED", "EXPIRED", "REVOKED"):
            raise ValueError("Invalid status")
        if not isinstance(limit, int) or not 1 <= limit <= 100:
            raise ValueError("Invalid limit")
        ids = [x[0] for x in self.db.execute(
            "SELECT id FROM requests WHERE status=? ORDER BY created_at_utc DESC LIMIT ?", (status, limit))]
        return [self.get(i) for i in ids if self.get(i)["status"] == status]

    def decide(self, request_id: str, *, status: str, admin_identity: str,
               proof: str | None = None) -> dict:
        if status not in ("APPROVED", "REJECTED", "REVOKED"):
            raise ValueError("Unsupported state transition")
        item = self.get(request_id)
        if item["status"] not in (("PENDING",) if status != "REVOKED" else ("APPROVED",)):
            raise ValueError("Invalid state transition")
        if not IDENT.fullmatch(admin_identity) or admin_identity == item["principal"]:
            raise PermissionError("Independent admin identity is required")
        if self.verifier is None or not proof:
            raise PermissionError("Out-of-band administrative proof required")
        try:
            verified = self.verifier.verify(
                proof=proof, request_id=request_id, admin_identity=admin_identity,
                action=item["action"], resource=item["resource"],
                duration_seconds=max(0, int((datetime.fromisoformat(item["expires_at"]) - now_utc()).total_seconds())),
                max_uses=item["max_uses"])
        except Exception as exc:
            raise PermissionError("Approval verifier unavailable") from exc
        if verified is not True:
            raise PermissionError("Administrative proof rejected")
        with self.db:
            cur = self.db.execute(
                "UPDATE requests SET status=?, decided_by=?, decided_at_utc=? WHERE id=? AND status=?",
                (status, admin_identity, now_utc().isoformat(), request_id, item["status"]))
            if cur.rowcount != 1:
                raise RuntimeError("Concurrent request state change")
        return self.get(request_id)
