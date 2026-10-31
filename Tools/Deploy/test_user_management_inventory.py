import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('user_management_inventory.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InventoryTests(unittest.TestCase):
    def fixture(self, root):
        (root / 'Database').mkdir()
        (root / 'Security').mkdir()
        for name in ('client_master.key', 'wallet_master.key'):
            key = root / 'Security' / name
            key.write_text('a' * 64)
            key.chmod(0o600)
        dbfile = root / 'Database/clients.sqlite'
        with sqlite3.connect(dbfile) as db:
            db.execute('CREATE TABLE clients (email TEXT)')
            db.execute('INSERT INTO clients VALUES (?)', ('PRIVATE_EMAIL',))
        dbfile.chmod(0o600)
        return dbfile

    def test_inventory_changes_no_bytes_or_files_and_exports_no_identity_or_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            before = {p.relative_to(root): p.read_bytes() for p in root.rglob('*') if p.is_file()}
            result = module.inventory(str(root))
            after = {p.relative_to(root): p.read_bytes() for p in root.rglob('*') if p.is_file()}
            self.assertEqual(before, after)
            self.assertTrue(result['readyForOperatorReview'])
            self.assertNotIn('PRIVATE_EMAIL', str(result))
            self.assertNotIn('a' * 64, str(result))

    def test_nonempty_wal_requires_checkpoint_instead_of_incomplete_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dbfile = self.fixture(root)
            Path(str(dbfile) + '-wal').write_bytes(b'not-checkpointed')
            result = module.inventory(str(root))
            self.assertFalse(result['readyForOperatorReview'])
            self.assertTrue(any('NONEMPTY_WAL' in x for x in result['issues']))

    def test_symlink_key_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            key = root / 'Security/client_master.key'
            key.rename(root / 'Security/original.key')
            key.symlink_to(root / 'Security/original.key')
            with self.assertRaises(ValueError):
                module.inventory(str(root))


if __name__ == '__main__':
    unittest.main()
