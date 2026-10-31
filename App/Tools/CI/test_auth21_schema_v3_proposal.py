#!/usr/bin/env python3
"""Offline Auth 2.1 v3 SQL proposal fixtures. Never connects to any actual IA-TB DB."""
import sqlite3
import tempfile
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
OLD = APP / "Core" / "Clients" / "migrations"
PROPOSED = APP / "Core" / "Clients" / "auth21_proposed_migrations" / "003_auth21_schema_v3.sql"
NOW = "2026-10-14T00:00:00Z"


class Auth21SchemaFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="iatb-auth21-v3-only-")
        self.db = sqlite3.connect(str(Path(self.tmp.name) / "clients-fixture.sqlite"))
        self.db.execute("PRAGMA foreign_keys=ON")
        for name in ["001_clients_v1.sql", "002_client_accounts_v1.sql"]:
            self.db.executescript((OLD / name).read_text(encoding="utf-8"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def client(self, client_id, role="USER", enabled=1, status="ACTIVE"):
        self.db.execute(
            "INSERT INTO clients(client_id,external_ref_hash,status,created_at,updated_at) VALUES(?,?,?,?,?)",
            (client_id, "hash-" + client_id, status, NOW, NOW),
        )
        self.db.execute(
            """INSERT INTO client_accounts
            (client_id,username_enc,username_hash,password_salt,password_hash,
            password_iterations,role,enabled,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (client_id, "fictional-user-" + client_id, "username-" + client_id,
             "salt-fixture", "fake-hash-only", 180000, role, enabled, NOW, NOW),
        )
        self.db.commit()

    def migrate(self):
        self.db.executescript(PROPOSED.read_text(encoding="utf-8"))
        self.db.commit()

    def count_admin(self):
        return self.db.execute(
            """SELECT COUNT(*) FROM client_accounts a JOIN clients c USING(client_id)
               WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE'"""
        ).fetchone()[0]

    def test_migration_adds_version_and_survives_integrity_check(self):
        self.migrate()
        self.assertEqual(self.db.execute(
            "SELECT max(version) FROM client_schema_migrations").fetchone()[0], 3)
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchone()[0], "ok")

    def test_legacy_credential_and_superadmin_are_preserved_without_rehash(self):
        self.client("CL000001", role="SUPERADMIN")
        self.migrate()
        row = self.db.execute(
            "SELECT role,password_hash,password_salt,password_iterations,password_algo "
            "FROM client_accounts WHERE client_id='CL000001'"
        ).fetchone()
        self.assertEqual(row, ("SUPERADMIN", "fake-hash-only", "salt-fixture", 180000, "PBKDF2_SHA256"))

    def test_client_preferences_are_scoped_to_client_id(self):
        self.client("CL000001")
        self.client("CL000002")
        self.migrate()
        for who, val in [("CL000001", "encrypted-one"), ("CL000002", "encrypted-two")]:
            self.db.execute(
                "INSERT INTO client_preferences(client_id,scope,setting_key,value_enc,updated_at) "
                "VALUES(?,?,?,?,?)",
                (who, "ui", "theme", val, NOW),
            )
        self.assertEqual(self.db.execute(
            "SELECT value_enc FROM client_preferences WHERE client_id='CL000001' "
            "AND scope='ui' AND setting_key='theme'").fetchone()[0], "encrypted-one")
        self.assertEqual(self.db.execute(
            "SELECT value_enc FROM client_preferences WHERE client_id='CL000002' "
            "AND scope='ui' AND setting_key='theme'").fetchone()[0], "encrypted-two")

    def test_session_schema_uses_hash_and_supports_revocation(self):
        self.client("CL000001")
        self.migrate()
        self.db.execute(
            "INSERT INTO client_sessions(session_hash,client_id,issued_at,expires_at,security_version) "
            "VALUES(?,?,?,?,?)", ("a"*64, "CL000001", 100, 200, 1),
        )
        self.db.execute("UPDATE client_sessions SET revoked_at=150 WHERE session_hash=?", ("a"*64,))
        self.assertEqual(self.db.execute(
            "SELECT revoked_at FROM client_sessions WHERE session_hash=?", ("a"*64,)
        ).fetchone()[0], 150)

    def test_session_short_hash_and_bad_expiry_are_rejected(self):
        self.client("CL000001")
        self.migrate()
        for token, issued, expires in [("too-short", 100, 200), ("a"*64, 100, 100)]:
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(
                    "INSERT INTO client_sessions(session_hash,client_id,issued_at,expires_at,security_version) "
                    "VALUES(?,?,?,?,?)", (token, "CL000001", issued, expires, 1))

    def test_last_admin_cannot_be_disabled_or_demoted(self):
        self.client("CL000001", role="ADMIN")
        self.migrate()
        for sql in [
            "UPDATE client_accounts SET enabled=0 WHERE client_id='CL000001'",
            "UPDATE client_accounts SET role='USER' WHERE client_id='CL000001'",
        ]:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "LAST_ACTIVE_ADMIN_REQUIRED"):
                self.db.execute(sql)
        self.assertEqual(self.count_admin(), 1)

    def test_last_admin_cannot_be_deleted_from_account_table(self):
        self.client("CL000001", role="ADMIN")
        self.migrate()
        with self.assertRaisesRegex(sqlite3.IntegrityError, "LAST_ACTIVE_ADMIN_REQUIRED"):
            self.db.execute("DELETE FROM client_accounts WHERE client_id='CL000001'")
        self.assertEqual(self.count_admin(), 1)

    def test_last_admin_parent_client_cannot_be_disabled_or_deleted(self):
        self.client("CL000001", role="ADMIN")
        self.migrate()
        for sql in [
            "UPDATE clients SET status='DISABLED' WHERE client_id='CL000001'",
            "DELETE FROM clients WHERE client_id='CL000001'",
        ]:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "LAST_ACTIVE_ADMIN_REQUIRED"):
                self.db.execute(sql)
        self.assertEqual(self.count_admin(), 1)

    def test_multiple_admins_allow_reduction_to_one_but_not_zero(self):
        self.client("CL000001", role="ADMIN")
        self.client("CL000002", role="ADMIN")
        self.migrate()
        self.db.execute("UPDATE client_accounts SET role='USER' WHERE client_id='CL000001'")
        self.assertEqual(self.count_admin(), 1)
        with self.assertRaisesRegex(sqlite3.IntegrityError, "LAST_ACTIVE_ADMIN_REQUIRED"):
            self.db.execute("DELETE FROM client_accounts WHERE client_id='CL000002'")
        self.assertEqual(self.count_admin(), 1)

    def test_audit_log_links_existing_clients_without_exposing_secrets(self):
        self.client("CL000001")
        self.migrate()
        self.db.execute(
            "INSERT INTO client_security_audit(client_id,actor_client_id,action,created_at,detail_enc) "
            "VALUES(?,?,?,?,?)",
            ("CL000001", "CL000001", "AUTH_EVENT_FIXTURE", NOW, "fictional-envelope"),
        )
        self.assertEqual(self.db.execute(
            "SELECT action FROM client_security_audit WHERE client_id='CL000001'"
        ).fetchone()[0], "AUTH_EVENT_FIXTURE")



    def test_sql_transaction_rollback_keeps_existing_client_state(self):
        self.client("CL000001", role="USER")
        initial = self.db.execute(
            "SELECT password_hash FROM client_accounts WHERE client_id='CL000001'"
        ).fetchone()[0]
        with self.assertRaises(sqlite3.OperationalError):
            self.db.executescript(
                "BEGIN IMMEDIATE; "
                "ALTER TABLE client_accounts ADD COLUMN password_algo TEXT; "
                "THIS IS NOT SQL; COMMIT;"
            )
        self.db.rollback()
        columns = [r[1] for r in self.db.execute("PRAGMA table_info(client_accounts)")]
        self.assertNotIn("password_algo", columns)
        self.assertEqual(
            self.db.execute("SELECT password_hash FROM client_accounts WHERE client_id='CL000001'").fetchone()[0],
            initial,
        )
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchone()[0], "ok")

    def test_sqlite_backup_before_v3_can_restore_exact_old_schema(self):
        self.client("CL000001", role="USER")
        self.db.execute(
            "INSERT INTO client_wallets(client_id,wallet_id,created_at) VALUES(?,?,?)",
            ("CL000001", "FICTIONAL_PUBLIC_ID", NOW),
        )
        self.db.commit()
        target = Path(self.tmp.name) / "original-before-v3.sqlite"
        restored = sqlite3.connect(str(target))
        try:
            self.db.backup(restored)
            self.migrate()
            self.assertIn("password_algo", [
                r[1] for r in self.db.execute("PRAGMA table_info(client_accounts)")
            ])
            self.assertNotIn("password_algo", [
                r[1] for r in restored.execute("PRAGMA table_info(client_accounts)")
            ])
            self.assertEqual(
                restored.execute("SELECT wallet_id FROM client_wallets").fetchone()[0],
                "FICTIONAL_PUBLIC_ID",
            )
            self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        finally:
            restored.close()

    def test_credentials_update_cas_requires_original_legacy_fields(self):
        self.client("CL000001", role="USER")
        self.migrate()
        before = self.db.execute(
            "SELECT password_hash,password_salt,password_iterations,role,updated_at "
            "FROM client_accounts WHERE client_id='CL000001'"
        ).fetchone()
        result = self.db.execute(
            """UPDATE client_accounts
               SET password_algo='ARGON2ID',password_hash=?,password_salt='',
                   password_iterations=0,password_params_json='{}',updated_at=?
               WHERE client_id=? AND password_algo='PBKDF2_SHA256'
                 AND password_hash=? AND password_salt=? AND password_iterations=?
                 AND role=? AND enabled=1 AND updated_at=?
                 AND EXISTS(SELECT 1 FROM clients
                   WHERE client_id=? AND status='ACTIVE' AND security_version=?)""",
            ("$argon2id$v=19$FICTIONAL_HASH_ONLY", NOW, "CL000001",
             before[0], before[1], before[2], before[3], before[4], "CL000001", 1),
        )
        self.assertEqual(result.rowcount, 1)
        self.assertEqual(
            self.db.execute("SELECT password_algo FROM client_accounts").fetchone()[0],
            "ARGON2ID",
        )

    def test_cas_rejects_reset_during_password_hashing(self):
        self.client("CL000001", role="USER")
        self.migrate()
        old = self.db.execute(
            "SELECT password_hash,password_salt,password_iterations,role,updated_at "
            "FROM client_accounts WHERE client_id='CL000001'"
        ).fetchone()
        self.db.execute(
            "UPDATE client_accounts SET password_hash='RESET_OLD_HASH',updated_at='CHANGED' "
            "WHERE client_id='CL000001'"
        )
        changed = self.db.execute(
            """UPDATE client_accounts SET password_hash=?,password_algo='ARGON2ID'
               WHERE client_id=? AND password_algo='PBKDF2_SHA256'
                 AND password_hash=? AND password_salt=? AND password_iterations=?
                 AND role=? AND enabled=1 AND updated_at=?
                 AND EXISTS(SELECT 1 FROM clients
                   WHERE client_id=? AND status='ACTIVE' AND security_version=?)""",
            ("FAKE_PHC", "CL000001", old[0], old[1], old[2], old[3],
             old[4], "CL000001", 1),
        )
        self.assertEqual(changed.rowcount, 0)
        self.assertEqual(self.db.execute(
            "SELECT password_hash FROM client_accounts").fetchone()[0], "RESET_OLD_HASH")

    def test_cas_rejects_client_disable_and_version_change(self):
        for mode in ["disable", "version"]:
            with self.subTest(mode=mode):
                self.db.execute("DELETE FROM client_accounts")
                self.db.execute("DELETE FROM clients")
                self.db.commit()
                self.client("CL000001", role="USER")
                self.migrate() if mode == "disable" else None
                old = self.db.execute(
                    "SELECT password_hash,password_salt,password_iterations,role,updated_at "
                    "FROM client_accounts WHERE client_id='CL000001'"
                ).fetchone()
                if mode == "disable":
                    self.db.execute("UPDATE client_accounts SET enabled=0")
                else:
                    self.db.execute("UPDATE clients SET security_version=2")
                changed = self.db.execute(
                    """UPDATE client_accounts SET password_hash=?,password_algo='ARGON2ID'
                       WHERE client_id=? AND password_algo='PBKDF2_SHA256'
                       AND password_hash=? AND password_salt=? AND password_iterations=?
                       AND role=? AND enabled=1 AND updated_at=?
                       AND EXISTS(SELECT 1 FROM clients
                         WHERE client_id=? AND status='ACTIVE' AND security_version=?)""",
                    ("FAKE_PHC", "CL000001", old[0], old[1], old[2], old[3],
                     old[4], "CL000001", 1),
                )
                self.assertEqual(changed.rowcount, 0)
                self.assertEqual(self.db.execute(
                    "SELECT password_algo FROM client_accounts").fetchone()[0], "PBKDF2_SHA256")


if __name__ == "__main__":
    unittest.main(verbosity=2)
