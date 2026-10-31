"""v1.1: real HTTP boundary and journal provenance, no external services."""
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
from unittest.mock import patch

AGENT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('admin11', AGENT/'AdminPanel/server.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Boundary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        salt=b'0123456789abcdefghijklmn'
        digest=hashlib.scrypt(b'unit-test-only-password',salt=salt,n=16384,r=8,p=1,dklen=32)
        cls.srv=m.AdminServer(('127.0.0.1',0),(salt,digest))
        cls.thread=threading.Thread(target=cls.srv.serve_forever,daemon=True)
        cls.thread.start()
        cls.port=cls.srv.server_port
        cls.auth='Basic '+base64.b64encode(b'admin:unit-test-only-password').decode()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown();cls.srv.server_close();cls.thread.join()

    def get(self,path,extra=None):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=3)
        c.request('GET',path,headers={'Authorization':self.auth,**(extra or {})})
        r=c.getresponse();body=r.read();c.close()
        return r.status,body

    def test_proxy_identity_cannot_override_admin(self):
        for header in ('Forwarded','X-Forwarded-Host','X-Forwarded-For','X-Forwarded-Proto','X-Remote-User'):
            with self.subTest(header=header):
                self.assertEqual(self.get('/api/permissions',{header:'admin'})[0],400)

    def test_injections_and_traversals_have_no_route(self):
        for path in ('/api/soul?file=../../etc/passwd','/%2e%2e/etc/passwd','/api/ssh?cmd=id',
                     '/api/permissions?role=admin','/api/soul/identity.md','/api/memory?sql=DROP%20TABLE'):
            self.assertEqual(self.get(path)[0],404,path)

    def test_dashboard_connections_are_observations_not_remote_health(self):
        for section in ('dashboard','connections'):
            status,body=self.get('/api/'+section)
            self.assertEqual(status,200)
            data=json.loads(body)
            self.assertEqual(data['status'],'local_observation')
            self.assertTrue(all(x['state'] not in ('SUCCESS','CONNECTED','ONLINE') for x in data['items']))

    def test_no_public_bind_even_using_class_directly(self):
        with self.assertRaises(ValueError):
            m.AdminServer(('0.0.0.0',0),(b'',b''))

    def test_duplicate_host_is_rejected(self):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=3)
        c.putrequest('GET','/healthz',skip_host=True)
        c.putheader('Host',f'127.0.0.1:{self.port}')
        c.putheader('Host','attacker.invalid');c.endheaders()
        r=c.getresponse();r.read();c.close()
        self.assertEqual(r.status,400)

class Journal(unittest.TestCase):
    def test_audit_metadata_and_success_not_inferred_from_allow(self):
        with tempfile.TemporaryDirectory() as temp:
            db=Path(temp)/'audit.db'
            with sqlite3.connect(db) as c:
                c.executescript((AGENT/'Audit/schema.sql').read_text())
                c.execute('INSERT INTO audit_events(principal,action,resource,policy_version,decision,request_id,commit_sha,exit_code,execution_duration_ms,result) VALUES (?,?,?,?,?,?,?,?,?,?)',
                          ('iatb-agent','debug.status','iatb-debug-online','v1','ALLOW','req-test','a'*40,0,12,'intent only'))
            with patch.dict(os.environ,{'IATB_ADMIN_AUDIT_DB':str(db)},clear=True):
                event=m.collect_journal()['items'][0]
            self.assertEqual(event['status'],'VALIDATED')
            self.assertEqual(event['correlation_id'],'req-test')
            self.assertEqual(event['commit_sha'],'a'*40)
            self.assertEqual(event['exit_code'],'0')
            self.assertEqual(event['execution_duration_ms'],'12')
            with sqlite3.connect(db) as c:
                with self.assertRaises(sqlite3.IntegrityError):c.execute('DELETE FROM audit_events')

    def test_broken_source_does_not_look_healthy(self):
        with patch.dict(os.environ,{'IATB_ADMIN_AUDIT_DB':'/missing/audit.db'},clear=True):
            self.assertEqual(m.collect_journal()['status'],'unavailable')

    def test_json_secrets_and_common_tokens_redacted(self):
        for value in ('{"password":"do-not-publish"}','{"api_key": "do-not-publish"}', 'ghp_'+'a'*36):
            self.assertNotIn('do-not-publish',m.clean(value))
            self.assertNotIn('a'*36,m.clean(value))

    def test_soul_symlink_not_exposed(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'Soul').mkdir()
            target=root/'private';target.write_text('private data')
            (root/'Soul/identity.md').symlink_to(target)
            with patch.object(m,'AGENT',root):self.assertEqual(m.collect_soul()['items'],[])

if __name__=='__main__':unittest.main()
