#!/usr/bin/env python3
"""P2.1 isolated storage tests: fictitious SQLite, never GEN-1 or wallets."""
from __future__ import annotations

import hashlib
import json
import shutil
from contextlib import closing
import hmac
import os
import subprocess
import sys
import threading
from pathlib import Path
import sqlite3
import stat
import tempfile
import time
import unittest

import auth_storage_preflight as p

REPO = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO / "App/Core/Clients/migrations"
FIXTURE_ID = "CL000101"
FIXTURE_EPOCH = "coherent-generation-1"


def mkdir_private(pth: Path) -> None:
    pth.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(pth, 0o700)


class StoragePreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="iatb-p21-fixture-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        os.chmod(self.root, 0o700)
        (self.root / p.TEST_MARKER).write_text("IA-TB-AUTH-P21-FIXTURE\n")
        self.key = os.urandom(32)  # Ephemeral, fictitious and never sent anywhere.
        self.live_connections: list[sqlite3.Connection] = []
        for rel in ["runtime", "data", "state", "annexes", "updates",
                    "data/Database", "data/Security", "data/User Data/default",
                    "runtime/state/security"]:
            mkdir_private(self.root / rel)
        key_path = self.root / p.CLIENT_KEY
        key_path.write_text(self.key.hex() + "\n")
        os.chmod(key_path, 0o600)
        self._create_sqlite_fixture()
        self.addCleanup(self._close_live_connections)

    def _close_live_connections(self) -> None:
        for db in self.live_connections:
            db.close()
        self.live_connections.clear()

    def _create_sqlite_fixture(self) -> None:
        for rel in p.FIXTURE_DATABASES:
            db = sqlite3.connect(self.root / rel)
            db.execute("PRAGMA foreign_keys=ON")
            if rel.endswith("clients.sqlite"):
                result = db.execute("PRAGMA journal_mode=DELETE").fetchone()[0].lower()
                self.assertEqual(result, "delete")
                for script in ("001_clients_v1.sql", "002_client_accounts_v1.sql"):
                    db.executescript((MIGRATIONS / script).read_text())
                marker = hmac.new(self.key, p.TEST_CANARY + FIXTURE_ID.encode(), hashlib.sha256).hexdigest()
                db.execute("INSERT INTO clients(client_id,external_ref_hash,first_name_enc,created_at,updated_at) VALUES(?,?,?,?,?)",
                           (FIXTURE_ID, "fictitious-external-hash", marker, "2000-01-01", "2000-01-01"))
                db.execute("INSERT INTO client_accounts(client_id,username_enc,username_hash,password_salt,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                           (FIXTURE_ID, "fictitious-user", "fake-index", "fake-salt", "fake-hash", "USER", "2000-01-01", "2000-01-01"))
            else:
                mode = db.execute("PRAGMA journal_mode=WAL").fetchone()[0].lower()
                self.assertEqual(mode, "wal")
                db.execute("CREATE TABLE public_fixture(payload TEXT NOT NULL)")
                db.execute("INSERT INTO public_fixture(payload) VALUES('fictitious-sample')")
            db.execute("CREATE TABLE fixture_generation(epoch TEXT NOT NULL)")
            db.execute("INSERT INTO fixture_generation(epoch) VALUES(?)", (FIXTURE_EPOCH,))
            db.commit()
            if not rel.endswith("clients.sqlite"):
                # Keep a WAL connection alive: committed data can remain in -wal.
                self.live_connections.append(db)
                self.assertTrue(Path(str(self.root / rel) + "-wal").exists())
            else:
                db.close()
            os.chmod(self.root / rel, 0o600)

    def test_readonly_preflight_never_changes_files(self):
        before = {str(x.relative_to(self.root)): (x.stat().st_mtime_ns, x.stat().st_size)
                  for x in self.root.rglob("*") if x.is_file()}
        result = p.metadata_preflight(self.root)
        after = {str(x.relative_to(self.root)): (x.stat().st_mtime_ns, x.stat().st_size)
                 for x in self.root.rglob("*") if x.is_file()}
        self.assertEqual(result["mode"], "READ_ONLY_METADATA")
        self.assertEqual(result["targets"][p.CLIENT_KEY]["mode"], "0600")
        self.assertTrue(result["ready_for_change"])
        self.assertEqual(before, after)

    def test_wal_delete_online_backup_and_restore_preserve_fixture(self):
        start = time.monotonic()
        snapshot = p.coherent_fixture_snapshot(self.root)
        self.assertTrue(snapshot.exists())
        self.assertEqual(stat.S_IMODE(snapshot.stat().st_mode), 0o700)
        for rel in p.FIXTURE_DATABASES:
            copied = snapshot / rel
            self.assertTrue(copied.exists())
            self.assertEqual(stat.S_IMODE(copied.stat().st_mode), 0o600)
            self.assertFalse(Path(str(copied) + "-wal").exists())
            self.assertFalse(Path(str(copied) + "-shm").exists())
        self.assertEqual(stat.S_IMODE((snapshot / p.CLIENT_KEY).stat().st_mode), 0o600)
        self.assertEqual(p._validate_fixture_bundle(snapshot), (FIXTURE_ID, FIXTURE_EPOCH))
        restored = p.fixture_restore(self.root, snapshot)
        self.assertEqual(p._validate_fixture_bundle(restored), (FIXTURE_ID, FIXTURE_EPOCH))
        self.assertTrue((self.root / "data/User Data/default/user_data.db-wal").exists())
        self.assertLess(time.monotonic() - start, 10.0, "Only smoke performance in CI, not real p95 benchmark")

    def test_missing_client_key_never_autogenerates(self):
        key_file = self.root / p.CLIENT_KEY
        key_file.unlink()
        self.assertFalse(p.metadata_preflight(self.root)["ready_for_change"])
        with self.assertRaisesRegex(p.UnsafeStorage, "CLIENT_MASTER_KEY_REQUIRED"):
            p.coherent_fixture_snapshot(self.root)
        self.assertFalse(key_file.exists())
        self.assertFalse((self.root / "_snapshots").exists())

    def test_mismatched_client_key_rejected_without_replacement(self):
        key_file = self.root / p.CLIENT_KEY
        new_key = os.urandom(32).hex() + "\n"
        key_file.write_text(new_key)
        with self.assertRaisesRegex(p.UnsafeStorage, "DOES_NOT_MATCH"):
            p.coherent_fixture_snapshot(self.root)
        self.assertEqual(key_file.read_text(), new_key)
        self.assertFalse((self.root / "_snapshots").exists())

    def test_broken_sqlite_rejected(self):
        self._close_live_connections()
        path = self.root / p.FIXTURE_DATABASES[2]
        path.write_bytes(b"NOT A SQLITE FILE")
        with self.assertRaises(sqlite3.DatabaseError):
            p.coherent_fixture_snapshot(self.root)
        self.assertFalse((self.root / "_snapshots").exists())

    def test_foreign_key_violation_rejected(self):
        path = self.root / p.FIXTURE_DATABASES[0]
        with closing(sqlite3.connect(path)) as db:
            db.execute("PRAGMA foreign_keys=OFF")
            db.execute("INSERT INTO client_accounts(client_id,username_enc,username_hash,password_salt,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                       ("CL999999", "bad", "bad", "bad", "bad", "USER", "x", "x"))
            db.commit()
        with self.assertRaisesRegex(p.UnsafeStorage, "FOREIGN_KEY"):
            p.coherent_fixture_snapshot(self.root)

    def test_inter_database_epoch_drift_rejected(self):
        db = self.live_connections[0]
        db.execute("UPDATE fixture_generation SET epoch='different-generation'")
        db.commit()
        with self.assertRaisesRegex(p.UnsafeStorage, "INTER_DATABASE_DRIFT"):
            p.coherent_fixture_snapshot(self.root)

    def test_failed_mid_backup_removes_partial_stage(self):
        with self.assertRaisesRegex(p.UnsafeStorage, "INJECTED_BACKUP_FAILURE"):
            p.coherent_fixture_snapshot(self.root, injected_failure_after=1)
        stage = self.root / "_snapshots"
        self.assertEqual(list(stage.iterdir()), [])
        self.assertEqual(p._validate_fixture_bundle(self.root), (FIXTURE_ID, FIXTURE_EPOCH))

    def test_symlink_in_path_rejected_without_follow(self):
        linked = self.root / "data/Security/client_master.key"
        linked.unlink()
        linked.symlink_to(self.root / "not-to-be-created.key")
        outcome = p.metadata_preflight(self.root)
        self.assertEqual(outcome["targets"][p.CLIENT_KEY]["kind"], "symlink_refused")
        self.assertFalse(outcome["ready_for_change"])
        with self.assertRaises(p.UnsafeStorage):
            p.coherent_fixture_snapshot(self.root)
        self.assertFalse((self.root / "not-to-be-created.key").exists())

    def test_fixture_guard_rejects_nonfixture_directories(self):
        with self.assertRaisesRegex(p.UnsafeStorage, "FIXTURE_SANDBOX_REQUIRED"):
            p.coherent_fixture_snapshot(Path("/var/lib/iatb/debug"))
        with self.assertRaisesRegex(p.UnsafeStorage, "FIXTURE_SANDBOX_REQUIRED"):
            p.coherent_fixture_snapshot(self.root / "data")

    def test_snapshot_key_deleted_before_restore_fails_closed(self):
        snap = p.coherent_fixture_snapshot(self.root)
        (snap / p.CLIENT_KEY).unlink()
        with self.assertRaisesRegex(p.UnsafeStorage, "CLIENT_MASTER_KEY_REQUIRED"):
            p.fixture_restore(self.root, snap)
        self.assertFalse((self.root / "_restored").exists())

    def test_real_client_crypto_aes_fixture_restoration(self):
        # Invoke the existing ClientCrypto module ONLY with an explicitly created
        # test key and temp DB. The normal metadata preflight imports no runtime.
        client_crypto = REPO / "App/Core/Clients/client_crypto.js"
        crypto_js = """const C=require(process.argv[1]);
const c=new C(process.argv[2]);
const command=process.argv[3], value=process.argv[4];
process.stdout.write(command==='seal'?c.seal(value):c.open(value));
"""

        def invoke(keyfile, operation, payload):
            return subprocess.run(
                ["node", "-e", crypto_js, str(client_crypto), str(keyfile), operation, payload],
                capture_output=True, text=True, timeout=10,
            )

        keyfile = self.root / p.CLIENT_KEY
        fictitious_identity = "SIMULATION-ONLY-NO-REAL-USER"
        sealed = invoke(keyfile, "seal", fictitious_identity)
        self.assertEqual(sealed.returncode, 0, sealed.stderr[:160])
        client_db = self.root / p.FIXTURE_DATABASES[0]
        with closing(sqlite3.connect(client_db)) as db:
            db.execute("UPDATE clients SET last_name_enc=? WHERE client_id=?", (sealed.stdout, FIXTURE_ID))
            db.commit()
        snapshot = p.coherent_fixture_snapshot(self.root)
        restored = p.fixture_restore(self.root, snapshot)
        with closing(sqlite3.connect(restored / p.FIXTURE_DATABASES[0])) as db:
            encrypted = db.execute("SELECT last_name_enc FROM clients WHERE client_id=?", (FIXTURE_ID,)).fetchone()[0]
        opened = invoke(restored / p.CLIENT_KEY, "open", encrypted)
        self.assertEqual(opened.returncode, 0, opened.stderr[:160])
        self.assertEqual(opened.stdout, fictitious_identity)
        # A different key cannot decrypt the copied AES-GCM identity.
        restored_key = restored / p.CLIENT_KEY
        restored_key.write_text(os.urandom(32).hex() + "\n")
        wrong = invoke(restored_key, "open", encrypted)
        self.assertNotEqual(wrong.returncode, 0)

    def test_no_wallet_created_or_modified(self):
        self.assertFalse((self.root / "data/Security/wallet_master.key").exists())
        snap = p.coherent_fixture_snapshot(self.root)
        p.fixture_restore(self.root, snap)
        self.assertFalse((self.root / "data/Security/wallet_master.key").exists())
        self.assertFalse((snap / "data/Security/wallet_master.key").exists())


    def test_writer_batched_updates_block_snapshot_until_consistent(self):
        first_update = threading.Event()
        continue_writer = threading.Event()
        snapshot_started = threading.Event()
        outcomes = []
        errors = []

        def writer():
            try:
                with p.fixture_writer_guard(self.root, timeout_s=4):
                    with closing(sqlite3.connect(self.root / p.FIXTURE_DATABASES[0])) as db:
                        db.execute("UPDATE fixture_generation SET epoch='generation-2'")
                        db.commit()
                    first_update.set()
                    if not continue_writer.wait(timeout=4):
                        raise RuntimeError("fixture writer interrupted")
                    for rel in p.FIXTURE_DATABASES[1:]:
                        with closing(sqlite3.connect(self.root / rel)) as db:
                            db.execute("UPDATE fixture_generation SET epoch='generation-2'")
                            db.commit()
            except Exception as exc:
                errors.append(str(exc))
                first_update.set()

        def snapshot():
            try:
                snapshot_started.set()
                outcomes.append(p.coherent_fixture_snapshot(self.root, timeout_s=4))
            except Exception as exc:
                errors.append(str(exc))

        wt = threading.Thread(target=writer, daemon=True)
        st = threading.Thread(target=snapshot, daemon=True)
        wt.start()
        try:
            self.assertTrue(first_update.wait(3), "Writer never reached partial generation")
            st.start()
            self.assertTrue(snapshot_started.wait(3))
            # The exclusive lock must remain blocked while a participating
            # writer holds the shared lock, even with a partially changed DB.
            self.assertTrue(st.is_alive())
            self.assertEqual(outcomes, [])
        finally:
            continue_writer.set()
            wt.join(timeout=5)
            if st.ident is not None:
                st.join(timeout=5)
        self.assertFalse(wt.is_alive())
        self.assertFalse(st.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(len(outcomes), 1)
        self.assertEqual(p._validate_fixture_bundle(outcomes[0]), (FIXTURE_ID, "generation-2"))

    def test_snapshot_exclusive_lock_prevents_new_writer(self):
        attempted = threading.Event()
        done = threading.Event()
        failures = []

        def writer():
            attempted.set()
            try:
                with p.fixture_writer_guard(self.root, timeout_s=4):
                    with closing(sqlite3.connect(self.root / p.FIXTURE_DATABASES[1])) as db:
                        db.execute("INSERT INTO public_fixture(payload) VALUES('second-event')")
                        db.commit()
            except Exception as exc:
                failures.append(str(exc))
            finally:
                done.set()

        with p.fixture_snapshot_barrier(self.root):
            worker = threading.Thread(target=writer, daemon=True)
            worker.start()
            self.assertTrue(attempted.wait(3))
            self.assertFalse(done.is_set(), "Writer bypassed exclusive snapshot barrier")
            with closing(p._sqlite_ro(self.root / p.FIXTURE_DATABASES[1])) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM public_fixture").fetchone()[0], 1)
        worker.join(timeout=5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(failures, [])
        with closing(p._sqlite_ro(self.root / p.FIXTURE_DATABASES[1])) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM public_fixture").fetchone()[0], 2)

    def test_busy_barrier_fails_closed_before_any_snapshot(self):
        with p.fixture_writer_guard(self.root):
            with self.assertRaisesRegex(p.UnsafeStorage, "BARRIER_BUSY_TIMEOUT"):
                p.coherent_fixture_snapshot(self.root, timeout_s=0.07)
        self.assertFalse((self.root / "_snapshots").exists())
        self.assertEqual(p._validate_fixture_bundle(self.root), (FIXTURE_ID, FIXTURE_EPOCH))

    def test_lockfile_symlink_and_invalid_mode_rejected(self):
        lockfile = self.root / p.FIXTURE_BARRIER
        lockfile.symlink_to(self.root / "never-touch-me")
        with self.assertRaisesRegex(p.UnsafeStorage, "BARRIER_OPEN_REFUSED"):
            p.coherent_fixture_snapshot(self.root)
        self.assertFalse((self.root / "never-touch-me").exists())
        lockfile.unlink()
        lockfile.write_text("untrusted")
        os.chmod(lockfile, 0o666)
        with self.assertRaisesRegex(p.UnsafeStorage, "UNTRUSTED_PERMISSIONS"):
            p.coherent_fixture_snapshot(self.root)
        self.assertFalse((self.root / "_snapshots").exists())

    def test_fixture_writer_lock_rejects_unmarked_storage(self):
        with self.assertRaisesRegex(p.UnsafeStorage, "FIXTURE_SANDBOX_REQUIRED"):
            with p.fixture_writer_guard(Path("/var/lib/iatb/debug")):
                self.fail("Writer lock unexpectedly opened on GEN-1 root")
        self.assertFalse((self.root / "_snapshots").exists())

    def test_write_barrier_is_interprocess_and_unlocks_on_process_exit(self):
        source = """
import sys, time
from pathlib import Path
sys.path.insert(0, sys.argv[2])
import auth_storage_preflight as p
with p.fixture_writer_guard(Path(sys.argv[1]), timeout_s=3):
    print('WRITE_LOCK_HELD', flush=True)
    time.sleep(0.5)
"""
        with subprocess.Popen(
            [sys.executable, "-c", source, str(self.root), str(Path(__file__).resolve().parent)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        ) as worker:
            self.assertEqual(worker.stdout.readline().strip(), "WRITE_LOCK_HELD")
            with self.assertRaisesRegex(p.UnsafeStorage, "BARRIER_BUSY_TIMEOUT"):
                p.coherent_fixture_snapshot(self.root, timeout_s=0.09)
            stdout, stderr = worker.communicate(timeout=5)
            self.assertEqual(worker.returncode, 0, stderr[:200])
        snap = p.coherent_fixture_snapshot(self.root, timeout_s=2)
        self.assertEqual(p._validate_fixture_bundle(snap), (FIXTURE_ID, FIXTURE_EPOCH))

    def test_abrupt_writer_process_termination_releases_lock(self):
        # A crashed worker drops its advisory file lock. This does not
        # guarantee all application-level transactions/side effects survived.
        child = """
import sys, time
from pathlib import Path
sys.path.insert(0, sys.argv[2])
import auth_storage_preflight as p
with p.fixture_writer_guard(Path(sys.argv[1]), timeout_s=3):
    print('LOCK_ACQUIRED', flush=True)
    time.sleep(30)
"""
        proc = subprocess.Popen(
            [sys.executable, "-c", child, str(self.root),
             str(Path(__file__).resolve().parent)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        try:
            self.assertEqual(proc.stdout.readline().strip(), "LOCK_ACQUIRED")
            with self.assertRaisesRegex(p.UnsafeStorage, "BARRIER_BUSY_TIMEOUT"):
                p.coherent_fixture_snapshot(self.root, timeout_s=0.08)
        finally:
            proc.terminate()
            try:
                proc.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate(timeout=3)
            self.assertIsNotNone(proc.returncode)
        self.assertEqual(p._validate_fixture_bundle(self.root),
                         (FIXTURE_ID, FIXTURE_EPOCH))
        snapshot = p.coherent_fixture_snapshot(self.root, timeout_s=2)
        self.assertEqual(p._validate_fixture_bundle(snapshot),
                         (FIXTURE_ID, FIXTURE_EPOCH))

    def test_noncooperative_writer_can_bypass_advisory_lock_and_is_detected(self):
        # The next process deliberately does NOT call fixture_writer_guard.
        # This is evidence that flock alone is NOT a GEN-1 safety mechanism.
        rogue = """
import sqlite3, sys
db = sqlite3.connect(sys.argv[1], timeout=2)
db.execute("UPDATE fixture_generation SET epoch='UNREGISTERED-WRITER'")
db.commit()
db.close()
"""
        with p.fixture_snapshot_barrier(self.root, timeout_s=2):
            proc = subprocess.run(
                [sys.executable, "-c", rogue,
                 str(self.root / p.FIXTURE_DATABASES[1])],
                capture_output=True, text=True, timeout=5
            )
            self.assertEqual(proc.returncode, 0, proc.stderr[:200])
        # The preliminary generation check refuses the inconsistent set.
        with self.assertRaisesRegex(p.UnsafeStorage, "INTER_DATABASE_DRIFT"):
            p.coherent_fixture_snapshot(self.root, timeout_s=2)
        self.assertFalse((self.root / "_snapshots").exists())


    def _crypt_bundle(self, action: str, path: Path, ephemeral: bytes):
        runner = REPO / "Tools/CI/fixture_aead_bundle.js"
        return subprocess.run(
            ["node", str(runner), action, str(self.root), str(path)],
            input=ephemeral.hex() + "\n", capture_output=True,
            text=True, timeout=15,
        )

    def test_authenticated_encrypted_fixture_bundle_and_restore(self):
        snap = p.coherent_fixture_snapshot(self.root)
        ephemeral = os.urandom(32)
        sealed = self._crypt_bundle("seal", snap, ephemeral)
        self.assertEqual(sealed.returncode, 0, sealed.stderr[:160])
        archive = Path(sealed.stdout.strip())
        self.assertTrue(archive.is_file())
        self.assertEqual(stat.S_IMODE(archive.stat().st_mode), 0o600)
        bytes_saved = archive.read_bytes()
        self.assertNotIn(b"clients.sqlite", bytes_saved)
        self.assertNotIn(self.key.hex().encode(), bytes_saved)
        self.assertNotIn(FIXTURE_ID.encode(), bytes_saved)
        # Demonstrate standalone recovery: remove the original *fixture-only*
        # unencrypted snapshot before decrypting the authenticated package.
        shutil.rmtree(snap)
        unsealed = self._crypt_bundle("open", archive, ephemeral)
        self.assertEqual(unsealed.returncode, 0, unsealed.stderr[:160])
        unpacked = Path(unsealed.stdout.strip())
        self.assertTrue(unpacked.is_dir())
        self.assertEqual(p._validate_fixture_bundle(unpacked),
                         (FIXTURE_ID, FIXTURE_EPOCH))
        restored = p.fixture_restore(self.root, unpacked)
        self.assertEqual(p._validate_fixture_bundle(restored),
                         (FIXTURE_ID, FIXTURE_EPOCH))

    def test_fixture_encrypted_bundle_rejects_wrong_key(self):
        snap = p.coherent_fixture_snapshot(self.root)
        sealed = self._crypt_bundle("seal", snap, os.urandom(32))
        self.assertEqual(sealed.returncode, 0, sealed.stderr[:160])
        archive = Path(sealed.stdout.strip())
        before = list((self.root / "_snapshots").iterdir())
        rejected = self._crypt_bundle("open", archive, os.urandom(32))
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("FIXTURE_AEAD_AUTH_FAILED", rejected.stderr)
        self.assertEqual(list((self.root / "_snapshots").iterdir()), before)

    def test_fixture_encrypted_bundle_detects_tamper_without_restoring(self):
        snap = p.coherent_fixture_snapshot(self.root)
        key = os.urandom(32)
        sealed = self._crypt_bundle("seal", snap, key)
        self.assertEqual(sealed.returncode, 0, sealed.stderr[:160])
        archive = Path(sealed.stdout.strip())
        bundle = json.loads(archive.read_text())
        ciphertext = bundle["ciphertext"]
        # Replace one base64 character so the AEAD tag cannot authenticate.
        bundle["ciphertext"] = ("A" if ciphertext[0] != "A" else "B") + ciphertext[1:]
        archive.write_text(json.dumps(bundle) + "\n")
        before = list((self.root / "_snapshots").iterdir())
        rejected = self._crypt_bundle("open", archive, key)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("FIXTURE_AEAD_AUTH_FAILED", rejected.stderr)
        self.assertEqual(list((self.root / "_snapshots").iterdir()), before)

    def test_fixture_encryption_rejects_non_fixture_source(self):
        # The JS helper MUST refuse to access real GEN-1 files even if
        # someone accidentally invokes it with an actual deployment path.
        runner = REPO / "Tools/CI/fixture_aead_bundle.js"
        rejected = subprocess.run(
            ["node", str(runner), "seal", "/var/lib/iatb/debug",
             "/var/lib/iatb/debug/data/Database/clients.sqlite"],
            input=os.urandom(32).hex() + "\n",
            capture_output=True, text=True, timeout=10,
        )
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("FIXTURE_SANDBOX_REQUIRED", rejected.stderr)

    def test_snapshot_repeat_does_not_mutate_source_generation(self):
        one = p.coherent_fixture_snapshot(self.root)
        two = p.coherent_fixture_snapshot(self.root)
        self.assertNotEqual(one, two)
        self.assertEqual(p._validate_fixture_bundle(self.root), (FIXTURE_ID, FIXTURE_EPOCH))
        self.assertEqual(p._validate_fixture_bundle(one), p._validate_fixture_bundle(two))


if __name__ == "__main__":
    unittest.main(verbosity=2)
