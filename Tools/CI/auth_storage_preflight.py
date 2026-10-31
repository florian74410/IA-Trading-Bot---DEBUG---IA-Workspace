#!/usr/bin/env python3
"""IA-TB Auth 2.1 P2.1: metadata-only preflight and *fixture-only* SQLite snapshot.

No imports from IA-TB runtime modules (some legacy imports create keys).
Never run backup/restore on a real IA-TB directory: backup helpers require a
private, generated testing fixture marker AND a scratch directory under /tmp.
"""
from __future__ import annotations

import argparse
from contextlib import closing, contextmanager
import fcntl
import hashlib
import time
import hmac
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import tempfile
from urllib.parse import quote
import uuid

ROOTS = ("runtime", "data", "state", "annexes", "updates")
METADATA_TARGETS = (
    "runtime", "data", "state", "annexes", "updates",
    "data/Database", "data/Database/clients.sqlite",
    "data/Security", "data/Security/client_master.key",
    "data/User Data/default/user_data.db",
    "data/User Data/default/portfolio.db",
    "runtime/state/security",
)
# Wallet intentionally excluded: no wallet master key, service or data touches.
FIXTURE_DATABASES = (
    "data/Database/clients.sqlite",
    "data/User Data/default/user_data.db",
    "data/User Data/default/portfolio.db",
)
CLIENT_KEY = "data/Security/client_master.key"
TEST_MARKER = ".iatb-auth-p21-fixture-only"
FIXTURE_BARRIER = ".iatb-auth-p21-coherence.lock"
TEST_CANARY = b"IA-TB-P21-FICTITIOUS-KEY-BINDING-V1"


class UnsafeStorage(RuntimeError):
    """Untrusted path, missing key, inconsistent DB or unsafe operation."""


def _inside(root: Path, relative: str) -> Path:
    if not relative or Path(relative).is_absolute() or any(
        part in ("", ".", "..") for part in relative.split("/")
    ):
        raise UnsafeStorage("STORAGE_PATH_NOT_ALLOWED")
    # Reject symlinks in each existing component (no resolve-follow).
    here = root
    for part in Path(relative).parts:
        here = here / part
        try:
            if stat.S_ISLNK(here.lstat().st_mode):
                raise UnsafeStorage("STORAGE_SYMLINK_REFUSED")
        except FileNotFoundError:
            continue
    return here


def metadata_preflight(root: Path) -> dict:
    """Read **only** lstat metadata. Never mkdir/open SQLite/read any key."""
    root = Path(os.path.abspath(root))
    if root.is_symlink():
        raise UnsafeStorage("STORAGE_ROOT_SYMLINK")
    report = {"mode": "READ_ONLY_METADATA", "targets": {}, "blockers": []}
    for rel in METADATA_TARGETS:
        try:
            path = _inside(root, rel)
            info = path.lstat()
            kind = "dir" if stat.S_ISDIR(info.st_mode) else (
                "file" if stat.S_ISREG(info.st_mode) else "unsupported"
            )
            report["targets"][rel] = {
                "kind": kind, "mode": format(stat.S_IMODE(info.st_mode), "04o"),
                "uid": info.st_uid, "gid": info.st_gid,
            }
            if kind == "unsupported":
                report["blockers"].append("STORAGE_TYPE_UNSUPPORTED:" + rel)
        except FileNotFoundError:
            report["targets"][rel] = {"kind": "absent"}
        except UnsafeStorage:
            report["targets"][rel] = {"kind": "symlink_refused"}
            report["blockers"].append("STORAGE_SYMLINK_REFUSED:" + rel)
        except OSError as exc:
            report["targets"][rel] = {"kind": "error", "code": type(exc).__name__}
            report["blockers"].append("STORAGE_METADATA_ERROR:" + rel)
    for rel in ROOTS:
        if report["targets"][rel]["kind"] != "dir":
            report["blockers"].append("STORAGE_ROOT_REQUIRED:" + rel)
    if report["targets"]["data/Database/clients.sqlite"]["kind"] == "file" \
       and report["targets"][CLIENT_KEY]["kind"] != "file":
        report["blockers"].append("CLIENT_MASTER_KEY_MISSING_EXISTING_DB")
    report["ready_for_change"] = not report["blockers"]
    return report


