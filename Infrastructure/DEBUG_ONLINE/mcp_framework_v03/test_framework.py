import tempfile
import unittest
from pathlib import Path
from framework import WorkspaceOps, Denied, safe_path, custom_request


class FrameworkTests(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.root = Path(self.t.name).resolve()
        (self.root / "ok.txt").write_text("hello", encoding="utf-8")
        self.ops = WorkspaceOps(self.root, environment="debug")

    def test_read_and_list(self):
        self.assertEqual(self.ops.read_file("ok.txt"), "hello")
        self.assertIn("ok.txt", self.ops.list_files())

    def test_atomic_workspace_write(self):
        result = self.ops.write_file("ok.txt", "changed")
        self.assertFalse(result["deployed"])
        self.assertEqual(self.ops.read_file("ok.txt"), "changed")
        with self.assertRaises(Denied):
            self.ops.write_file("../outside.txt", "x")
        (self.root / "dirlink").symlink_to("/tmp")
        with self.assertRaises(Denied):
            self.ops.write_file("dirlink/attack", "x")

    def test_traversal(self):
        for bad in ("../etc/passwd", "/etc/passwd", ".", "a/../ok.txt", "a//b"):
            with self.subTest(bad=bad), self.assertRaises(Denied):
                safe_path(self.root, bad)

    def test_symlink(self):
        (self.root / "link").symlink_to("/etc")
        with self.assertRaises(Denied):
            self.ops.read_file("link/passwd")

    def test_limits(self):
        with self.assertRaises(Denied):
            self.ops.list_files(10000)
        with self.assertRaises(Denied):
            self.ops.git_log(0)
        with self.assertRaises(Denied):
            self.ops.run_test("bash -c id")

    def test_environment(self):
        with self.assertRaises(Denied):
            WorkspaceOps(self.root, environment="release")

    def test_custom_request_is_nonexecuting(self):
        result = custom_request("restart_isolated_service", "Restart staging service after validation")
        self.assertFalse(result["executed"])
        self.assertEqual(result["status"], "NOT_SUBMITTED")
        with self.assertRaises(Denied):
            custom_request("run_shell", "sudo rm -rf /")

    def test_syntax_check(self):
        (self.root / "simple.py").write_text("x = 1\n")
        self.assertEqual(self.ops.run_test("python_compile")["exit_code"], 0)


if __name__ == "__main__":
    unittest.main()
