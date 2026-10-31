-- IA-TB Auth 2.1 — schema v3 OFFLINE PROPOSAL ONLY.
-- NOT loaded by ClientRepository.init() and NOT an approved runtime migration.
-- Apply to disposable fixtures or an explicitly approved isolated copy only.
-- Existing clientId, wallets, credentials and encryption keys are preserved.
-- Password hash conversion is deliberately NOT performed by this SQL.
BEGIN IMMEDIATE;

ALTER TABLE client_accounts ADD COLUMN password_algo TEXT NOT NULL DEFAULT 'PBKDF2_SHA256';
ALTER TABLE client_accounts ADD COLUMN password_params_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS client_sessions (
  session_hash TEXT PRIMARY KEY NOT NULL CHECK(length(session_hash)=64),
  client_id TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > issued_at),
  last_seen_at INTEGER,
  revoked_at INTEGER,
  security_version INTEGER NOT NULL,
  auth_protocol_version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(client_id) REFERENCES clients(client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_client_sessions_client ON client_sessions(client_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_client_sessions_expiration ON client_sessions(expires_at);

CREATE TABLE IF NOT EXISTS client_preferences (
  client_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  value_enc TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(client_id,scope,setting_key),
  FOREIGN KEY(client_id) REFERENCES clients(client_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_security_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT,
  actor_client_id TEXT,
  action TEXT NOT NULL,
  subject_id TEXT,
  created_at TEXT NOT NULL,
  detail_enc TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(client_id) REFERENCES clients(client_id) ON DELETE SET NULL,
  FOREIGN KEY(actor_client_id) REFERENCES clients(client_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_client_security_audit_time ON client_security_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_client_security_audit_actor ON client_security_audit(actor_client_id,created_at);

-- This invariant applies after the first ADMIN account is explicitly created.
-- Legacy SUPERADMIN is not converted automatically; controlled reconciliation
-- and authenticated CLI bootstrap are separate prerequisites.
CREATE TRIGGER auth21_last_admin_account_update
BEFORE UPDATE OF role,enabled,client_id ON client_accounts
WHEN OLD.role='ADMIN' AND OLD.enabled=1
 AND EXISTS (SELECT 1 FROM clients c WHERE c.client_id=OLD.client_id AND c.status='ACTIVE')
 AND (NEW.role!='ADMIN' OR NEW.enabled!=1 OR NEW.client_id!=OLD.client_id)
 AND (SELECT COUNT(*) FROM client_accounts a JOIN clients c ON c.client_id=a.client_id
      WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE')<=1
BEGIN SELECT RAISE(ABORT,'LAST_ACTIVE_ADMIN_REQUIRED'); END;

CREATE TRIGGER auth21_last_admin_account_delete
BEFORE DELETE ON client_accounts
WHEN OLD.role='ADMIN' AND OLD.enabled=1
 AND EXISTS (SELECT 1 FROM clients c WHERE c.client_id=OLD.client_id AND c.status='ACTIVE')
 AND (SELECT COUNT(*) FROM client_accounts a JOIN clients c ON c.client_id=a.client_id
      WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE')<=1
BEGIN SELECT RAISE(ABORT,'LAST_ACTIVE_ADMIN_REQUIRED'); END;

CREATE TRIGGER auth21_last_admin_client_update
BEFORE UPDATE OF status ON clients
WHEN OLD.status='ACTIVE' AND NEW.status!='ACTIVE'
 AND EXISTS (SELECT 1 FROM client_accounts a WHERE a.client_id=OLD.client_id
              AND a.role='ADMIN' AND a.enabled=1)
 AND (SELECT COUNT(*) FROM client_accounts a JOIN clients c ON c.client_id=a.client_id
      WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE')<=1
BEGIN SELECT RAISE(ABORT,'LAST_ACTIVE_ADMIN_REQUIRED'); END;

CREATE TRIGGER auth21_last_admin_client_delete
BEFORE DELETE ON clients
WHEN EXISTS (SELECT 1 FROM client_accounts a WHERE a.client_id=OLD.client_id
             AND a.role='ADMIN' AND a.enabled=1)
 AND (SELECT COUNT(*) FROM client_accounts a JOIN clients c ON c.client_id=a.client_id
      WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE')<=1
BEGIN SELECT RAISE(ABORT,'LAST_ACTIVE_ADMIN_REQUIRED'); END;


-- SQLite INSERT OR REPLACE can silently delete a conflicting row without
-- invoking DELETE triggers (recursive_triggers is normally OFF). BEFORE INSERT
-- protects the *last* live ADMIN against PK or UNIQUE replacement bypasses.
-- This deliberately rejects legacy UPSERT of the final ADMIN, which must use
-- an explicitly authorized UPDATE path after Auth 2.1 integration.
CREATE TRIGGER auth21_last_admin_account_replace
BEFORE INSERT ON client_accounts
WHEN (SELECT COUNT(*) FROM client_accounts a JOIN clients c ON c.client_id=a.client_id
      WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE')<=1
 AND EXISTS(
  SELECT 1 FROM client_accounts a JOIN clients c ON c.client_id=a.client_id
  WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE'
    AND (a.client_id=NEW.client_id OR a.username_hash=NEW.username_hash)
 )
BEGIN SELECT RAISE(ABORT,'LAST_ACTIVE_ADMIN_REQUIRED'); END;

CREATE TRIGGER auth21_last_admin_client_replace
BEFORE INSERT ON clients
WHEN (SELECT COUNT(*) FROM client_accounts a JOIN clients c ON c.client_id=a.client_id
      WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE')<=1
 AND EXISTS(
  SELECT 1 FROM client_accounts a JOIN clients c ON c.client_id=a.client_id
  WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE'
    AND (c.client_id=NEW.client_id
      OR c.external_ref_hash=NEW.external_ref_hash
      OR (NEW.email_hash IS NOT NULL AND NEW.email_hash!='' AND c.email_hash=NEW.email_hash))
 )
BEGIN SELECT RAISE(ABORT,'LAST_ACTIVE_ADMIN_REQUIRED'); END;


-- Automatically invalidate every already-issued session if any account-security
-- attribute changes. This also protects modifications by legacy SQL writers.
-- Upgrades of a password hash correctly force a fresh login.
CREATE TRIGGER auth21_account_security_invalidation
AFTER UPDATE OF password_hash,password_salt,password_iterations,password_algo,role,enabled ON client_accounts
WHEN OLD.password_hash IS NOT NEW.password_hash
  OR OLD.password_salt IS NOT NEW.password_salt
  OR OLD.password_iterations IS NOT NEW.password_iterations
  OR OLD.password_algo IS NOT NEW.password_algo
  OR OLD.role IS NOT NEW.role
  OR OLD.enabled IS NOT NEW.enabled
BEGIN
  UPDATE clients SET security_version=security_version+1,updated_at=datetime('now')
   WHERE client_id=NEW.client_id;
  UPDATE client_sessions SET revoked_at=CAST(strftime('%s','now') AS INTEGER)
   WHERE client_id=NEW.client_id AND revoked_at IS NULL;
END;

-- Deactivate/suspend client identity -> invalidate tokens, regardless of caller.
CREATE TRIGGER auth21_client_status_invalidation
AFTER UPDATE OF status ON clients
WHEN OLD.status IS NOT NEW.status
BEGIN
  UPDATE clients SET security_version=security_version+1 WHERE client_id=NEW.client_id;
  UPDATE client_sessions SET revoked_at=CAST(strftime('%s','now') AS INTEGER)
   WHERE client_id=NEW.client_id AND revoked_at IS NULL;
END;

INSERT OR IGNORE INTO client_schema_migrations(version,name,applied_at)
VALUES(3,'auth21_schema_v3_offline_proposal',datetime('now'));
COMMIT;
