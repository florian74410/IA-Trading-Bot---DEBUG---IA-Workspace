import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('gen1_chart_inventory.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class InventoryTests(unittest.TestCase):
    def sample(self, project):
        return {'Id': 'container-fixture', 'Name': '/' + project + '-ui-1',
                'Image': 'sha256:fixture-only', 'State': {'Running': True},
                'Config': {'Image': 'iatb:fixture', 'User': '1001:1001',
                           'Env': ['API_KEY=DO_NOT_EXPORT', 'PASSWORD=DO_NOT_EXPORT',
                                   'IATB_RUNTIME_ROOT=/iatb/debug/runtime', 'IATB_TRADING_LIVE=0'],
                           'Labels': {'com.docker.compose.project': project,
                                      'com.docker.compose.service': 'ui'}},
                'HostConfig': {'NetworkMode': 'container:fixture-router', 'PortBindings': {}},
                'Mounts': [{'Type': 'bind', 'Source': '/fixture/runtime',
                            'Destination': '/iatb/debug/runtime', 'RW': True}]}
    def test_image_and_socket_and_no_secrets(self):
        result = module.summarize([self.sample('iatb-debug-fixture')])
        row = result['containers'][0]
        self.assertEqual(row['immutableImageId'], 'sha256:fixture-only')
        self.assertEqual(row['expectedHostSocket'], '/fixture/runtime/ssh-ui.sock')
        self.assertNotIn('DO_NOT_EXPORT', str(result))
        self.assertTrue(result['readOnly'])
    def test_cross_stack_writers_are_reported(self):
        result = module.summarize([self.sample('iatb-debug-fixture'), self.sample('iatb-release-fixture')])
        self.assertEqual(len(result['writableMountsSharedAcrossProjects']), 1)
    def test_unrelated_containers_are_omitted(self):
        self.assertEqual(module.summarize([self.sample('unrelated')])['containers'], [])

if __name__ == '__main__':
    unittest.main()
