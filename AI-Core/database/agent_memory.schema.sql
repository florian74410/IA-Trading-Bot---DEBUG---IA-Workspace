-- SQLite schema baseline (per-agent Agent-Memory.db). No destructive migrations.
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  agent_serial TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('events','actions','interactions','responses','reflexions','memories','snapshots')),
  context TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  correlation_id TEXT NOT NULL DEFAULT '',
  evidence_ref TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_records_time ON records(created_at_utc);
CREATE INDEX IF NOT EXISTS idx_records_correlation ON records(correlation_id);
CREATE TABLE IF NOT EXISTS events (
  record_id TEXT PRIMARY KEY REFERENCES records(id), event_type TEXT NOT NULL,
  status TEXT NOT NULL, message TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS actions (
  record_id TEXT PRIMARY KEY REFERENCES records(id), action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '', result_status TEXT NOT NULL, result_summary TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS interactions (
  record_id TEXT PRIMARY KEY REFERENCES records(id), counterpart TEXT NOT NULL,
  channel TEXT NOT NULL, summary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS responses (
  record_id TEXT PRIMARY KEY REFERENCES records(id), responding_to TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL, summary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reflexions (
  record_id TEXT PRIMARY KEY REFERENCES records(id), hypothesis TEXT NOT NULL DEFAULT '',
  evidence_assessment TEXT NOT NULL DEFAULT '', deduction TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT '', confidence REAL CHECK(confidence BETWEEN 0 AND 1)
);
CREATE TABLE IF NOT EXISTS memories (
  record_id TEXT PRIMARY KEY REFERENCES records(id), lesson TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  verification TEXT NOT NULL DEFAULT 'UNVERIFIED'
);
CREATE TABLE IF NOT EXISTS snapshots (
  record_id TEXT PRIMARY KEY REFERENCES records(id), snapshot_ref TEXT NOT NULL,
  digest_sha256 TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS Statistiques (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_serial TEXT NOT NULL,
  iteration INTEGER NOT NULL CHECK(iteration >= 0),
  timestamp_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  prudence INTEGER NOT NULL CHECK(prudence BETWEEN 0 AND 100),
  confiance INTEGER NOT NULL CHECK(confiance BETWEEN 0 AND 100),
  vigilance INTEGER NOT NULL CHECK(vigilance BETWEEN 0 AND 100),
  curiosite INTEGER NOT NULL CHECK(curiosite BETWEEN 0 AND 100),
  audace INTEGER NOT NULL CHECK(audace BETWEEN 0 AND 100),
  esprit_critique INTEGER NOT NULL CHECK(esprit_critique BETWEEN 0 AND 100),
  reason TEXT NOT NULL DEFAULT '',
  evidence_record_id TEXT REFERENCES records(id),
  approved_by TEXT NOT NULL DEFAULT '',
  UNIQUE(agent_serial,iteration)
);
CREATE INDEX IF NOT EXISTS idx_stats_agent_time ON Statistiques(agent_serial,timestamp_utc);
CREATE TRIGGER IF NOT EXISTS statistiques_no_update BEFORE UPDATE ON Statistiques BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS statistiques_no_delete BEFORE DELETE ON Statistiques BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
