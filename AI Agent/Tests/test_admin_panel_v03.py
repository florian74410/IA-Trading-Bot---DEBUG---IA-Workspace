"""Admin Panel 0.3 tests: isolated localhost server, no VPS and no network egress."""
from __future__ import annotations
import base64
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "AdminPanel/server.py"
spec = importlib.util.spec_from_file_location("iatb_admin_server_test", SOURCE)
servermod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(servermod)


class AdminHelpers(unittest.TestCase):
    def test_password_roundtrip_and_malformed_header(self):
        salt = b"0123456789abcdefghijklmn"
        digest = hashlib.scrypt(b"correct-long-test-password", salt=salt, n=16384,r=8,p=1,dklen=32)
        token = base64.b64encode(b"admin:correct-long-test-password").decode()
        self.assertTrue(servermod.verify_admin("Basic "+token,salt,digest))
        self.assertFalse(servermod.verify_admin("Basic !!!!",salt,digest))
        self.assertFalse(servermod.verify_admin("Bearer "+token,salt,digest))
        self.assertFalse(servermod.verify_admin("Basic "+base64.b64encode(b"user:correct-long-test-password").decode(),salt,digest))

    def test_credential_file_protection(self):
        with tempfile.TemporaryDirectory() as name:
            parent = Path(name) / "secret"
            parent.mkdir(mode=0o700)
            cred = parent / "credentials.json"
            cred.write_text('{"algorithm":"scrypt"}')
            cred.chmod(0o644)
            with self.assertRaises(PermissionError):
                servermod.credential_file(cred)
            cred.chmod(0o600)
            self.assertEqual(servermod.credential_file(cred), cred)
            link = parent / "alias.json"
            link.symlink_to(cred)
            with self.assertRaises(ValueError):
                servermod.credential_file(link)

    def test_clean_redacts(self):
        self.assertNotIn("abcdef",servermod.clean("Bearer abcdef"))
        self.assertIn("[REDACTED]", servermod.clean("api_key=abcdef"))

    def test_declarative_is_not_effective_access(self):
        info = servermod.collect("permissions")
        self.assertTrue(info["items"])
        self.assertTrue(all(i["state"] in ("DECLARED_ONLY","DISABLED") for i in info["items"]))
        self.assertNotIn("ALLOW",str(info))


class AdminHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.salt=b"0123456789abcdefghijklmn"
        cls.digest=hashlib.scrypt(b"correct-long-test-password", salt=cls.salt,n=16384,r=8,p=1,dklen=32)
        cls.server=servermod.AdminServer(("127.0.0.1",0),(cls.salt,cls.digest))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.port=cls.server.server_address[1]
        cls.auth="Basic "+base64.b64encode(b"admin:correct-long-test-password").decode()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def request(self, method, target, authorized=False, host=None):
        client=http.client.HTTPConnection("127.0.0.1",self.port,timeout=4)
        headers={"Host":host or f"127.0.0.1:{self.port}"}
        if authorized: headers["Authorization"]=self.auth
        try:
            client.request(method,target,headers=headers)
            resp=client.getresponse()
            data=resp.read()
            return resp.status,dict(resp.getheaders()),data
        finally:
            client.close()

    def test_http_authentication_and_static_security(self):
        status,headers,data=self.request("GET","/")
        self.assertEqual(status,401)
        self.assertIn("WWW-Authenticate",headers)
        status,headers,data=self.request("GET","/",authorized=True)
        self.assertEqual(status,200)
        self.assertIn(b"Agent Command",data)
        self.assertIn("default-src 'none'",headers["Content-Security-Policy"])
        self.assertEqual(headers["X-Frame-Options"],"DENY")
        self.assertEqual(headers["Cache-Control"],"no-store")

    def test_host_header_deny_and_no_actions(self):
        status,_,_=self.request("GET","/",authorized=True,host="attacker.com")
        self.assertEqual(status,400)
        status,_,_=self.request("POST","/api/requests",authorized=True)
        self.assertEqual(status,405)
        status,_,_=self.request("GET","/../etc/passwd",authorized=True)
        self.assertEqual(status,404)

    def test_authenticated_api_and_absent_dbs(self):
        status,_,data=self.request("GET","/api/permissions",authorized=True)
        self.assertEqual(status,200)
        info=json.loads(data)
        self.assertEqual(info["status"],"declarative")
        self.assertGreater(len(info["items"]),0)
        status,_,data=self.request("GET","/api/requests",authorized=True)
        self.assertEqual(status,200)
        self.assertEqual(json.loads(data)["items"],[])
        status,_,data=self.request("GET","/api/overview",authorized=True)
        self.assertFalse(json.loads(data)["execution"])

    def test_static_code_never_exposes_secret(self):
        for source in ("index.html","app.js","app.css"):
            status,_,data=self.request("GET","/"+source,authorized=True)
            self.assertEqual(status,200)
            self.assertGreater(len(data),500)


class ReadonlyDatabase(unittest.TestCase):
    def test_requests_read_only_and_bound(self):
        with tempfile.TemporaryDirectory() as temp:
            file=Path(temp)/"requests.sqlite"
            conn=sqlite3.connect(file)
            conn.execute("CREATE TABLE requests (id TEXT,created_at_utc TEXT,principal TEXT,action TEXT,resource TEXT,reason TEXT,risks TEXT,conditions TEXT,rollback TEXT,expires_at TEXT,max_uses INTEGER,status TEXT)")
            conn.execute("INSERT INTO requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                 ("req-001","2026-10-31T12:00:00Z","iatb-agent","debug.package.install",
                  "iatb-debug-online","Please inspect provider","Low risk","Verified","Rollback",
                  "2026-10-31T12:15:00Z",1,"PENDING"))
            conn.commit();conn.close()
            old=os.environ.get("IATB_ADMIN_REQUESTS_DB")
            os.environ["IATB_ADMIN_REQUESTS_DB"]=str(file)
            try:
                data=servermod.collect("requests")
                self.assertEqual(data["status"],"connected")
                self.assertEqual(data["items"][0]["status"],"PENDING")
                with sqlite3.connect(file) as db:
                    self.assertEqual(db.execute("SELECT count(*) FROM requests").fetchone()[0],1)
            finally:
                if old is None: os.environ.pop("IATB_ADMIN_REQUESTS_DB",None)
                else: os.environ["IATB_ADMIN_REQUESTS_DB"]=old


if __name__ == "__main__":
    unittest.main()