def _fixture_guard(root: Path) -> Path:
    """Prohibit fixture backups on host/GEN1 paths, including by mistake."""
    root = Path(root).absolute()
    temporary = Path(tempfile.gettempdir()).resolve()
    try:
        real = root.resolve(strict=True)
        real.relative_to(temporary)
        if real == temporary:
            raise ValueError("temporary root itself")
        if real != root or root.is_symlink():
            raise ValueError("fixture root symlink")
        marker = _inside(real, TEST_MARKER)
        if not stat.S_ISREG(marker.lstat().st_mode) or marker.read_text() != "IA-TB-AUTH-P21-FIXTURE\n":
            raise ValueError("fixture marker mismatch")
        if stat.S_IMODE(real.stat().st_mode) != 0o700:
            raise ValueError("fixture directory must be private")
    except (ValueError, OSError) as exc:
        raise UnsafeStorage("FIXTURE_SANDBOX_REQUIRED") from exc
    return real



@contextmanager
def _fixture_barrier(root: Path, *, exclusive: bool, timeout_s: float = 3.0):
    """Cooperative *fixture-only* cross-process fcntl.flock barrier.

    Every simulated writer MUST hold a shared lock throughout its SQL
    transaction(s); the multi-DB snapshot holds an exclusive lock throughout
    source validation and copying. This is NOT production coordination unless
    every real writer independently adopts and obeys a reviewed protocol.
    No request/tick path imports or uses this code in GEN-1.
    """
    root = _fixture_guard(root)
    if not isinstance(timeout_s, (int, float)) or timeout_s <= 0 or timeout_s > 60:
        raise UnsafeStorage("FIXTURE_BARRIER_TIMEOUT_INVALID")
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        location = _inside(root, FIXTURE_BARRIER)
        fd = os.open(location, flags, 0o600)
    except (OSError, UnsafeStorage) as exc:
        raise UnsafeStorage("FIXTURE_BARRIER_OPEN_REFUSED") from exc
    locked = False
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or stat.S_IMODE(st.st_mode) != 0o600 \
           or st.st_uid != os.getuid():
            raise UnsafeStorage("FIXTURE_BARRIER_UNTRUSTED_PERMISSIONS")
        operation = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
        until = time.monotonic() + timeout_s
        while True:
            try:
                fcntl.flock(fd, operation | fcntl.LOCK_NB)
                locked = True
                break
            except BlockingIOError as exc:
                if time.monotonic() >= until:
                    raise UnsafeStorage("FIXTURE_BARRIER_BUSY_TIMEOUT") from exc
                time.sleep(0.01)
        yield
    finally:
        if locked:
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def fixture_writer_guard(root: Path, *, timeout_s: float = 3.0):
    """Use on *every* fixture write, including the full multi-DB generation."""
    return _fixture_barrier(root, exclusive=False, timeout_s=timeout_s)


def fixture_snapshot_barrier(root: Path, *, timeout_s: float = 3.0):
    """Reserve all fixture DB writers while capturing a coherent generation."""
    return _fixture_barrier(root, exclusive=True, timeout_s=timeout_s)


def coherent_fixture_snapshot(root: Path, *, timeout_s: float = 3.0,
                              injected_failure_after: int | None = None) -> Path:
    """Only public fixture snapshot API: lock then copy as one generation."""
    with fixture_snapshot_barrier(root, timeout_s=timeout_s):
        return _fixture_snapshot_unlocked(root, injected_failure_after=injected_failure_after)


