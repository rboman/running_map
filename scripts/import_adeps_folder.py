#!/usr/bin/env python3
"""Import ADEPS GPX folders into generated running-map data files."""

import argparse
import json
import os
import sys
from pathlib import Path

from gpx_utils import (
    elevation_gain_m,
    fail,
    feature_from_points,
    parse_run_folder_name,
    read_track_points,
    simplify_points,
    total_distance_km,
)


COLORS = [
    "#1f78b4",
    "#e66100",
    "#33a02c",
    "#6a3d9a",
    "#b15928",
    "#a6cee3",
    "#fb9a99",
    "#fdbf6f",
]

SKIPPED_TREE_NAMES = set(
    [
        "videos brutes",
        "video_raw",
        "videos_raw",
        "brut",
        "bruts",
        "bestof",
        "best-of",
    ]
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import ADEPS GPX folders into generated running-map JS files."
    )
    parser.add_argument("source_dir", help="Source ADEPS folder to scan recursively.")
    parser.add_argument(
        "--output",
        default=".",
        help="running-map project root where generated files are written.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite generated files if they already exist.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be imported without writing files.",
    )
    parser.add_argument(
        "--year",
        help="Import only one year, for example 2026.",
    )
    parser.add_argument(
        "--elevation-threshold-m",
        type=float,
        default=3.0,
        help="Minimum positive elevation change counted as gain, in meters.",
    )
    parser.add_argument(
        "--simplify-tolerance-m",
        type=float,
        default=5.0,
        help="Douglas-Peucker tolerance for exported geometry, in meters.",
    )
    parser.add_argument(
        "--default-visible",
        choices=["true", "false"],
        default="false",
        help="Initial visibility for generated runs.",
    )
    return parser.parse_args()


def find_course_folders(source_dir, year):
    course_folders = []
    warnings = []

    if not source_dir.exists():
        fail("Source folder does not exist: {}".format(source_dir))
    if not source_dir.is_dir():
        fail("Source path is not a folder: {}".format(source_dir))

    try:
        for root, dir_names, _ in os.walk(str(source_dir)):
            path = Path(root)
            dir_names[:] = [
                name
                for name in dir_names
                if name.lower() not in SKIPPED_TREE_NAMES
                or parse_run_folder_name(name) is not None
            ]

            metadata = parse_run_folder_name(path.name)
            if metadata is None:
                continue
            elif not year or metadata["year"] == year:
                course_folders.append((path, metadata))

    except OSError as exc:
        fail("Could not scan source folder: {}".format(exc))

    course_folders.sort(key=lambda item: (item[1]["date"], item[1]["title"]))
    return course_folders, warnings


def choose_gpx_file(course_folder):
    track_gpx = course_folder / "track.gpx"
    if track_gpx.exists() and track_gpx.is_file():
        return track_gpx, None

    gpx_files = sorted(
        path
        for path in course_folder.iterdir()
        if path.is_file() and path.suffix.lower() == ".gpx"
    )

    if len(gpx_files) == 1:
        return gpx_files[0], None
    if len(gpx_files) == 0:
        return None, "no GPX file found"
    return None, "multiple GPX files found and no track.gpx"


def build_imported_run(course_folder, metadata, gpx_path, args, color):
    points = read_track_points(gpx_path)
    simplified_points = simplify_points(points, args.simplify_tolerance_m)
    distance_km = total_distance_km(points)
    gain_m = elevation_gain_m(points, args.elevation_threshold_m)

    feature = feature_from_points(simplified_points)
    run = {
        "id": metadata["id"],
        "title": metadata["title"],
        "date": metadata["date"],
        "distanceKm": round(distance_km, 2),
        "elevationGainM": int(round(gain_m)),
        "color": color,
        "visible": args.default_visible == "true",
        "trackRef": metadata["id"],
        "photos": [],
    }
    report = {
        "id": metadata["id"],
        "title": metadata["title"],
        "date": metadata["date"],
        "folder": course_folder,
        "gpx_path": gpx_path,
        "points_before": len(points),
        "points_after": len(simplified_points),
        "distance_km": distance_km,
        "gain_m": gain_m,
    }
    return feature, run, report


def write_generated_files(output_root, tracks, runs, force):
    tracks_path = output_root / "tracks" / "generated-tracks.js"
    runs_path = output_root / "data" / "generated-runs.js"

    for path in [tracks_path, runs_path]:
        if path.exists() and not force:
            fail("Output file already exists: {}. Use --force to overwrite.".format(path))

    tracks_path.parent.mkdir(parents=True, exist_ok=True)
    runs_path.parent.mkdir(parents=True, exist_ok=True)

    tracks_payload = json.dumps(tracks, ensure_ascii=False, separators=(",", ":"))
    tracks_path.write_text(
        "window.GENERATED_TRACKS = {};\n".format(tracks_payload),
        encoding="utf-8",
    )

    runs_text = format_generated_runs_js(runs)
    runs_path.write_text(runs_text, encoding="utf-8")

    return tracks_path, runs_path


