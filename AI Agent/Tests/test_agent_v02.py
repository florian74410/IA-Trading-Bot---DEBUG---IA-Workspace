"""Security regression tests for v0.2. Only local temp files; never contact GEN-1."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load(rel: str, name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


policy = load("Engine/PolicyEngine/policy.py", "iatb_policy_v02")
permission = load("Engine/PermissionManager/requests.py", "iatb_requests_v02")
audit = load("Audit/audit.py", "iatb_audit_v02")
memory = load("Engine/MemoryManager/manager.py", "iatb_memory_v02")
skills = load("Engine/SkillLoader/loader.py", "iatb_skills_v02")


class TestAuthority:
    def is_granted(self, **kwargs):
        return kwargs["action"] == "memory.stats" and kwargs["resource"] == "general-memory"


class TestPolicy(unittest.TestCase):
    def setUp(self):
        self.engine = policy.load_default(TestAuthority())

    def test_default_deny(self):
        d = self.engine.evaluate(action="debug.deploy", resource="iatb-debug-online", principal="iatb-agent")
        self.assertEqual(d.outcome, "DENY")

    def test_protected_authority_required(self):
        d = policy.load_default().evaluate(action="memory.stats", resource="general-memory", principal="iatb-agent")
        self.assertEqual(d.outcome, "DENY")
        self.assertEqual(d.reason, "NO_PROTECTED_GRANT")

    def test_verified_read_only_intent_not_execution(self):
        d = self.engine.evaluate(action="memory.stats", resource="general-memory", principal="iatb-agent")
        self.assertEqual(d.outcome, "ALLOW")
        self.assertFalse(d.executable)

    def test_hard_deny_overrides_any_allow(self):
        for action, resource in [
            ("release.stop", "iatb-debug-online"),
            ("security.disable", "iatb-debug-online"),
            ("debug.volumes.delete", "iatb-debug-online"),
            ("trading.live.order", "iatb-debug-online"),
            ("docker.raw.exec", "iatb-debug-online"),
            ("debug.status", "RELEASE"),
        ]:
            with self.subTest(action=action):
                d = self.engine.evaluate(action=action, resource=resource, principal="iatb-agent")
                self.assertEqual(d.outcome, "HARD_DENY")

    def test_restricted_never_auto_approved(self):
        d = self.engine.evaluate(action="debug.package.install", resource="iatb-debug-online", principal="iatb-agent")
        self.assertEqual(d.outcome, "RESTRICTED")

    def test_paths_and_invalid_ids(self):
        for resource in ("/srv/iatb-debug", "../etc/passwd", "debug//etc", r"debug\\etc"):
            d = self.engine.evaluate(action="github.read", resource=resource, principal="iatb-agent")
            self.assertNotEqual(d.outcome, "ALLOW")

    def test_wildcard_allow_forbidden(self):
        with tempfile.TemporaryDirectory() as tmp:
            allowed = Path(tmp) / "allowed.json"
            allowed.write_text(json.dumps({"rules": [
                {"id": "wild", "action": "*", "resource": "iatb-debug-online", "principal": "iatb-agent"}
            ]}))
            with self.assertRaises(ValueError):
                policy.PolicyEngine(allowed, ROOT / "Rules/Non-Authorized/denied.json", TestAuthority())

    def test_bad_timestamp_deny(self):
        d = self.engine.evaluate(action="memory.stats", resource="general-memory",
                                 principal="iatb-agent", at=datetime(2026, 10, 31))
        self.assertEqual(d.outcome, "DENY")


class Verifier:
    def verify(self, **kwargs):
        return kwargs["proof"] == "external-signature-placeholder" and kwargs["admin_identity"] == "admin-verified"


class TestRequests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = permission.RequestStore(Path(self.tmp.name) / "request.sqlite")

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def submit(self):
        return self.store.submit(principal="iatb-agent", action="debug.package.install",
            resource="iatb-debug-online", reason="Valid diagnostic dependency needed",
            risks="Potential system impact", duration_seconds=600, max_uses=1)

    def test_submit_and_refuse_without_admin(self):
        item = self.submit()
        self.assertEqual(item["status"], "PENDING")
        with self.assertRaises(PermissionError):
            self.store.decide(item["id"], status="APPROVED", admin_identity="iatb-agent", proof="x")
        with self.assertRaises(PermissionError):
            self.store.decide(item["id"], status="APPROVED", admin_identity="admin-verified", proof="x")
        self.assertEqual(self.store.get(item["id"])["status"], "PENDING")

    def test_explicit_out_of_band_approval_is_record_only(self):
        item = self.submit()
        self.store.verifier = Verifier()
        with self.assertRaises(PermissionError):
            self.store.decide(item["id"], status="APPROVED", admin_identity="admin-verified", proof="invalid")
        result = self.store.decide(item["id"], status="APPROVED",
                                   admin_identity="admin-verified", proof="external-signature-placeholder")
        self.assertEqual(result["status"], "APPROVED")
        self.assertEqual(policy.load_default().evaluate(
            action=result["action"], resource=result["resource"],
            principal=result["principal"]).outcome, "RESTRICTED")

    def test_invalid_scope_rejected(self):
        with self.assertRaises(ValueError):
            self.store.submit(principal="iatb-agent", action="debug.status",
                resource="RELEASE", reason="This is a forbidden access request",
                risks="Production outage", duration_seconds=600, max_uses=1)


class TestAudit(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.log = audit.AuditLog(Path(self.tmp.name) / "audit.sqlite")

    def tearDown(self):
        self.log.close()
        self.tmp.cleanup()

    def test_append_only_and_secrets(self):
        eid = self.log.append(principal="agent", action="memory.stats", resource="general-memory",
                             policy_version="v0.2", decision="DENY", result="Default deny")
        with self.assertRaises(sqlite3.DatabaseError):
            self.log.db.execute("UPDATE audit_events SET result='hidden' WHERE id=?", (eid,))
        with self.assertRaises(ValueError):
            self.log.append(principal="agent", action="memory.stats", resource="general-memory",
                            policy_version="v0.2", decision="DENY", result="Bearer abcdefg")
        self.assertEqual(len(self.log.export()), 1)


class TestMemory(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.environ.get("IATB_AGENT_MEMORY_DB")
        os.environ["IATB_AGENT_MEMORY_DB"] = str(Path(self.tmp.name) / "data" / "memory.sqlite")
        self.manager = memory.MemoryManager()

    def tearDown(self):
        self.manager.close()
        if self.old is None:
            os.environ.pop("IATB_AGENT_MEMORY_DB", None)
        else:
            os.environ["IATB_AGENT_MEMORY_DB"] = self.old
        self.tmp.cleanup()

    def test_compatibility_append_correction_search(self):
        id1 = self.manager.append(kind="observation", source="test",
                                  summary="A diagnostic was observed", reference="commit123")
        id2 = self.manager.correct(id1, summary="This diagnostic was revised", source="test")
        self.assertEqual(self.manager.get(id2)["correction_of"], id1)
        self.assertEqual(len(self.manager.search("diagnostic")), 2)
        self.assertEqual(self.manager.stats()["count"], 2)
        self.assertEqual(len(self.manager.export()), 2)

    def test_sql_injection_and_secret_rejection(self):
        self.manager.append(kind="observation", source="test", summary="Safe record")
        self.assertEqual(self.manager.search("') OR 1=1 --"), [])
        with self.assertRaises(ValueError):
            self.manager.append(kind="observation", source="test", summary="api_key=abcdef123456")


class TestSkills(unittest.TestCase):
    def test_catalog_only(self):
        catalog = skills.inspect_skills(ROOT / "Skills")
        self.assertGreaterEqual(len(catalog), 6)
        self.assertTrue(all(item["status"] == "CATALOG_ONLY" for item in catalog))


if __name__ == "__main__":
    unittest.main()
