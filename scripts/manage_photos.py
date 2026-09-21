#!/usr/bin/env python3
"""Verify, publish and explicitly clean generated photos using rclone."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tempfile
from urllib.request import Request, urlopen

from photo_assets import DATA_PATHS, digest_bytes, validate_manifest, write_json


PUBLIC_FILES = DATA_PATHS + ("app.js", "config/site-config.js", "index.html", "style.css")
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def rclone_executable():
    name = "rclone.exe" if os.name == "nt" else "rclone"
    local = PROJECT_ROOT / ".tools/rclone" / name
    return str(local) if local.is_file() else "rclone"


def rclone(*arguments, capture=False):
    result = subprocess.run(
        # R2 configuration: private ACL and an already existing bucket.
        [rclone_executable(), *map(str, arguments), "--s3-acl", "private", "--s3-no-check-bucket"], check=True,
        stdout=subprocess.PIPE if capture else None,
        text=True,
    )
    return result.stdout


def remote_path(remote):
    return remote.rstrip("/") + "/photos/generated"


def relative_photos(manifest):
    return sorted(path.removeprefix("photos/generated/") for path in manifest["files"])


def write_list(path, names):
    Path(path).write_text("".join(name + "\n" for name in names), encoding="utf-8")


def public_bytes(base, path):
    request = Request(base.rstrip("/") + "/" + path, headers={"Cache-Control": "no-cache"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def verify_public(root, site_url):
    for path in PUBLIC_FILES:
        # Git may convert text line endings on Windows; that is not a different site.
        remote = public_bytes(site_url, path).replace(b"\r\n", b"\n")
        local = (root / path).read_bytes().replace(b"\r\n", b"\n")
        if digest_bytes(remote) != digest_bytes(local):
            raise RuntimeError("The published site differs from the local version: {}".format(path))
    print("Published site matches local data, application and configuration.", flush=True)


def verify_remote(root, remote, file_list):
    rclone("check", root / "photos/generated", remote_path(remote),
           "--files-from-raw", file_list, "--download", "--one-way")


def safe_remote_name(name):
    # Explicit file lists must not contain traversal, absolute paths or newlines.
    parts = PurePosixPath(name).parts
    if (not name or name.startswith("/") or "\\" in name
            or any(char in name for char in "\r\n\0")
            or any(part in (".", "..") for part in parts)
            or str(PurePosixPath(name)) != name):
        raise RuntimeError("Unsafe remote path: {!r}".format(name))
    return name


def obsolete_photos(remote, current):
    listing = json.loads(rclone("lsjson", remote_path(remote), "--recursive", "--files-only", capture=True))
    return sorted(safe_remote_name(item["Path"]) for item in listing if item["Path"] not in current)


def cleanup(root, remote, site_url, manifest, current_list, workdir, dry_run):
    # Old references must no longer be the ones served by the published site.
    verify_public(root, site_url)
    verify_remote(root, remote, current_list)
    obsolete = obsolete_photos(remote, set(relative_photos(manifest)))
    print("Obsolete objects in photos/generated/: {}".format(len(obsolete)), flush=True)
    for name in obsolete:
        print("  " + name)
    if dry_run or not obsolete:
        print("No remote files deleted.", flush=True)
        return

    delete_list = Path(workdir) / "obsolete.txt"
    write_list(delete_list, obsolete)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = root / "backups" / ("r2-" + stamp)
    backup.mkdir(parents=True, exist_ok=False)
    write_json(backup / "cleanup.json", {
        "remote": remote_path(remote), "site_url": site_url,
        "data": manifest["data"], "files": obsolete,
    })
    write_list(backup / "obsolete.txt", obsolete)
    source = remote_path(remote)
    destination = backup / "photos/generated"
    rclone("copy", source, destination, "--files-from-raw", delete_list, "--checksum")
    rclone("check", source, destination, "--files-from-raw", delete_list, "--download", "--one-way")
    # Recheck the publication and manifest after the potentially long backup.
    if validate_manifest(root) != manifest:
        raise RuntimeError("Manifest changed during cleanup; nothing deleted.")
    verify_public(root, site_url)
    rclone("delete", source, "--files-from-raw", delete_list)
    remaining = set(obsolete_photos(remote, set(relative_photos(manifest)))) & set(obsolete)
    if remaining:
        raise RuntimeError("Some obsolete objects remain; backup kept at {}".format(backup))
    verify_remote(root, remote, current_list)
    print("Cleanup complete. Recovery copy: {}".format(backup), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("verify-local", "copy", "verify-remote", "verify-public", "cleanup"))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--remote", default="r2-runningmap:runningmap-photos")
    parser.add_argument("--site-url", default="https://runningmap.rboman.dev")
    parser.add_argument("--dry-run", action="store_true", help="Simulate copy/cleanup without persistent changes.")
    args = parser.parse_args()
    root = args.root.resolve()
    manifest = validate_manifest(root)
    print("Validated {} referenced images and both generated data files.".format(len(manifest["files"])), flush=True)
    if args.action == "verify-local":
        return
    if args.action == "verify-public":
        verify_public(root, args.site_url)
        return
    with tempfile.TemporaryDirectory(prefix="runningmap-photos-") as workdir:
        file_list = Path(workdir) / "current.txt"
        write_list(file_list, relative_photos(manifest))
        if args.action == "copy":
            options = ["--dry-run"] if args.dry_run else []
            # Older rclone versions HEAD the version ID returned by R2's PUT,
            # which R2 rejects with 501. Verify actual bytes below instead.
            rclone("copy", root / "photos/generated", remote_path(args.remote),
                   "--files-from-raw", file_list, "--checksum", "--s3-no-head", *options)
            if not args.dry_run:
                verify_remote(root, args.remote, file_list)
        elif args.action == "verify-remote":
            verify_remote(root, args.remote, file_list)
        elif args.action == "cleanup":
            cleanup(root, args.remote, args.site_url, manifest, file_list, workdir, args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as exc:
        print("Error: {}".format(exc), file=sys.stderr)
        sys.exit(1)
