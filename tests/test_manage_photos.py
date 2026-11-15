"""Remote integrity checks use temporary files and never contact real R2 objects."""
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import manage_photos


class RemoteVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file_list = self.root / 'current.txt'
        self.items = []
        for name, contents in [('run/a.jpg', b'first image'), ('run/b.jpg', b'second image')]:
            path = self.root / 'photos/generated' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)
            self.items.append(dict(Path=name, Size=len(contents), IsDir=False,
                                   Hashes={'md5': hashlib.md5(contents, usedforsecurity=False).hexdigest()}))
        manage_photos.write_list(self.file_list, [item['Path'] for item in self.items])

    def verify(self, **kwargs):
        manage_photos.verify_remote(self.root, 'r2:bucket', self.file_list, **kwargs)

    def test_matching_hashes_never_download_even_on_second_run(self):
        self.items[0]['Hashes']['md5'] = self.items[0]['Hashes']['md5'].upper()
        with patch.object(manage_photos, 'rclone', return_value=json.dumps(self.items)) as remote:
            self.verify()
            self.verify()
        self.assertEqual([call.args[0] for call in remote.call_args_list], ['lsjson', 'lsjson'])
        for call in remote.call_args_list:
            self.assertIn('--files-from-raw', call.args)
            self.assertIn('--hash-type', call.args)
            self.assertIn('--no-modtime', call.args)
            self.assertIn('--no-mimetype', call.args)
            self.assertTrue(call.kwargs['capture'])
        self.assertFalse((self.root / 'download.txt').exists())

    def test_legacy_uppercase_hash_key_is_also_accepted(self):
        # Current rclone uses hash.Type.String() ("md5"); older output uses "MD5".
        for item in self.items:
            item['Hashes'] = {'MD5': item['Hashes']['md5']}
        with patch.object(manage_photos, 'rclone', return_value=json.dumps(self.items)) as remote:
            self.verify()
        remote.assert_called_once()
        self.assertEqual(remote.call_args.args[0], 'lsjson')

    def test_only_images_without_usable_md5_are_downloaded(self):
        for hashes in (None, {}, {'md5': ''}, {'md5': 'a' * 32 + '-2'}, {'md5': 'invalid'}):
            with self.subTest(hashes=hashes):
                self.items[1]['Hashes'] = hashes
                def fake_rclone(*args, **kwargs):
                    if args[0] == 'lsjson':
                        return json.dumps(self.items)
                    self.assertEqual(args[0], 'check')
                    self.assertIn('--download', args)
                    self.assertIn('--one-way', args)
                    subset = Path(args[args.index('--files-from-raw') + 1])
                    self.assertEqual(subset.read_text(), 'run/b.jpg\n')
                with patch.object(manage_photos, 'rclone', side_effect=fake_rclone) as remote:
                    self.verify()
                self.assertEqual([call.args[0] for call in remote.call_args_list], ['lsjson', 'check'])

    def test_every_missing_hash_requires_download(self):
        for item in self.items:
            del item['Hashes']
        with patch.object(manage_photos, 'rclone', side_effect=[json.dumps(self.items), None]):
            self.verify()
        self.assertEqual((self.root / 'download.txt').read_text(), self.file_list.read_text())

    def test_missing_size_changed_size_or_changed_hash_fail_without_fallback(self):
        for field, value, message in [('Hashes', {'md5': '0' * 32}, 'checksum mismatch'),
                                       ('Size', 999, 'size mismatch'),
                                       ('Size', None, 'Invalid remote'),
                                       ('IsDir', True, 'Invalid remote')]:
            with self.subTest(field=field):
                items = json.loads(json.dumps(self.items))
                items[0][field] = value
                with patch.object(manage_photos, 'rclone', return_value=json.dumps(items)) as remote:
                    with self.assertRaisesRegex(RuntimeError, message):
                        self.verify()
                    self.assertEqual(remote.call_count, 1)

    def test_missing_duplicate_unsafe_or_invalid_inventory_fails(self):
        for listing in (self.items[:1], self.items + self.items[:1], {}, [None],
                        [dict(Path='../outside.jpg')]):
            with self.subTest(listing=listing):
                with patch.object(manage_photos, 'rclone', return_value=json.dumps(listing)) as remote:
                    with self.assertRaises(RuntimeError):
                        self.verify()
                    self.assertEqual(remote.call_count, 1)

    def test_listing_failure_is_not_silently_replaced_with_download(self):
        with patch.object(manage_photos, 'rclone', side_effect=subprocess.CalledProcessError(1, 'lsjson')) as remote:
            with self.assertRaises(subprocess.CalledProcessError):
                self.verify()
            self.assertEqual(remote.call_count, 1)

    def test_failed_download_is_not_reported_as_verified(self):
        self.items[0]['Hashes'] = {}
        output = io.StringIO()
        with patch.object(manage_photos, 'rclone', side_effect=[json.dumps(self.items),
                          subprocess.CalledProcessError(1, 'check')]):
            with redirect_stdout(output), self.assertRaises(subprocess.CalledProcessError):
                self.verify()
        self.assertNotIn('Remote images verified:', output.getvalue())

    def test_explicit_audit_downloads_all_without_listing(self):
        manifest = {'files': {'photos/generated/' + item['Path']: 'hash' for item in self.items}}
        argv = ['manage', 'verify-remote', '--root', str(self.root), '--download']
        with patch.object(sys, 'argv', argv), patch.object(manage_photos, 'validate_manifest', return_value=manifest):
            with patch.object(manage_photos, 'rclone') as remote:
                manage_photos.main()
        remote.assert_called_once()
        self.assertEqual(remote.call_args.args[0], 'check')
        self.assertIn('--download', remote.call_args.args)

    def test_unsafe_input_list_is_rejected_before_remote_access(self):
        self.file_list.write_text('../outside.jpg\n')
        with patch.object(manage_photos, 'rclone') as remote:
            with self.assertRaises(RuntimeError):
                self.verify()
            remote.assert_not_called()


if __name__ == '__main__':
    unittest.main()
