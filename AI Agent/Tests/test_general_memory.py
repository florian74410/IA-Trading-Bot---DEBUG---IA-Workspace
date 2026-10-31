"""Automated tests for the IA-TB AI Agent SQLite operational memory."""
import importlib.util
import os
from pathlib import Path
import sqlite3
import stat
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve()
MODULE = HERE.parents[1] / "Memory" / "General" / "journal.py"
spec = importlib.util.spec_from_file_location("iatb_agent_journal", MODULE)
journal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(journal)


class GeneralMemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "agent-memory" / "general.sqlite"
        self.env = patch.dict(os.environ, {"IATB_AGENT_MEMORY_DB": str(self.path)})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_schema_and_append_only_and_timestamp(self):
        with journal.connect() as db:
            first = journal.append(
                db,
                kind="observation", source="github",
                summary="CI success for tested revision", reference="sha:abc123",
            )
            second = journal.append(
                db,
                kind="decision", source="chat",
                summary="Keep DEBUG isolated from RELEASE",
                confidence="observed",
            )
            self.assertEqual(second, first + 1)
            rows = db.execute("SELECT * FROM general_memory ORDER BY id").fetchall()
            self.assertEqual(len(rows), 2)
            self.assertTrue(rows[0]["created_at_utc"].endswith("Z"))
            self.assertTrue(rows[0]["created_at_utc"].startswith("20"))
            with self.assertRaises(sqlite3.DatabaseError):
                db.execute("UPDATE general_memory SET summary='forged' WHERE id=?", (first,))
            with self.assertRaises(sqlite3.DatabaseError):
                db.execute("DELETE FROM general_memory WHERE id=?", (first,))
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.path.parent.stat().st_mode), 0o700)

    def test_correction_and_secret_rejection(self):
        with journal.connect() as db:
            original = journal.append(
                db, kind="analysis_summary", source="test",
                summary="An initial diagnostic requiring correction",
            )
            corr = journal.append(
                db, kind="correction", source="test",
                summary="Corrected technical diagnosis",
                correction_of=original,
            )
            row = db.execute("SELECT correction_of FROM general_memory WHERE id=?", (corr,)).fetchone()
            self.assertEqual(row["correction_of"], original)
            for secret in [
                "Authorization: Bearer abcdef1234567",
                "password=supersecret123",
                "-----BEGIN PRIVATE KEY-----",
            ]:
                with self.assertRaises(ValueError):
                    journal.append(db, kind="observation", source="test", summary=secret)
            with self.assertRaises(ValueError):
                journal.append(db, kind="correction", source="test", summary="broken")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM general_memory").fetchone()[0], 2)

    def test_private_path_and_no_sql_injection(self):
        with journal.connect() as db:
            journal.append(db, kind="action", source="test", summary="A safe deploy example")
            needle = "%' OR 1=1 --"
            rows = db.execute(
                "SELECT * FROM general_memory WHERE instr(lower(summary),lower(?))>0", (needle,)
            ).fetchall()
            self.assertEqual(rows, [])
        with patch.dict(os.environ, {"IATB_AGENT_MEMORY_DB": "relative/general.sqlite"}):
            with self.assertRaises(ValueError):
                journal.database_path()

    def test_schema_file_exists_and_no_sqlite_database_committed(self):
        self.assertTrue((MODULE.parent / "schema.sql").is_file())
        self.assertFalse(any(p.suffix == ".sqlite" for p in MODULE.parent.iterdir()))


if __name__ == "__main__":
    unittest.main()
