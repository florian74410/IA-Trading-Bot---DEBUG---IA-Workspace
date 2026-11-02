import unittest
from mission import Mission, Phase


class MissionTests(unittest.TestCase):
    def test_happy_path(self):
        m = Mission("debug", "Fix a bug in isolated DEBUG workspace")
        m.transition(Phase.CODING, reason="start")
        m.transition(Phase.TESTING, reason="unit checks")
        m.transition(Phase.REVIEW, reason="tests passed")
        m.transition(Phase.APPROVED, reason="verified external approval", approved_sha="a"*40)
        m.transition(Phase.DEPLOYING, reason="approved release")
        m.transition(Phase.VERIFYING, reason="health probe")
        m.transition(Phase.SUCCEEDED, reason="health passed")
        self.assertEqual(m.phase, Phase.SUCCEEDED)

    def test_no_skip_approval(self):
        m = Mission("architecture", "Publish isolated architecture site")
        with self.assertRaises(ValueError):
            m.transition(Phase.DEPLOYING, reason="skip")
        with self.assertRaises(ValueError):
            Mission("release", "This is prohibited from these workspaces")

    def test_retry_cap(self):
        m = Mission("debug", "Run several safe test corrections")
        for i in range(3):
            m.transition(Phase.CODING, reason="attempt")
            m.transition(Phase.TESTING, reason="validate")
            if i < 2:
                m.transition(Phase.CODING, reason="retry")
        self.assertEqual(m.attempts, 3)
        m.transition(Phase.FAILED, reason="budget exhausted")

    def test_bad_sha(self):
        m = Mission("debug", "Prepare a reviewed change")
        m.transition(Phase.CODING, reason="start")
        m.transition(Phase.TESTING, reason="test")
        m.transition(Phase.REVIEW, reason="review")
        with self.assertRaises(ValueError):
            m.transition(Phase.APPROVED, reason="unverified", approved_sha="main")

if __name__ == "__main__":
    unittest.main()
