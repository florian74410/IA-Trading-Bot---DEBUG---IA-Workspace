"""Guardrail: IA-TB administration must not inherit unrelated desktop project branding."""
from __future__ import annotations

from pathlib import Path
import unittest

AGENT = Path(__file__).resolve().parents[1]


class ProjectBoundaryTests(unittest.TestCase):
    def test_admin_scope_and_no_unrelated_desktop_branding(self):
        sources = [
            AGENT / "README.md",
            AGENT / "AdminPanel" / "README.md",
            AGENT / "AdminPanel" / "index.html",
            AGENT / "AdminPanel" / "app.css",
            AGENT / "AdminPanel" / "app.js",
            AGENT / "AdminPanel" / "server.py",
        ]
        forbidden = (
            "nova" + "bar",
            "cyber" + " nexus",
            "nexus" + " hud",
            "macro" + "-xfce",
            "holo" + " mode",
        )
        for source in sources:
            text = source.read_text(encoding="utf-8").lower()
            with self.subTest(path=str(source.relative_to(AGENT))):
                self.assertTrue("ia-tb" in text or source.name == "app.css")
                for phrase in forbidden:
                    self.assertNotIn(phrase, text)

    def test_page_stays_inside_own_assets(self):
        html = (AGENT / "AdminPanel/index.html").read_text(encoding="utf-8")
        self.assertIn('href="app.css"', html)
        self.assertIn('src="app.js"', html)
        self.assertNotIn("https://", html)
        self.assertNotIn("http://", html)

    def test_gateway_is_read_only(self):
        code = (AGENT / "AdminPanel/server.py").read_text(encoding="utf-8")
        self.assertIn('("127.0.0.1", args.port)', code)
        self.assertIn('"read_only"', code)
        self.assertIn("do_POST", code)


if __name__ == "__main__":
    unittest.main()
