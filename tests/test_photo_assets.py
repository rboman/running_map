"""Regression tests for photo/source identity and publication safety."""
import argparse
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import import_adeps_folder as importer
import manage_photos
from photo_assets import (
    CACHE_PATH, MANIFEST_PATH, PhotoCache, digest_file,
    validate_manifest, write_manifest,
)


class PhotoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.course = self.root / 'source'
        self.sources = self.course / 'photos'
        self.sources.mkdir(parents=True)
        self.output = self.root / 'output'
        self.args = argparse.Namespace(
            with_photos=True, photo_thumb_size=18, photo_web_size=80,
            photo_quality=75, force_photos=False, dry_run=False,
            photo_cache=PhotoCache(self.output),
        )

    def source(self, name='b.jpg', color='red', gps=None, orientation=1):
        path = self.sources / name
        exif = Image.Exif()
        exif[274] = orientation
        if gps is not None:
            exif[34853] = {1: 'N', 2: (gps, 0, 0), 3: 'E', 4: (5, 0, 0)}
        image = Image.new('RGB', (120, 60), color)
        image.save(path, exif=exif)
        return path

    def build(self, path):
        warnings = []
        result = importer.build_photo_metadata(path, 'test-run', self.args, self.output, warnings)
        self.assertEqual(warnings, [])
        self.assertIsNotNone(result)
        return result

    def import_folder(self):
        warnings = []
        photos, _ = importer.import_run_photos(
            self.course, {'id': 'test-run'}, self.args, self.output, warnings,
        )
        self.assertEqual(warnings, [])
        return photos

    def manifest(self, photos):
        run = dict(id='test-run', title='Test', date='2026-09-20', distanceKm=1,
                   elevationGainM=1, color='#000', trackRef='test-run', photos=photos)
        importer.write_generated_files(self.output, {}, [run], True)
        write_manifest(self.output, [run], True, [])
        return validate_manifest(self.output)

    def test_add_remove_rename_preserves_identity(self):
        original = self.source(gps=50)
        first = self.import_folder()[0]
        added = self.source('a.jpg', 'blue')
        later = self.import_folder()
        self.assertEqual(later[1], first)
        added.unlink()
        renamed = original.rename(self.sources / 'z.jpg')
        after = self.build(renamed)
        for key in ('thumb', 'web', 'lat', 'lon'):
            self.assertEqual(first[key], after[key])
        self.assertEqual(after['source'], 'z.jpg')

    def test_changed_image_gets_new_urls(self):
        path = self.source()
        before = self.build(path)
        self.source(color='blue')
        after = self.build(path)
        self.assertNotEqual(before['web'], after['web'])
        self.assertTrue((self.output / before['web']).exists())

    def test_gps_is_read_from_current_source(self):
        path = self.source(gps=50)
        self.assertEqual(self.build(path)['lat'], 50)
        self.source(gps=51)
        self.assertEqual(self.build(path)['lat'], 51)
        self.source(gps=None)
        result = self.build(path)
        self.assertNotIn('lat', result)
        self.assertNotIn('lon', result)

    def test_orientation_and_parameters(self):
        path = self.source(orientation=6)
        before = self.build(path)
        self.assertEqual((before['webWidth'], before['webHeight']), (40, 80))
        self.args.photo_web_size = 40
        after = self.build(path)
        self.assertEqual((after['webWidth'], after['webHeight']), (20, 40))
        self.assertNotEqual(before['web'], after['web'])

    def test_second_import_reuses_verified_cache_after_restart(self):
        path = self.source()
        before = self.build(path)
        self.args.photo_cache.save()
        self.args.photo_cache = PhotoCache(self.output)
        with patch.object(importer, 'save_resized_jpeg', side_effect=AssertionError('Unexpected encoding')):
            self.assertEqual(self.build(path), before)
        self.assertEqual(self.args.photo_cache.reused, 1)

    def test_missing_corrupt_or_invalid_cache_rebuilds(self):
        path = self.source()
        before = self.build(path)
        for contents in ('not JSON', '{"version": 1, "entries": []}', '{"version": 1, "entries": {}}'):
            cache = self.output / CACHE_PATH
            cache.parent.mkdir(exist_ok=True)
            cache.write_text(contents)
            self.args.photo_cache = PhotoCache(self.output)
            self.assertEqual(self.build(path), before)
            self.assertEqual(self.args.photo_cache.generated, 1)

    def test_missing_or_corrupt_output_is_repaired(self):
        path = self.source()
        before = self.build(path)
        web = self.output / before['web']
        expected = digest_file(web)
        web.unlink()
        self.assertEqual(self.build(path), before)
        web.write_bytes(b'broken')
        self.assertEqual(self.build(path), before)
        self.assertEqual(digest_file(web), expected)

    def test_force_photos_reencodes(self):
        path = self.source()
        before = self.build(path)
        self.args.force_photos = True
        with patch.object(importer, 'save_resized_jpeg', wraps=importer.save_resized_jpeg) as save:
            self.assertEqual(self.build(path), before)
            save.assert_called_once()

    def test_dry_run_creates_no_output(self):
        path = self.source()
        self.args.dry_run = True
        self.build(path)
        self.assertFalse(self.output.exists())

    def test_cli_dry_run_does_not_write_cache_or_manifest(self):
        self.source(gps=50)
        course = self.course.rename(self.root / '2026-09-20 - Test')
        (course / 'track.gpx').write_text(
            '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">'
            '<trk><trkseg><trkpt lat="50" lon="5"><ele>10</ele></trkpt>'
            '<trkpt lat="50.01" lon="5.01"><ele>20</ele></trkpt></trkseg></trk></gpx>'
        )
        argv = ['import', str(self.root), '--output', str(self.output), '--photos', '--dry-run']
        with patch.object(sys, 'argv', argv), redirect_stdout(io.StringIO()):
            importer.main()
        self.assertFalse(self.output.exists())

    def test_case_tie_has_deterministic_order(self):
        self.source('a.jpg', 'red')
        self.source('A.jpg', 'blue')
        # This pair can coexist on Linux; the importer also works on Windows.
        if len(list(self.sources.iterdir())) != 2:
            self.skipTest('Case-insensitive filesystem')
        self.assertEqual([p['source'] for p in self.import_folder()], ['A.jpg', 'a.jpg'])

    def test_video_is_not_a_photo_error(self):
        self.source()
        (self.sources / 'clip.mp4').write_bytes(b'video')
        self.assertEqual(len(self.import_folder()), 1)

    def test_manifest_rejects_changed_data_and_tampered_photo(self):
        photo = self.build(self.source())
        self.manifest([photo])
        runs = self.output / 'data/generated-runs.js'
        original = runs.read_bytes()
        runs.write_bytes(original + b'\n')
        with self.assertRaisesRegex(RuntimeError, 'Stale manifest'):
            validate_manifest(self.output)
        runs.write_bytes(original)
        (self.output / photo['thumb']).write_bytes(b'broken')
        with self.assertRaisesRegex(RuntimeError, 'integrity'):
            validate_manifest(self.output)

    def test_manifest_rejects_partial_import_and_missing_references(self):
        photo = self.build(self.source())
        manifest = self.manifest([photo])
        path = self.output / MANIFEST_PATH
        manifest['publishable'] = False
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(RuntimeError, 'full import'):
            validate_manifest(self.output)
        manifest['publishable'] = True
        manifest['files'].pop(next(iter(manifest['files'])))
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(RuntimeError, 'references'):
            validate_manifest(self.output)

    def test_cleanup_refuses_unpublished_data(self):
        with patch.object(manage_photos, 'verify_public', side_effect=RuntimeError('not published')):
            with patch.object(manage_photos, 'rclone') as remote:
                with self.assertRaisesRegex(RuntimeError, 'not published'):
                    manage_photos.cleanup(self.output, 'r2:bucket', 'https://example.com', {}, 'list', self.root, False)
                remote.assert_not_called()

    def test_cleanup_dry_run_never_copies_or_deletes(self):
        manifest = {'files': {'photos/generated/run/current.jpg': 'hash'}}
        with patch.object(manage_photos, 'verify_public'), patch.object(manage_photos, 'verify_remote'):
            with patch.object(manage_photos, 'rclone', return_value='[{"Path":"run/old.jpg"}]') as remote:
                manage_photos.cleanup(self.output, 'r2:bucket', 'https://example.com', manifest, 'list', self.root, True)
                self.assertEqual([call.args[0] for call in remote.call_args_list], ['lsjson'])
                self.assertFalse((self.output / 'backups').exists())

    def test_cleanup_checks_backup_before_delete(self):
        manifest = {'data': {}, 'files': {'photos/generated/run/current.jpg': 'hash'}}
        operations = []
        def fake_rclone(*args, **kwargs):
            operations.append(args[0])
            if args[0] == 'check':
                raise RuntimeError('Backup mismatch')
        with patch.object(manage_photos, 'verify_public'), patch.object(manage_photos, 'verify_remote'):
            with patch.object(manage_photos, 'obsolete_photos', return_value=['run/old.jpg']):
                with patch.object(manage_photos, 'rclone', side_effect=fake_rclone):
                    with self.assertRaisesRegex(RuntimeError, 'Backup mismatch'):
                        manage_photos.cleanup(self.output, 'r2:bucket', 'https://example.com', manifest, 'list', self.root, False)
        self.assertEqual(operations, ['copy', 'check'])

    def test_cleanup_only_deletes_the_verified_inventory(self):
        manifest = {'data': {}, 'files': {'photos/generated/run/current.jpg': 'hash'}}
        operations = []
        def fake_rclone(*args, **kwargs):
            operations.append(args[0])
            if args[0] == 'delete':
                self.assertEqual(args[1], 'r2:bucket/photos/generated')
                self.assertEqual(Path(args[3]).read_text(), 'run/old.jpg\n')
        with patch.object(manage_photos, 'verify_public'), patch.object(manage_photos, 'verify_remote'):
            with patch.object(manage_photos, 'obsolete_photos', side_effect=[['run/old.jpg'], []]):
                with patch.object(manage_photos, 'validate_manifest', return_value=manifest):
                    with patch.object(manage_photos, 'rclone', side_effect=fake_rclone):
                        manage_photos.cleanup(self.output, 'r2:bucket', 'https://example.com', manifest, 'list', self.root, False)
        self.assertEqual(operations, ['copy', 'check', 'delete'])
        self.assertEqual(len(list((self.output / 'backups').glob('*/cleanup.json'))), 1)

    def test_public_check_accepts_windows_line_endings(self):
        for path in manage_photos.PUBLIC_FILES:
            target = self.output / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'line one\r\nline two\r\n')
        with patch.object(manage_photos, 'public_bytes', return_value=b'line one\nline two\n'):
            manage_photos.verify_public(self.output, 'https://example.com')

    def test_copy_requires_download_verification_unless_dry_run(self):
        manifest = {'files': {'photos/generated/run/photo.jpg': 'hash'}}
        for dry_run in (False, True):
            argv = ['manage', 'copy', '--root', str(self.output)]
            if dry_run:
                argv.append('--dry-run')
            with patch.object(sys, 'argv', argv), patch.object(manage_photos, 'validate_manifest', return_value=manifest):
                with patch.object(manage_photos, 'rclone') as remote:
                    manage_photos.main()
                    calls = remote.call_args_list
                    self.assertEqual([call.args[0] for call in calls], ['copy'] if dry_run else ['copy', 'check'])
                    self.assertIn('--s3-no-head', calls[0].args)
                    if not dry_run:
                        self.assertIn('--download', calls[1].args)

    def test_remote_paths_cannot_escape_generated_folder(self):
        for name in ('../other.jpg', '/other.jpg', 'run/../../other', 'run/a\nb', 'run\\a', 'run/./a'):
            with self.assertRaises(RuntimeError):
                manage_photos.safe_remote_name(name)


if __name__ == '__main__':
    unittest.main()
