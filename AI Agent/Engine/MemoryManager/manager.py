"""v0.2 API over the existing v0.1 append-only SQLite journal; no schema reset."""
from __future__ import annotations

import json
from pathlib import Path
import sys

_GENERAL = Path(__file__).resolve().parents[2] / "Memory" / "General"
if str(_GENERAL) not in sys.path:
    sys.path.insert(0, str(_GENERAL))
from journal import append as journal_append, connect, no_secrets  # noqa: E402


class MemoryManager:
    def __init__(self):
        self.db = connect()

    def close(self) -> None:
        self.db.close()

    def init(self) -> dict:
        version = self.db.execute(
            "SELECT value FROM memory_metadata WHERE key='schema_version'").fetchone()[0]
        return {"status": "READY", "schema_version": version}

    def append(self, **entry: object) -> int:
        return journal_append(self.db, **entry)

    def get(self, event_id: int) -> dict | None:
        if not isinstance(event_id, int) or event_id < 1:
            raise ValueError("Invalid memory id")
        row = self.db.execute(
            "SELECT * FROM general_memory WHERE id=?", (event_id,)).fetchone()
        return dict(row) if row else None

    def correct(self, event_id: int, *, summary: str, source: str = "user",
                reference: str = "") -> int:
        if self.get(event_id) is None:
            raise KeyError("Unknown memory event")
        return self.append(kind="correction", source=source, summary=summary,
                           reference=reference, correction_of=event_id)

    def search(self, term: str = "", *, kind: str | None = None,
               reference: str | None = None, start_utc: str | None = None,
               end_utc: str | None = None, limit: int = 100) -> list[dict]:
        if not isinstance(limit, int) or not 1 <= limit <= 1000:
            raise ValueError("Invalid limit")
        args: list[str | int] = []
        clauses = []
        if term:
            clauses.append("instr(lower(summary),lower(?)) > 0")
            args.append(no_secrets(term))
        if kind:
            clauses.append("kind=?")
            args.append(kind)
        if reference:
            clauses.append("reference=?")
            args.append(no_secrets(reference))
        if start_utc:
            clauses.append("created_at_utc >= ?")
            args.append(start_utc)
        if end_utc:
            clauses.append("created_at_utc <= ?")
            args.append(end_utc)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        args.append(limit)
        rows = self.db.execute(
            "SELECT * FROM general_memory" + where + " ORDER BY id DESC LIMIT ?", args)
        return [dict(row) for row in rows]

    def stats(self) -> dict:
        counts = {row["kind"]: row["n"] for row in self.db.execute(
            "SELECT kind, COUNT(*) AS n FROM general_memory GROUP BY kind")}
        return {"count": sum(counts.values()), "by_kind": counts, "schema_version": "1"}

    def export(self, limit: int = 1000) -> list[dict]:
        """Return bounded JSON-serializable records; caller applies authorization."""
        return self.search(limit=limit)
