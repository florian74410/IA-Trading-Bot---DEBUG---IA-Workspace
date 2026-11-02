"""Persistent, fail-closed mission orchestration state for isolated IA-TB work.

Does not execute arbitrary commands or grant deployment authority.
The trusted integration must supply an external approval verification callback.
SQLite transactions make transitions durable and serialize concurrent writers.
"""
from __future__ import annotations

import json
import re
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Callable

from mission import Mission, Phase

SHA = re.compile(r"^[0-9a-f]{40}$")


class MissionConflict(ValueError):
    pass


class MissionStore:
    def __init__(self, database: str | Path):
        self.database = str(database)
        if self.database != ":memory:":
            p = Path(self.database)
            if p.is_symlink() or (p.exists() and not p.is_file()):
                raise ValueError("Database must be a regular file")
            if not p.parent.is_dir():
                raise ValueError("Database parent directory must exist")
        with self._connect() as con:
            con.executescript("""
                CREATE TABLE IF NOT EXISTS missions (
                    id TEXT PRIMARY KEY,
                    environment TEXT NOT NULL CHECK(environment IN ('debug','architecture')),
                    description TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    attempts INTEGER NOT NULL,
                    max_attempts INTEGER NOT NULL,
                    approved_sha TEXT,
                    revision INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                    mission_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    previous TEXT,
                    current TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    at INTEGER NOT NULL,
                    PRIMARY KEY (mission_id, seq),
                    FOREIGN KEY (mission_id) REFERENCES missions(id)
                );
            """)

    def _connect(self):
        con = sqlite3.connect(self.database, timeout=5, isolation_level=None)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA busy_timeout=5000")
        con.execute("PRAGMA foreign_keys=ON")
        return con

    def create(self, environment: str, description: str, max_attempts: int = 3) -> dict:
        model = Mission(environment=environment, description=description, max_attempts=max_attempts)
        now = int(time.time())
        with self._connect() as con:
            con.execute("BEGIN IMMEDIATE")
            con.execute("""INSERT INTO missions
                (id,environment,description,phase,attempts,max_attempts,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?)""",
                (model.mission_id, environment, description, Phase.CREATED.value, 0, max_attempts, now, now))
            con.execute("""INSERT INTO events (mission_id,seq,previous,current,reason,at)
                VALUES (?,?,?,?,?,?)""", (model.mission_id, 0, None, Phase.CREATED.value, "created", now))
            con.commit()
        return self.get(model.mission_id)

    def get(self, mission_id: str) -> dict:
        with self._connect() as con:
            row = con.execute("SELECT * FROM missions WHERE id=?", (mission_id,)).fetchone()
            if row is None:
                raise KeyError("Unknown mission")
            return dict(row)

    def history(self, mission_id: str) -> list[dict]:
        self.get(mission_id)
        with self._connect() as con:
            return [dict(x) for x in con.execute(
                "SELECT seq,previous,current,reason,at FROM events WHERE mission_id=? ORDER BY seq",
                (mission_id,)).fetchall()]

    def advance(
        self,
        mission_id: str,
        target: Phase,
        reason: str,
        *,
        expected_revision: int,
        approved_sha: str | None = None,
        verify_approval: Callable[[str, str, str], bool] | None = None,
    ) -> dict:
        if not isinstance(target, Phase):
            raise ValueError("Invalid mission state")
        if not reason or len(reason) > 500:
            raise ValueError("Reason required (max 500 characters)")
        with self._connect() as con:
            con.execute("BEGIN IMMEDIATE")
            row = con.execute("SELECT * FROM missions WHERE id=?", (mission_id,)).fetchone()
            if row is None:
                raise KeyError("Unknown mission")
            if row["revision"] != expected_revision:
                raise MissionConflict("Stale mission revision")
            model = Mission(
                environment=row["environment"], description=row["description"],
                max_attempts=row["max_attempts"], mission_id=row["id"],
                phase=Phase(row["phase"]), attempts=row["attempts"],
                approved_sha=row["approved_sha"])
            if target == Phase.APPROVED:
                # A string SHA from the agent is insufficient proof of administrator approval.
                if not isinstance(approved_sha, str) or not SHA.fullmatch(approved_sha):
                    raise PermissionError("Pinned SHA required")
                if verify_approval is None or verify_approval(
                    row["environment"], mission_id, approved_sha) is not True:
                    raise PermissionError("Trusted external approval required")
            elif approved_sha is not None:
                raise ValueError("SHA allowed only during approval")
            model.transition(target, reason=reason, approved_sha=approved_sha)
            now = int(time.time())
            rev = row["revision"] + 1
            con.execute("""UPDATE missions SET phase=?,attempts=?,approved_sha=?,revision=?,updated_at=?
                WHERE id=? AND revision=?""", (model.phase.value, model.attempts, model.approved_sha,
                    rev, now, mission_id, row["revision"]))
            con.execute("""INSERT INTO events(mission_id,seq,previous,current,reason,at)
                VALUES(?,?,?,?,?,?)""", (mission_id, rev, row["phase"], target.value, reason, now))
            con.commit()
        return self.get(mission_id)
