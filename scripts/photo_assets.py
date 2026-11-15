"""Local integrity helpers for immutable, generated photo assets."""

import hashlib
import json
import os
import re
import tempfile
from pathlib import Path, PurePosixPath


CACHE_PATH = Path(".cache/photo-import.json")
MANIFEST_PATH = Path(".cache/photo-manifest.json")
DATA_PATHS = ("data/generated-runs.js", "tracks/generated-tracks.js")
PHOTO_PATTERN = re.compile(
    r"photos/generated/[^/\\]+/photo-([0-9a-f]{64})-(thumb|web)\.jpg"
)


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()


def digest_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            output.write(data)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def write_json(path, value):
    atomic_write(path, (json.dumps(value, sort_keys=True, indent=2) + "\n").encode("utf-8"))


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def photo_digest(path):
    match = PHOTO_PATTERN.fullmatch(path)
    if not match or ".." in PurePosixPath(path).parts:
        raise ValueError("Invalid generated photo path: {}".format(path))
    return match.group(1)


class PhotoCache:
    def __init__(self, root):
        self.root = Path(root)
        saved = read_json(self.root / CACHE_PATH)
        self.entries = saved.get("entries", {}) if isinstance(saved, dict) and saved.get("version") == 1 else {}
        if not isinstance(self.entries, dict):
            self.entries = {}
        self.reused = 0
        self.generated = 0

    def get(self, key, run_id, image_module):
        entry = self.entries.get(key)
        try:
            for variant in ("thumb", "web"):
                item = entry[variant]
                relative = "photos/generated/{}/{}".format(run_id, item["name"])
                expected = photo_digest(relative)
                if not item["name"].endswith("-{}.jpg".format(variant)):
                    return None
                path = self.root / relative
                if digest_file(path) != expected:
                    return None
                with image_module.open(path) as image:
                    if list(image.size) != item["size"]:
                        return None
        except (KeyError, TypeError, ValueError, OSError):
            return None
        self.reused += 1
        return entry

    def save(self):
        write_json(self.root / CACHE_PATH, {"version": 1, "entries": self.entries})


def write_manifest(root, runs, publishable, warnings):
    root = Path(root)
    files = {}
    for run in runs:
        for photo in run["photos"]:
            for variant in ("thumb", "web"):
                path = photo[variant].removeprefix("./")
                expected = photo_digest(path)
                if digest_file(root / path) != expected:
                    raise RuntimeError("Photo integrity check failed: {}".format(path))
                files[path] = expected
    write_json(root / MANIFEST_PATH, {
        "version": 1,
        "publishable": publishable,
        "warnings": warnings,
        "data": {path: digest_file(root / path) for path in DATA_PATHS},
        "files": files,
    })


def validate_manifest(root):
    root = Path(root)
    manifest = read_json(root / MANIFEST_PATH)
    if not isinstance(manifest, dict) or manifest.get("version") != 1:
        raise RuntimeError("Missing or invalid photo manifest. Run a full import with --photos.")
    if manifest.get("publishable") is not True:
        raise RuntimeError("Publication requires a full import with --photos, without warnings or skipped folders.")
    try:
        if set(manifest["data"]) != set(DATA_PATHS):
            raise ValueError("Unexpected data files")
        for path in DATA_PATHS:
            if digest_file(root / path) != manifest["data"][path]:
                raise ValueError("Stale manifest: {} changed; import again".format(path))
        text = (root / DATA_PATHS[0]).read_text(encoding="utf-8")
        references = set(re.findall(r'(?:thumb|web): "\./(photos/generated/[^"\n]+)"', text))
        if not references or references != set(manifest["files"]):
            raise ValueError("Manifest does not match the photo references")
        for path, expected in manifest["files"].items():
            if photo_digest(path) != expected or digest_file(root / path) != expected:
                raise ValueError("Photo integrity check failed: {}".format(path))
    except (KeyError, TypeError, AttributeError, ValueError, OSError) as exc:
        raise RuntimeError("Invalid photo manifest: {}".format(exc)) from exc
    return manifest
