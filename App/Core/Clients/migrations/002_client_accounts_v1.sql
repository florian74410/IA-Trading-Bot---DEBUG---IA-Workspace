BEGIN;
CREATE TABLE IF NOT EXISTS client_accounts(
  client_id TEXT PRIMARY KEY,
  username_enc TEXT NOT NULL,
  username_hash TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 180000,
  role TEXT NOT NULL DEFAULT 'USER',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(client_id) REFERENCES clients(client_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_accounts_username_hash ON client_accounts(username_hash);
INSERT OR IGNORE INTO client_schema_migrations(version,name,applied_at)
VALUES(2,'client_accounts_v1',datetime('now'));
COMMIT;