def _sqlite_ro(path: Path) -> sqlite3.Connection:
    if not path.is_file() or path.is_symlink():
        raise UnsafeStorage("FIXTURE_SQLITE_NOT_REGULAR_FILE")
    # mode=ro is mandatory; sqlite3.connect(path) would create missing DBs.
    uri = "file:" + quote(str(path), safe="/") + "?mode=ro"
    return sqlite3.connect(uri, uri=True, timeout=5)


def _db_ok(db: sqlite3.Connection) -> None:
    if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
        raise UnsafeStorage("FIXTURE_SQLITE_QUICK_CHECK_FAILED")
    if db.execute("PRAGMA foreign_key_check").fetchone() is not None:
        raise UnsafeStorage("FIXTURE_SQLITE_FOREIGN_KEY_FAILED")


def _fixture_key(root: Path) -> bytes:
    key_file = _inside(root, CLIENT_KEY)
    if not key_file.is_file() or key_file.is_symlink():
        raise UnsafeStorage("CLIENT_MASTER_KEY_REQUIRED_NO_AUTO_GENERATION")
    raw = key_file.read_text().strip()
    try:
        key = bytes.fromhex(raw)
    except ValueError as exc:
        raise UnsafeStorage("CLIENT_MASTER_KEY_INVALID") from exc
    if len(key) != 32:
        raise UnsafeStorage("CLIENT_MASTER_KEY_INVALID")
    return key


