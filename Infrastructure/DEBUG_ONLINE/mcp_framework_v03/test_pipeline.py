import tempfile
import unittest
from pathlib import Path
from mission import Phase
from mission_store import MissionStore
from pipeline import MissionPipeline, Check


class FakeAdapter:
    def __init__(self, *, tests=True, deploy=True, health=True, rollback=True):
        self.responses = dict(test=tests, deploy=deploy, health=health, rollback=rollback)
        self.calls = []

    def _call(self, op, env, mission_id):
        assert env in ("debug", "architecture")
        self.calls.append((op, env, mission_id))
        return Check(self.responses[op], op + " evidence")

    def test(self, env, mid): return self._call("test", env, mid)
    def deploy(self, env, mid, sha):
        assert len(sha) == 40
        return self._call("deploy", env, mid)
    def health(self, env, mid): return self._call("health", env, mid)
    def rollback(self, env, mid): return self._call("rollback", env, mid)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = MissionStore(Path(self.temp.name) / "db.sqlite")
        self.m = self.store.create("architecture", "Deploy reviewed Architecture updates")

    def update(self, phase, **kwargs):
        self.m = self.store.advance(self.m["id"], phase, phase.value,
                                    expected_revision=self.m["revision"], **kwargs)

    def prepare(self):
        self.update(Phase.CODING)
        self.update(Phase.TESTING)
        self.update(Phase.REVIEW)
        self.update(Phase.APPROVED, approved_sha="c" * 40,
                    verify_approval=lambda e, mid, sha: e == "architecture" and mid == self.m["id"])

    def test_approval_required(self):
        fake = FakeAdapter()
        with self.assertRaises(PermissionError):
            MissionPipeline(self.store, fake).deploy_approved(self.m["id"])
        self.assertEqual(fake.calls, [])

    def test_deploy_and_health(self):
        self.prepare()
        fake = FakeAdapter()
        done = MissionPipeline(self.store, fake).deploy_approved(self.m["id"])
        self.assertEqual(done["phase"], "succeeded")
        self.assertEqual([x[0] for x in fake.calls], ["deploy", "health"])

    def test_health_fail_rolls_back(self):
        self.prepare()
        fake = FakeAdapter(health=False)
        done = MissionPipeline(self.store, fake).deploy_approved(self.m["id"])
        self.assertEqual(done["phase"], "rolled_back")
        self.assertEqual([x[0] for x in fake.calls], ["deploy", "health", "rollback"])

    def test_rollback_failure_stops(self):
        self.prepare()
        fake = FakeAdapter(deploy=False, rollback=False)
        done = MissionPipeline(self.store, fake).deploy_approved(self.m["id"])
        self.assertEqual(done["phase"], "failed")

    def test_test_failure_needs_explicit_retry(self):
        self.update(Phase.CODING)
        fake = FakeAdapter(tests=False)
        result = MissionPipeline(self.store, fake).run_tests(self.m["id"])
        self.assertEqual(result["phase"], "testing")
        self.assertEqual(result["attempts"], 1)
        self.assertEqual(len(fake.calls), 1)


if __name__ == "__main__":
    unittest.main()
