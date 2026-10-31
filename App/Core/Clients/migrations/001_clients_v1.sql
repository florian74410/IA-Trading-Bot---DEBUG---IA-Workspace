BEGIN;
CREATE TABLE IF NOT EXISTS client_schema_migrations(
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clients(
  client_id TEXT PRIMARY KEY,
  external_ref_hash TEXT NOT NULL UNIQUE,
  first_name_enc TEXT NOT NULL DEFAULT '',
  last_name_enc TEXT NOT NULL DEFAULT '',
  email_enc TEXT NOT NULL DEFAULT '',
  email_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  security_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email_hash
  ON clients(email_hash) WHERE email_hash IS NOT NULL AND email_hash <> '';
CREATE TABLE IF NOT EXISTS client_wallets(
  client_id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  PRIMARY KEY(client_id,wallet_id),
  FOREIGN KEY(client_id) REFERENCES clients(client_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_client_wallets_wallet ON client_wallets(wallet_id);
CREATE TABLE IF NOT EXISTS client_audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT,
  action TEXT NOT NULL,
  subject_id TEXT,
  created_at TEXT NOT NULL,
  details_enc TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(client_id) REFERENCES clients(client_id) ON DELETE SET NULL
);
INSERT OR IGNORE INTO client_schema_migrations(version,name,applied_at)
VALUES(1,'clients_v1',datetime('now'));
COMMIT;
