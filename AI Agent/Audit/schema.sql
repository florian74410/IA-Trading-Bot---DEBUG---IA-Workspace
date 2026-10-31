-- The audit DB is separate from SQLite memory and the request queue.
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  request_id TEXT NOT NULL DEFAULT '',
  principal TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('ALLOW','DENY','RESTRICTED','HARD_DENY')),
  approved_by TEXT NOT NULL DEFAULT '',
  approved_at_utc TEXT NOT NULL DEFAULT '',
  execution_duration_ms INTEGER,
  exit_code INTEGER,
  commit_sha TEXT NOT NULL DEFAULT '',
  github_run_id TEXT NOT NULL DEFAULT '',
  health_before TEXT NOT NULL DEFAULT '',
  health_after TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_audit_time ON audit_events(timestamp_utc);
CREATE INDEX IF NOT EXISTS ix_audit_request ON audit_events(request_id);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_AUDIT'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_AUDIT'); END;