def _validate_fixture_bundle(root: Path) -> tuple[str, str]:
    """Verify a *synthetic* HMAC canary. Not a production AES decrypt check."""
    key = _fixture_key(root)
    generations = set()
    for rel in FIXTURE_DATABASES:
        with closing(_sqlite_ro(_inside(root, rel))) as db:
            _db_ok(db)
            row = db.execute("SELECT epoch FROM fixture_generation").fetchone()
            if row is None or not isinstance(row[0], str):
                raise UnsafeStorage("FIXTURE_GENERATION_UNAVAILABLE")
            generations.add(row[0])
    if len(generations) != 1:
        raise UnsafeStorage("FIXTURE_INTER_DATABASE_DRIFT")
    with closing(_sqlite_ro(_inside(root, FIXTURE_DATABASES[0]))) as db:
        versions = [x[0] for x in db.execute("SELECT version FROM client_schema_migrations ORDER BY version")]
        if versions != [1, 2]:
            raise UnsafeStorage("FIXTURE_CLIENT_SCHEMA_MISMATCH")
        client = db.execute("SELECT client_id, first_name_enc FROM clients").fetchone()
        if client is None:
            raise UnsafeStorage("FIXTURE_CLIENT_MISSING")
        expected = hmac.new(key, TEST_CANARY + client[0].encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(client[1], expected):
            raise UnsafeStorage("CLIENT_MASTER_KEY_DOES_NOT_MATCH_FIXTURE")
        account = db.execute("SELECT role FROM client_accounts WHERE client_id=?", (client[0],)).fetchone()
        if account != ("USER",):
            raise UnsafeStorage("FIXTURE_ACCOUNT_CHANGED")
    return client[0], next(iter(generations))


def _fixture_snapshot_unlocked(root: Path, *, injected_failure_after: int | None = None) -> Path:
    """Internal backup; call coherent_fixture_snapshot to lock fixture writers.

    The file lock guarantees coherence ONLY between participating fictitious
    writers; do not mistake it for a GEN-1 business-write barrier.
    """
    root = _fixture_guard(root)
    _validate_fixture_bundle(root)
    stage_parent = root / "_snapshots"
    stage_parent.mkdir(mode=0o700, exist_ok=True)
    if stage_parent.is_symlink():
        raise UnsafeStorage("FIXTURE_SNAPSHOT_STAGE_SYMLINK")
    stage = Path(tempfile.mkdtemp(prefix=".pending-", dir=stage_parent))
    os.chmod(stage, 0o700)
    finished = False
    try:
        for i, rel in enumerate(FIXTURE_DATABASES, 1):
            src = _inside(root, rel)
            dest = stage / rel
            dest.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            with closing(_sqlite_ro(src)) as existing, closing(sqlite3.connect(dest)) as copied:
                existing.backup(copied, pages=32, sleep=0.01)
                copied.commit()
            # Normalize the backup *copy* (never the live source) to DELETE so
            # it is a self-contained SQLite file without -wal/-shm sidecars.
            with closing(sqlite3.connect(dest)) as normalized:
                normalized.execute("PRAGMA journal_mode=DELETE")
                _db_ok(normalized)
            os.chmod(dest, 0o600)
            if injected_failure_after == i:
                raise UnsafeStorage("FIXTURE_INJECTED_BACKUP_FAILURE")
        dest_key = stage / CLIENT_KEY
        dest_key.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        with dest_key.open("x") as outfile:
            os.chmod(dest_key, 0o600)
            outfile.write(_fixture_key(root).hex() + "\n")
        client_id, epoch = _validate_fixture_bundle(stage)
        manifest = {"type": "UNENCRYPTED_FIXTURE_ONLY_NOT_EXPORTABLE", "databases": list(FIXTURE_DATABASES),
                    "client_id": client_id, "epoch": epoch, "source_environment": "TEST_ONLY"}
        manifest_file = stage / "manifest.json"
        manifest_file.write_text(json.dumps(manifest, sort_keys=True) + "\n")
        os.chmod(manifest_file, 0o600)
        target = stage_parent / ("fixture-" + uuid.uuid4().hex)
        stage.rename(target)
        finished = True
        return target
    finally:
        if not finished:
            shutil.rmtree(stage)


def fixture_restore(root: Path, snapshot: Path) -> Path:
    """Restore only test fixtures to new, never-existing scratch destination."""
    root = _fixture_guard(root)
    snap_parent = root / "_snapshots"
    if snapshot.parent != snap_parent or not snapshot.name.startswith("fixture-") or snapshot.is_symlink():
        raise UnsafeStorage("FIXTURE_SNAPSHOT_PATH_REFUSED")
    _validate_fixture_bundle(snapshot)
    metadata = json.loads((snapshot / "manifest.json").read_text())
    if metadata.get("type") != "UNENCRYPTED_FIXTURE_ONLY_NOT_EXPORTABLE":
        raise UnsafeStorage("FIXTURE_MANIFEST_NOT_RECOGNIZED")
    dest_parent = root / "_restored"
    dest_parent.mkdir(mode=0o700, exist_ok=True)
    if dest_parent.is_symlink():
        raise UnsafeStorage("FIXTURE_RESTORE_STAGE_SYMLINK")
    dest = Path(tempfile.mkdtemp(prefix=".restore-", dir=dest_parent))
    finished = False
    try:
        for rel in [*FIXTURE_DATABASES, CLIENT_KEY]:
            src = _inside(snapshot, rel)
            target = dest / rel
            target.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            if src.is_symlink() or not src.is_file():
                raise UnsafeStorage("FIXTURE_RESTORE_INVALID_FILE")
            shutil.copyfile(src, target)
            os.chmod(target, 0o600)
        a, b = _validate_fixture_bundle(dest)
        if a != metadata.get("client_id") or b != metadata.get("epoch"):
            raise UnsafeStorage("FIXTURE_RESTORED_GENERATION_CHANGED")
        final = dest_parent / ("restored-" + uuid.uuid4().hex)
        dest.rename(final)
        finished = True
        return final
    finally:
        if not finished:
            shutil.rmtree(dest)


def main() -> None:
    parser = argparse.ArgumentParser(description="IA-TB P2.1 readonly Auth storage metadata preflight")
    parser.add_argument("--inspect-root", help="Print lstat metadata only; never opens SQLite or reads key")
    args = parser.parse_args()
    if not args.inspect_root:
        parser.error("--inspect-root is required; backup/restore are fixture-test-only Python helpers")
    print(json.dumps(metadata_preflight(Path(args.inspect_root)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
