#!/usr/bin/env python3
"""IA-TB Agent: append-only SQLite operational memory; Python stdlib only."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sqlite3

KINDS = ("observation", "analysis_summary", "decision", "action", "result", "lesson", "correction")
SOURCES = ("user", "chat", "github", "vps", "documentation", "test")
CONFIDENCES = ("observed", "inferred", "hypothesis")
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----", re.I),
    re.compile(r"\bAuthorization\s*:\s*Bearer\s+\S+", re.I),
    re.compile(r"\b(password|passwd|api[_-]?key|secret|access[_-]?token)\s*[:=]\s*[^\s,;]{6,}", re.I),
)

def database_path() -> Path:
    raw = os.getenv("IATB_AGENT_MEMORY_DB")
    default = Path.home() / ".local" / "share" / "iatb-ai-agent" / "general.sqlite"
    path = Path(raw) if raw else default
    if not path.is_absolute():
        raise ValueError("IATB_AGENT_MEMORY_DB must be an absolute path")
    # A symlink could move the DB into Git or a different service's directory.
    if path.is_symlink():
        raise ValueError("SQLite database symlinks are forbidden")
    if path.parent.exists() and path.parent.is_symlink():
        raise ValueError("SQLite parent symlinks are forbidden")
    return path

def connect() -> sqlite3.Connection:
    target = database_path()
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # The parent is a dedicated private dir; never widen preexisting permissions.
    if target.parent.stat().st_mode & 0o077:
        raise PermissionError("Memory directory must not be group/world accessible")
    if target.exists() and (not target.is_file() or target.stat().st_mode & 0o077):
        raise PermissionError("Memory DB must be a private regular file (0600)")
    db = sqlite3.connect(str(target), timeout=8)
    os.chmod(target, 0o600)
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 8000")
    db.row_factory = sqlite3.Row
    schema = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
    db.executescript(schema)
    if db.execute("SELECT value FROM memory_metadata WHERE key='schema_version'").fetchone()["value"] != "1":
        raise RuntimeError("Unsupported schema version")
    return db

def no_secrets(value: str) -> str:
    if not value or not value.strip():
        raise ValueError("Empty memory text")
    if any(pattern.search(value) for pattern in SECRET_PATTERNS):
        raise ValueError("Potential credential in memory text; redact before recording")
    return value.strip()

def append(db: sqlite3.Connection, *, kind: str, source: str, summary: str,
           reference: str = "", session_ref: str = "",
           confidence: str = "observed", correction_of: int | None = None) -> int:
    if kind not in KINDS or source not in SOURCES or confidence not in CONFIDENCES:
        raise ValueError("Invalid kind/source/confidence")
    if kind == "correction" and correction_of is None:
        raise ValueError("A correction must reference an older entry")
    if kind != "correction" and correction_of is not None:
        raise ValueError("correction_of is only valid for kind=correction")
    summary = no_secrets(summary)
    reference = no_secrets(reference) if reference else ""
    session_ref = no_secrets(session_ref) if session_ref else ""
    if len(summary) > 4000 or len(reference) > 600 or len(session_ref) > 200:
        raise ValueError("Field exceeds memory length limit")
    with db:
        cur = db.execute(
            "INSERT INTO general_memory(kind,summary,source,reference,session_ref,confidence,correction_of) "
            "VALUES (?,?,?,?,?,?,?)",
            (kind, summary, source, reference, session_ref, confidence, correction_of),
        )
    return int(cur.lastrowid)

def display(rows):
    for row in rows:
        print(json.dumps(dict(row), ensure_ascii=False))

def main() -> None:
    p = argparse.ArgumentParser(description="IA-TB AI Agent SQLite general memory")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    write = sub.add_parser("append")
    write.add_argument("--kind", required=True, choices=KINDS)
    write.add_argument("--source", required=True, choices=SOURCES)
    write.add_argument("--summary", required=True)
    write.add_argument("--reference", default="")
    write.add_argument("--session-ref", default="")
    write.add_argument("--confidence", choices=CONFIDENCES, default="observed")
    write.add_argument("--correction-of", type=int)
    listing = sub.add_parser("list")
    listing.add_argument("--limit", type=int, default=20)
    listing.add_argument("--kind", choices=KINDS)
    search = sub.add_parser("search")
    search.add_argument("term")
    search.add_argument("--limit", type=int, default=20)
    sub.add_parser("stats")
    args = p.parse_args()
    if getattr(args, "limit", 1) not in range(1, 101):
        p.error("--limit must be between 1 and 100")
    with connect() as db:
        if args.command == "init":
            print("MEMORY_READY")
        elif args.command == "append":
            entry_id = append(db, kind=args.kind, source=args.source, summary=args.summary,
                              reference=args.reference, session_ref=args.session_ref,
                              confidence=args.confidence, correction_of=args.correction_of)
            print(json.dumps({"result": "MEMORY_APPENDED", "id": entry_id}))
        elif args.command == "list":
            clause = "WHERE kind = ?" if args.kind else ""
            params = (args.kind, args.limit) if args.kind else (args.limit,)
            display(db.execute(f"SELECT * FROM general_memory {clause} ORDER BY id DESC LIMIT ?", params))
        elif args.command == "search":
            term = no_secrets(args.term)
            display(db.execute("SELECT * FROM general_memory WHERE instr(lower(summary),lower(?)) > 0 "
                               "ORDER BY id DESC LIMIT ?", (term, args.limit)))
        elif args.command == "stats":
            print(json.dumps({"entries": db.execute("SELECT COUNT(*) FROM general_memory").fetchone()[0],
                              "schema_version": "1"}))

if __name__ == "__main__":
    main()
