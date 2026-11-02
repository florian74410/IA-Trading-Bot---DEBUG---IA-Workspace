import tempfile
import unittest
from pathlib import Path
from mission import Phase
from mission_store import MissionStore, MissionConflict


class DurableMissionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "missions.sqlite"
        self.store = MissionStore(self.path)
        self.job = self.store.create("debug", "Repair isolated DEBUG engine tests")

    def advance(self, phase, **kw):
        self.job = self.store.advance(self.job["id"], phase, phase.value, expected_revision=self.job["revision"], **kw)

    def test_durability_and_history(self):
        self.advance(Phase.CODING)
        self.advance(Phase.TESTING)
        reopened = MissionStore(self.path)
        self.assertEqual(reopened.get(self.job["id"])["phase"], "testing")
        self.assertEqual(len(reopened.history(self.job["id"])), 3)

    def test_no_forged_admin_approval(self):
        self.advance(Phase.CODING)
        self.advance(Phase.TESTING)
        self.advance(Phase.REVIEW)
        with self.assertRaises(PermissionError):
            self.advance(Phase.APPROVED, approved_sha="a" * 40)
        self.assertEqual(self.store.get(self.job["id"])["phase"], "review")
        with self.assertRaises(PermissionError):
            self.advance(Phase.APPROVED, approved_sha="a" * 40,
                         verify_approval=lambda env, mid, sha: False)
        self.advance(Phase.APPROVED, approved_sha="a" * 40,
                     verify_approval=lambda env, mid, sha:
                     env == "debug" and mid == self.job["id"] and sha == "a" * 40)
        self.advance(Phase.DEPLOYING)
        self.advance(Phase.VERIFYING)
        self.advance(Phase.SUCCEEDED)
        self.assertEqual(self.job["phase"], "succeeded")

    def test_reject_stale_writers(self):
        self.advance(Phase.CODING)
        with self.assertRaises(MissionConflict):
            self.store.advance(self.job["id"], Phase.TESTING, "stale", expected_revision=0)

    def test_no_release(self):
        with self.assertRaises(ValueError):
            self.store.create("release", "Never allow release deployment")

    def test_prevent_skip_and_retry_bypass(self):
        with self.assertRaises(ValueError):
            self.advance(Phase.DEPLOYING)
        self.advance(Phase.CODING)
        self.advance(Phase.TESTING)
        self.advance(Phase.CODING)
        self.advance(Phase.TESTING)
        self.advance(Phase.CODING)
        self.advance(Phase.TESTING)
        with self.assertRaises(ValueError):
            self.advance(Phase.CODING)
        self.advance(Phase.FAILED)
        self.assertEqual(self.job["attempts"], 3)

if __name__ == "__main__":
    unittest.main()
