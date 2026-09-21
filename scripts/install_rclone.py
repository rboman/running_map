#!/usr/bin/env python3
"""Install an official, checksum-verified rclone inside this project (no sudo)."""

import argparse
import io
from pathlib import Path
import platform
import re
from urllib.request import urlopen
import zipfile

from photo_assets import atomic_write, digest_bytes, write_json


DEFAULT_VERSION = "1.75.1"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default=DEFAULT_VERSION)
    args = parser.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        parser.error("Use a stable version such as 1.75.1")
    system = {"Linux": "linux", "Windows": "windows", "Darwin": "osx"}.get(platform.system())
    arch = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine().lower())
    if system is None or arch is None:
        parser.error("Unsupported platform; download the executable from https://rclone.org/downloads/")
    stem = "rclone-v{}-{}-{}".format(args.version, system, arch)
    archive_name = stem + ".zip"
    base = "https://downloads.rclone.org/v{}/".format(args.version)
    print("Downloading {}".format(base + archive_name), flush=True)
    with urlopen(base + "SHA256SUMS", timeout=60) as response:
        checksums = response.read().decode("utf-8")
    expected = None
    for line in checksums.splitlines():
        fields = line.split()
        if len(fields) == 2 and fields[1].lstrip("*") == archive_name and re.fullmatch(r"[0-9a-f]{64}", fields[0]):
            expected = fields[0]
    if expected is None:
        raise RuntimeError("Archive missing from official SHA256SUMS; nothing installed.")
    with urlopen(base + archive_name, timeout=120) as response:
        archive = response.read()
    if digest_bytes(archive) != expected:
        raise RuntimeError("Archive checksum mismatch; nothing installed.")
    executable = "rclone.exe" if system == "windows" else "rclone"
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        data = bundle.read(stem + "/" + executable)
    destination = Path(__file__).resolve().parent.parent / ".tools/rclone" / executable
    atomic_write(destination, data)
    destination.chmod(0o755)
    write_json(destination.parent / "installation.json", {
        "version": args.version, "url": base + archive_name,
        "archive_sha256": expected, "executable_sha256": digest_bytes(data),
    })
    print("Official SHA256 verified. Installed: {}".format(destination))


if __name__ == "__main__":
    main()
