"""Phase 3 security contract: password-only HTTPS-session, read-only API."""
from __future__ import annotations

import hashlib
import http.client
import importlib.util
import json
from pathlib import Path
import secrets
import sys
import tempfile
import threading
import unittest
from urllib.parse import urlencode

PANEL = Path(__file__).resolve().parents[1] / "AdminPanel"
sys.path.insert(0, str(PANEL))
import public_server as public
import server as core

class Phase3Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.private = Path(cls.temp.name) / "private"
        cls.private.mkdir(mode=0o700)
        cls.cred = cls.private / "credentials.json"
        salt = secrets.token_bytes(24)
        digest = hashlib.scrypt(b"phase3-test-password-123456", salt=salt, n=16384, r=8, p=1, dklen=32)
        cls.cred.write_text(json.dumps({"algorithm":"scrypt","salt":salt.hex(),"digest":digest.hex()}))
        cls.cred.chmod(0o600)
        cls.server = public.PublicServer(0,cls.cred)
        cls.thread = threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=4)
        cls.temp.cleanup()

    def req(self,method,path,body=None,headers=None):
        conn=http.client.HTTPConnection("127.0.0.1",self.server.server_port,timeout=5)
        headers={"Host":public.HOST,**(headers or {})}
        conn.request(method,path,body,headers)
        response=conn.getresponse()
        status=response.status
        content=response.read()
        head=dict(response.getheaders())
        conn.close()
        return status,content,head

    def login(self,password="phase3-test-password-123456",origin=True):
        payload=urlencode({"username":"admin","password":password})
        headers={"Content-Type":"application/x-www-form-urlencoded"}
        if origin:
            headers["Origin"]=public.ORIGIN
        return self.req("POST","/login",payload,headers)

    def test_host_and_https_origin_protection(self):
        status,_,_=self.req("GET","/",headers={"Host":"attacker.invalid"})
        self.assertEqual(status,400)
        status,_,_=self.req("GET","/api/overview")
        self.assertEqual(status,401)
        status,_,_=self.login(origin=False)
        self.assertEqual(status,403)
        status,_,_=self.req("POST","/api/requests","a=1",{"Origin":public.ORIGIN,
                     "Content-Type":"application/x-www-form-urlencoded"})
        self.assertEqual(status,405)
        status,_,_=self.req("GET","/api/../credentials.json")
        self.assertEqual(status,401)

    def test_password_login_and_secure_cookie(self):
        status,_,_=self.login("wrong-password")
        self.assertEqual(status,401)
        status,_,headers=self.login()
        self.assertEqual(status,303)
        token=headers.get("Set-Cookie","")
        self.assertIn("__Host-iatb_admin=",token)
        self.assertIn("HttpOnly",token)
        self.assertIn("Secure",token)
        self.assertIn("SameSite=Strict",token)
        cookie=token.split(";",1)[0]
        status,body,_=self.req("GET","/api/overview",headers={"Cookie":cookie})
        self.assertEqual(status,200)
        payload=json.loads(body)
        self.assertFalse(payload["execution"])
        self.assertEqual(payload["mode"],"password_read_only")
        self.assertEqual(self.req("PUT","/api/requests",headers={"Cookie":cookie})[0],405)
        self.assertEqual(self.req("GET","/login",headers={"Cookie":cookie})[0],303)
        # Same valid password may create an independent session without OTP.
        self.assertEqual(self.login()[0],303)

    def test_anonymous_requests_and_form_strictness(self):
        self.assertEqual(self.req("GET","/login")[0],200)
        self.assertEqual(self.req("GET","/")[0],303)
        self.assertEqual(self.req("GET","/api/memory")[0],401)
        self.assertEqual(self.req("GET","/api/overview",headers={"Host":"evil.example"})[0],400)
        status,_,_=self.req("POST","/login",urlencode({"username":"admin","password":"phase3-test-password-123456","totp":"123456"}),{"Origin":public.ORIGIN,"Content-Type":"application/x-www-form-urlencoded"})
        self.assertEqual(status,400)

if __name__=="__main__":
    unittest.main()
