"""Local binary selection and official archive verification, without network."""
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import install_rclone
import manage_photos


class InstallTests(unittest.TestCase):
    def test_local_executable_is_preferred_with_system_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch.object(manage_photos, 'PROJECT_ROOT', root):
                self.assertEqual(manage_photos.rclone_executable(), 'rclone')
                exe = root / '.tools/rclone' / ('rclone.exe' if os.name == 'nt' else 'rclone')
                exe.parent.mkdir(parents=True)
                exe.write_bytes(b'local executable')
                self.assertEqual(manage_photos.rclone_executable(), str(exe))

    def test_verified_archive_only(self):
        stem = 'rclone-v1.75.1-linux-amd64'
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr(stem + '/rclone', b'executable fixture')
        data = buffer.getvalue()
        for valid in (False, True):
            with tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                digest = hashlib.sha256(data).hexdigest() if valid else '0' * 64
                def download(url, **kwargs):
                    self.assertTrue(url.startswith('https://downloads.rclone.org/v1.75.1/'))
                    return io.BytesIO((digest + '  ' + stem + '.zip\n').encode() if url.endswith('SHA256SUMS') else data)
                with patch.object(sys, 'argv', ['install']), patch.object(install_rclone, '__file__', str(root / 'scripts/install_rclone.py')):
                    with patch.object(install_rclone.platform, 'system', return_value='Linux'), patch.object(install_rclone.platform, 'machine', return_value='x86_64'):
                        with patch.object(install_rclone, 'urlopen', side_effect=download):
                            if not valid:
                                with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
                                    install_rclone.main()
                                self.assertFalse((root / '.tools').exists())
                            else:
                                install_rclone.main()
                                self.assertEqual((root / '.tools/rclone/rclone').read_bytes(), b'executable fixture')
                                info=json.loads((root / '.tools/rclone/installation.json').read_text())
                                self.assertEqual(info['archive_sha256'], digest)


if __name__ == '__main__':
    unittest.main()
