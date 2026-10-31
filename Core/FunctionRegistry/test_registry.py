"""Run from repository root: python3 -m unittest discover -s Core/FunctionRegistry -p 'test_*.py'"""
import importlib.util
import pathlib
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent

def load(path, name):
    spec=importlib.util.spec_from_file_location(name, path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

core=load(HERE/"manager.py","iatb_registry_core")
client=load(HERE.parent.parent/"Shared"/"FunctionRegistry"/"client.py","iatb_registry_client")

def example(risk="LOW", version=1):
    return {"engine":"Risk","function_id":"risk.analyse","risk":risk,
            "arguments":{"required":["symbol"]},"returns":{"allowed":"boolean"},"version":version}

class RegistryTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        root=pathlib.Path(self.temp.name)
        self.engine=client.EngineFunctionRegistry(root/"risk.db","Risk")
        self.manager=core.FunctionRegistryManager(root/"Core-Functions.db")
    def tearDown(self):
        self.manager.close(); self.engine.close(); self.temp.cleanup()
    def deliver(self, contracts):
        rev=self.engine.replace(contracts)
        for packet in self.engine.pending():
            result=self.manager.sync(**packet)
            self.assertEqual(result["status"],"APPLIED")
            self.engine.acknowledge(packet["revision"])
        return rev
    def test_denied_until_approved(self):
        self.deliver([example()])
        self.assertFalse(self.manager.authorized("IATB-AGT-0002","Risk","risk.analyse"))
        with self.assertRaises(PermissionError):
            self.manager.set_privilege("IATB-AGT-0002","Risk","risk.analyse","ALLOW","admin",approved=False)
        self.manager.set_privilege("IATB-AGT-0002","Risk","risk.analyse","ALLOW","admin",approved=True)
        self.assertTrue(self.manager.authorized("IATB-AGT-0002","Risk","risk.analyse"))
        self.assertFalse(self.manager.authorized("IATB-AGT-9999","Risk","risk.analyse"))
    def test_contract_change_revokes_and_stale_ignored(self):
        first=self.deliver([example()])
        self.manager.set_privilege("IATB-AGT-0002","Risk","risk.analyse","ALLOW","admin",approved=True)
        self.deliver([example(version=2)])
        self.assertFalse(self.manager.authorized("IATB-AGT-0002","Risk","risk.analyse"))
        self.assertEqual(self.manager.sync("Risk",first,[example()])["status"],"STALE")
    def test_remove_function_with_previous_grant(self):
        self.deliver([example()])
        self.manager.set_privilege("IATB-AGT-0002","Risk","risk.analyse","ALLOW","admin",approved=True)
        self.deliver([])
        self.assertEqual(self.manager.view("IATB-AGT-0002")["functions"],[])
    def test_risky_grant_blocked(self):
        self.deliver([example(risk="CRITICAL")])
        with self.assertRaises(PermissionError):
            self.manager.set_privilege("IATB-AGT-0002","Risk","risk.analyse","ALLOW","admin",approved=True)

if __name__=="__main__":
    unittest.main()
