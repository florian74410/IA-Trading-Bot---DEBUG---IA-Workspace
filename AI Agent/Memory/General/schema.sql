-- IA-TB AI Agent v0.1 — append-only general memory (SQLite, UTC)
-- Schema and tooling are versioned; the live .sqlite database MUST stay outside Git.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS memory_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO memory_metadata(key, value) VALUES ('schema_version', '1');

CREATE TABLE IF NOT EXISTS general_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  kind TEXT NOT NULL CHECK (kind IN (
    'observation','analysis_summary','decision','action','result','lesson','correction'
  )),
  summary TEXT NOT NULL CHECK (
    length(trim(summary)) BETWEEN 1 AND 4000
  ),
  source TEXT NOT NULL CHECK (source IN ('user','chat','github','vps','documentation','test')),
  reference TEXT NOT NULL DEFAULT '' CHECK (length(reference) <= 600),
  session_ref TEXT NOT NULL DEFAULT '' CHECK (length(session_ref) <= 200),
  confidence TEXT NOT NULL DEFAULT 'observed'
    CHECK (confidence IN ('observed','inferred','hypothesis')),
  correction_of INTEGER REFERENCES general_memory(id)
);

CREATE INDEX IF NOT EXISTS ix_general_memory_date ON general_memory(created_at_utc DESC);
CREATE INDEX IF NOT EXISTS ix_general_memory_kind ON general_memory(kind, id DESC);
CREATE INDEX IF NOT EXISTS ix_general_memory_ref ON general_memory(reference);

CREATE TRIGGER IF NOT EXISTS general_memory_no_update
BEFORE UPDATE ON general_memory
BEGIN
  SELECT RAISE(ABORT, 'APPEND_ONLY_MEMORY: updates forbidden; append a correction');
END;

CREATE TRIGGER IF NOT EXISTS general_memory_no_delete
BEFORE DELETE ON general_memory
BEGIN
  SELECT RAISE(ABORT, 'APPEND_ONLY_MEMORY: deletion forbidden');
END;
