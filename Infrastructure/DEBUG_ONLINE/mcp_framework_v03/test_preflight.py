import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from preflight import inspect


class PreflightTests(unittest.TestCase):
    def test_read_only_and_no_secret_contents(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            source=root/"server.py"
            source.write_text("SECRET_TOKEN=do-not-print\n")
            work=root/"workspace"
            work.mkdir()
            config={"service":"test-service", "port":1, "source":str(source), "workspace":str(work)}
            with patch("preflight.command", return_value={"exit":0,"out":"active"}):
                with patch("preflight.socket.create_connection") as sock:
                    result=inspect("debug",config)
            self.assertEqual(result["source_sha256"],hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertNotIn("do-not-print",str(result))
            self.assertTrue(result["service_active"])
            self.assertTrue(result["loopback_port_listening"])

    def test_missing_source_reports_issue(self):
        with tempfile.TemporaryDirectory() as d:
            config={"service":"missing", "port":1,"source":d+"/absent.py", "workspace":d}
            with patch("preflight.command",return_value={"exit":3,"out":"inactive"}):
                with patch("preflight.socket.create_connection",side_effect=ConnectionRefusedError):
                    result=inspect("architecture",config)
            self.assertIn("source_missing_or_different_install_path",result["issues"])
            self.assertFalse(result["service_active"])


if __name__=="__main__":
    unittest.main()
