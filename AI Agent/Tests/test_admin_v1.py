"""Admin v1: Soul and event feed are read-only and backed by allowlisted sources."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest

P = Path(__file__).resolve().parents[1] / "AdminPanel" / "server.py"
spec = importlib.util.spec_from_file_location("iatb_admin_v1", P)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class AdminV1Tests(unittest.TestCase):
    def test_soul_fixed_readonly_catalog(self):
        result = module.collect_soul()
        self.assertEqual(result["status"], "read_only")
        self.assertTrue(result["items"])
        allowed = {"identity.md","behavior.md","personality.json","objectives.json"}
        for item in result["items"]:
            self.assertIn(item["name"], allowed)
            self.assertEqual(item["mode"],"READ_ONLY")
            self.assertLessEqual(len(item["content"]), 12000)

    def test_journal_no_fabricated_reflections(self):
        entries = module.collect_journal()
        self.assertIn(entries["status"], ("not_configured","read_only"))
        self.assertTrue(all(e["type"] in ("AUDIT","REQUEST") for e in entries["items"]))

    def test_no_write_endpoint(self):
        source = P.read_text(encoding="utf-8")
        self.assertIn('do_PUT = do_PATCH = do_DELETE = do_POST',source)
        self.assertIn('("127.0.0.1", args.port)',source)

if __name__ == "__main__":
    unittest.main()
