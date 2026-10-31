PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  principal TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  reason TEXT NOT NULL,
  risks TEXT NOT NULL,
  conditions TEXT NOT NULL,
  rollback TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 5),
  status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED','REVOKED')),
  decided_by TEXT,
  decided_at_utc TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status,created_at_utc);
