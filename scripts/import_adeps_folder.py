#!/usr/bin/env python3
"""Import ADEPS GPX folders into generated RunningMap data files."""

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
    "#D55E00",
    "#0072B2",
    "#009E73",
    "#CC79A7",
    "#E69F00",
    "#7F3C8D",
    "#3969AC",
    "#E73F74",
    "#A6761D",
    "#666666",
]

SUPPORTED_PHOTO_SUFFIXES = set([".jpg", ".jpeg", ".png"])
PHOTO_OUTPUT_ROOT = "photos/generated"
PHOTO_THUMB_ASPECT_RATIO = 112.0 / 180.0

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
        description="Import ADEPS GPX folders into generated RunningMap JS files."
    )
    parser.add_argument("source_dir", help="Source ADEPS folder to scan recursively.")
    parser.add_argument(
        "--output",
        default=".",
        help="RunningMap project root where generated files are written.",
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
        "--photos",
        "--with-photos",
        dest="with_photos",
        action="store_true",
        help="Import selected publication photos from each course photos folder.",
    )
    parser.add_argument(
        "--photo-thumb-size",
        type=int,
        default=180,
        help="Thumbnail width in pixels. Height follows the map popup ratio.",
    )
    parser.add_argument(
        "--photo-web-size",
        type=int,
        default=800,
        help="Maximum web image width or height in pixels.",
    )
    parser.add_argument(
        "--photo-quality",
        type=int,
        default=75,
        help="JPEG quality for generated photo files.",
    )
    parser.add_argument(
        "--force-photos",
        action="store_true",
        help="Regenerate photo files even if thumb/web outputs already exist.",
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


def build_imported_run(course_folder, metadata, gpx_path, args, color, output_root, warnings):
    points = read_track_points(gpx_path)
    simplified_points = simplify_points(points, args.simplify_tolerance_m)
    distance_km = total_distance_km(points)
    gain_m = elevation_gain_m(points, args.elevation_threshold_m)
    photos, photo_report = import_run_photos(course_folder, metadata, args, output_root, warnings)

    feature = feature_from_points(simplified_points)
    run = {
        "id": metadata["id"],
        "title": metadata["title"],
        "date": metadata["date"],
        "distanceKm": round(distance_km, 2),
        "elevationGainM": int(round(gain_m)),
        "color": color,
        "trackRef": metadata["id"],
        "photos": photos,
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
        "photo_report": photo_report,
    }
    return feature, run, report


def import_run_photos(course_folder, metadata, args, output_root, warnings):
    photo_report = {
        "detected": 0,
        "with_gps": 0,
        "without_gps": 0,
        "output_dir": output_root / PHOTO_OUTPUT_ROOT / metadata["id"],
    }

    if not args.with_photos:
        return [], photo_report

    validate_photo_options(args)

    photo_folder = course_folder / "photos"
    if not photo_folder.exists():
        return [], photo_report
    if not photo_folder.is_dir():
        warnings.append("{}: photos exists but is not a folder".format(course_folder))
        return [], photo_report

    supported_paths = []

    for path in sorted(photo_folder.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix in SUPPORTED_PHOTO_SUFFIXES:
            supported_paths.append(path)
        else:
            warnings.append("{}: unsupported photo format ignored".format(path))

    photo_report["detected"] = len(supported_paths)

    photos = []
    for index, source_path in enumerate(supported_paths, start=1):
        photo = build_photo_metadata(
            source_path,
            metadata["id"],
            index,
            args,
            output_root,
            warnings,
        )
        if photo is None:
            continue
        if "lat" in photo and "lon" in photo:
            photo_report["with_gps"] += 1
        else:
            photo_report["without_gps"] += 1
        photos.append(photo)

    return photos, photo_report


def validate_photo_options(args):
    if args.photo_thumb_size <= 0:
        fail("--photo-thumb-size must be greater than zero.")
    if args.photo_web_size <= 0:
        fail("--photo-web-size must be greater than zero.")
    if args.photo_quality < 1 or args.photo_quality > 95:
        fail("--photo-quality must be between 1 and 95.")


def build_photo_metadata(source_path, run_id, index, args, output_root, warnings):
    try:
        from PIL import Image, ImageOps
    except ImportError:
        fail("Pillow is required for --photos. Install requirements.txt first.")

    output_dir = output_root / PHOTO_OUTPUT_ROOT / run_id
    thumb_name = "photo-{0:03d}-thumb.jpg".format(index)
    web_name = "photo-{0:03d}-web.jpg".format(index)
    thumb_path = output_dir / thumb_name
    web_path = output_dir / web_name

    try:
        with Image.open(source_path) as image:
            gps = extract_gps_coordinates(image)
            thumb_size = None
            web_size = None
            if not args.dry_run:
                output_dir.mkdir(parents=True, exist_ok=True)
                if args.force_photos or not thumb_path.exists():
                    thumb_size = save_thumbnail_jpeg(
                        image,
                        thumb_path,
                        args.photo_thumb_size,
                        args.photo_quality,
                        Image,
                        ImageOps,
                    )
                else:
                    thumb_size = read_image_size(thumb_path, Image)
                if args.force_photos or not web_path.exists():
                    web_size = save_resized_jpeg(
                        image,
                        web_path,
                        args.photo_web_size,
                        args.photo_quality,
                        ImageOps,
                    )
                else:
                    web_size = read_image_size(web_path, Image)
            else:
                thumb_size = (args.photo_thumb_size, thumbnail_height(args.photo_thumb_size))
                web_size = resized_dimensions(image, args.photo_web_size, ImageOps)
    except OSError as exc:
        warnings.append("{}: could not read photo ({})".format(source_path, exc))
        return None

    photo = {
        "thumb": "./{}/{}/{}".format(PHOTO_OUTPUT_ROOT, run_id, thumb_name),
        "thumbWidth": thumb_size[0],
        "thumbHeight": thumb_size[1],
        "web": "./{}/{}/{}".format(PHOTO_OUTPUT_ROOT, run_id, web_name),
        "webWidth": web_size[0],
        "webHeight": web_size[1],
        "caption": source_path.stem,
        "source": source_path.name,
    }

    if gps is not None:
        lat, lon = gps
        photo["lat"] = round(lat, 6)
        photo["lon"] = round(lon, 6)

    return photo


def save_resized_jpeg(image, output_path, max_size, quality, image_ops):
    resized = image_ops.exif_transpose(image)
    resized.thumbnail((max_size, max_size))
    if resized.mode != "RGB":
        resized = resized.convert("RGB")
    resized.save(
        output_path,
        "JPEG",
        quality=quality,
        optimize=True,
        progressive=True,
    )
    return resized.size


def save_thumbnail_jpeg(image, output_path, width, quality, image_module, image_ops):
    height = thumbnail_height(width)
    resized = image_ops.exif_transpose(image)
    resized = image_ops.fit(
        resized,
        (width, height),
        method=image_module.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    if resized.mode != "RGB":
        resized = resized.convert("RGB")
    resized.save(
        output_path,
        "JPEG",
        quality=quality,
        optimize=True,
        progressive=True,
    )
    return resized.size


def read_image_size(path, image_module):
    with image_module.open(path) as image:
        return image.size


def thumbnail_height(width):
    return int(round(width * PHOTO_THUMB_ASPECT_RATIO))


def resized_dimensions(image, max_size, image_ops):
    width, height = image_ops.exif_transpose(image).size
    if width <= max_size and height <= max_size:
        return (width, height)
    scale = min(float(max_size) / float(width), float(max_size) / float(height))
    return (int(width * scale), int(height * scale))


def extract_gps_coordinates(image):
    try:
        exif = image.getexif()
    except (AttributeError, OSError, ValueError):
        return None

    if not exif:
        return None

    gps_info = exif.get_ifd(0x8825)
    if not gps_info:
        return None

    latitude = coordinate_from_gps_values(gps_info.get(2), gps_info.get(1))
    longitude = coordinate_from_gps_values(gps_info.get(4), gps_info.get(3))

    if latitude is None or longitude is None:
        return None

    return latitude, longitude


def coordinate_from_gps_values(values, ref):
    if not values or not ref or len(values) != 3:
        return None

    try:
        degrees = rational_to_float(values[0])
        minutes = rational_to_float(values[1])
        seconds = rational_to_float(values[2])
    except (TypeError, ZeroDivisionError, ValueError):
        return None

    coordinate = degrees + minutes / 60.0 + seconds / 3600.0
    ref_text = ref.decode("ascii", "ignore") if isinstance(ref, bytes) else str(ref)

    if ref_text.upper() in ["S", "W"]:
        coordinate = -coordinate

    return coordinate


def rational_to_float(value):
    if hasattr(value, "numerator") and hasattr(value, "denominator"):
        return float(value.numerator) / float(value.denominator)
    if isinstance(value, tuple) and len(value) == 2:
        return float(value[0]) / float(value[1])
    return float(value)


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
                '    track: window.GENERATED_TRACKS[{}],'.format(js_string(run["trackRef"])),
                format_photos_js(run["photos"]),
                "  }}{}".format(suffix),
            ]
        )

    lines.append("];")
    return "\n".join(lines) + "\n"


def js_string(value):
    return json.dumps(value, ensure_ascii=False)


def format_photos_js(photos):
    if not photos:
        return "    photos: []"

    lines = ["    photos: ["]
    for index, photo in enumerate(photos):
        suffix = "," if index < len(photos) - 1 else ""
        lines.append("      {")
        lines.append("        thumb: {},".format(js_string(photo["thumb"])))
        lines.append("        thumbWidth: {},".format(photo["thumbWidth"]))
        lines.append("        thumbHeight: {},".format(photo["thumbHeight"]))
        lines.append("        web: {},".format(js_string(photo["web"])))
        lines.append("        webWidth: {},".format(photo["webWidth"]))
        lines.append("        webHeight: {},".format(photo["webHeight"]))
        if "lat" in photo and "lon" in photo:
            lines.append("        lat: {:.6f},".format(photo["lat"]))
            lines.append("        lon: {:.6f},".format(photo["lon"]))
        lines.append("        caption: {},".format(js_string(photo["caption"])))
        lines.append("        source: {}".format(js_string(photo["source"])))
        lines.append("      }}{}".format(suffix))
    lines.append("    ]")
    return "\n".join(lines)


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
    photo_report = report["photo_report"]
    if photo_report["detected"]:
        print("  Photos: {} (GPS: {}, no GPS: {})".format(
            photo_report["detected"],
            photo_report["with_gps"],
            photo_report["without_gps"],
        ))
        print("  Photo output: {}".format(photo_report["output_dir"]))


def print_summary(
    detected_count,
    reports,
    skipped_count,
    warnings,
    generated_files,
    dry_run,
    output_root,
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

    total_photos = sum(report["photo_report"]["detected"] for report in reports)
    total_photos_with_gps = sum(report["photo_report"]["with_gps"] for report in reports)
    total_photos_without_gps = sum(report["photo_report"]["without_gps"] for report in reports)
    photo_output_dirs = sorted(
        str(report["photo_report"]["output_dir"])
        for report in reports
        if report["photo_report"]["detected"]
    )

    if total_photos:
        print()
        print("Photos")
        print("Detected: {}".format(total_photos))
        print("With GPS EXIF: {}".format(total_photos_with_gps))
        print("Without GPS EXIF: {}".format(total_photos_without_gps))
        if not dry_run:
            generated_photo_dir = output_root / PHOTO_OUTPUT_ROOT
            generated_photo_count, generated_photo_size = directory_file_stats(
                generated_photo_dir
            )
            print(
                "Generated photo files: {} (~{})".format(
                    generated_photo_count,
                    format_byte_size(generated_photo_size),
                )
            )
            print(
                "Generated photo folder size: ~{}".format(
                    format_byte_size(generated_photo_size)
                )
            )
            if total_photos:
                print(
                    "Average generated size per source photo: ~{}".format(
                        format_byte_size(generated_photo_size / float(total_photos))
                    )
                )
        print("Output folders:")
        for output_dir in photo_output_dirs:
            print("- {}".format(output_dir))

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
    return format_byte_size(path.stat().st_size)


def format_byte_size(size):
    if size >= 1024 * 1024:
        return "{:.1f} MB".format(size / (1024.0 * 1024.0))
    if size >= 1024:
        return "{:.1f} KB".format(size / 1024.0)
    return "{} B".format(int(size))


def directory_file_stats(path):
    file_count = 0
    total_size = 0

    if not path.exists():
        return file_count, total_size

    for child in path.rglob("*"):
        if child.is_file():
            file_count += 1
            total_size += child.stat().st_size

    return file_count, total_size


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
                course_folder, metadata, gpx_path, args, color, output_root, warnings
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
        output_root,
    )


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print("Error: {}".format(exc), file=sys.stderr)
        sys.exit(1)