def format_generated_runs_js(runs):
    lines = ["window.GENERATED_RUNS = ["]

    for index, run in enumerate(runs):
        suffix = "," if index < len(runs) - 1 else ""
        lines.extend(
            [
                "  {",
                "    id: {},".format(js_string(run["id"])),
                "    title: {},".format(js_string(run["title"])),
                "    date: {},".format(js_string(run["date"])),
                "    distanceKm: {:.2f},".format(run["distanceKm"]),
                "    elevationGainM: {},".format(run["elevationGainM"]),
                "    color: {},".format(js_string(run["color"])),
                "    visible: {},".format("true" if run["visible"] else "false"),
                '    track: window.GENERATED_TRACKS[{}],'.format(js_string(run["trackRef"])),
                "    photos: []",
                "  }}{}".format(suffix),
            ]
        )

    lines.append("];")
    return "\n".join(lines) + "\n"


def js_string(value):
    return json.dumps(value, ensure_ascii=False)


def print_course_report(report):
    print("Imported: {}".format(report["id"]))
    print("  Title: {}".format(report["title"]))
    print("  Date: {}".format(report["date"]))
    print("  GPX: {}".format(report["gpx_path"]))
    print(
        "  Points: {} -> {}".format(
            report["points_before"], report["points_after"]
        )
    )
    print("  Distance: {:.2f} km".format(report["distance_km"]))
    print("  Approx. elevation gain: {:.0f} m".format(report["gain_m"]))


def print_summary(
    detected_count,
    reports,
    skipped_count,
    warnings,
    generated_files,
    dry_run,
):
    total_before = sum(report["points_before"] for report in reports)
    total_after = sum(report["points_after"] for report in reports)
    reduction = 0.0
    if total_before:
        reduction = (1.0 - (float(total_after) / float(total_before))) * 100.0

    print()
    print("Summary")
    print("Course folders detected: {}".format(detected_count))
    print("GPX imported: {}".format(len(reports)))
    print("Folders skipped: {}".format(skipped_count))
    print("Points before simplification: {}".format(total_before))
    print("Points after simplification: {}".format(total_after))
    print("Reduction: {:.1f}%".format(reduction))

    print()
    print("Warnings:")
    if warnings:
        for warning in warnings:
            print("- {}".format(warning))
    else:
        print("- none")

    print()
    if dry_run:
        print("Dry run: no files written.")
    else:
        print("Generated files:")
        for path in generated_files:
            print("- {} (~{})".format(path, format_file_size(path)))


def format_file_size(path):
    size = path.stat().st_size
    if size >= 1024 * 1024:
        return "{:.1f} MB".format(size / (1024.0 * 1024.0))
    if size >= 1024:
        return "{:.1f} KB".format(size / 1024.0)
    return "{} B".format(size)


def main():
    args = parse_args()
    source_dir = Path(args.source_dir)
    output_root = Path(args.output)

    if args.year and not (len(args.year) == 4 and args.year.isdigit()):
        fail("--year must use the YYYY format.")

    course_folders, warnings = find_course_folders(source_dir, args.year)
    tracks = {}
    runs = []
    reports = []
    skipped_count = 0
    seen_ids = set()

    for index, (course_folder, metadata) in enumerate(course_folders):
        if metadata["id"] in seen_ids:
            skipped_count += 1
            warnings.append(
                "{}: duplicate generated id {}".format(course_folder, metadata["id"])
            )
            continue
        seen_ids.add(metadata["id"])

        gpx_path, warning = choose_gpx_file(course_folder)
        if warning:
            skipped_count += 1
            warnings.append("{}: {}".format(course_folder, warning))
            continue

        try:
            color = COLORS[index % len(COLORS)]
            feature, run, report = build_imported_run(
                course_folder, metadata, gpx_path, args, color
            )
        except RuntimeError as exc:
            skipped_count += 1
            warnings.append("{}: {}".format(course_folder, exc))
            continue

        tracks[metadata["id"]] = feature
        runs.append(run)
        reports.append(report)
        print_course_report(report)

    generated_files = []
    if not args.dry_run:
        generated_files = write_generated_files(output_root, tracks, runs, args.force)

    print_summary(
        len(course_folders),
        reports,
        skipped_count,
        warnings,
        generated_files,
        args.dry_run,
    )


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print("Error: {}".format(exc), file=sys.stderr)
        sys.exit(1)
