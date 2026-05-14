#!/usr/bin/env python3
"""Convert a GPX track to a GeoJSON JavaScript file for running-map."""

import argparse
import json
import sys
from pathlib import Path

from gpx_utils import (
    JS_IDENTIFIER_RE,
    elevation_gain_m,
    fail,
    feature_from_points,
    read_track_points,
    total_distance_km,
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert a GPX file to a tracks/*.geojson.js file."
    )
    parser.add_argument("gpx_file", help="Input GPX file.")
    parser.add_argument("--id", required=True, help="Run identifier.")
    parser.add_argument("--title", required=True, help="Readable run title.")
    parser.add_argument("--date", default="", help="Optional run date, YYYY-MM-DD.")
    parser.add_argument("--var-name", required=True, help="Global JS variable name.")
    parser.add_argument("--output", required=True, help="Output .geojson.js file.")
    parser.add_argument(
        "--color",
        default="#e66100",
        help="Suggested track color for data/runs.js.",
    )
    parser.add_argument(
        "--elevation-threshold-m",
        type=float,
        default=3.0,
        help="Minimum positive elevation change counted as gain, in meters.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite the output file if it already exists.",
    )
    return parser.parse_args()


def write_geojson_js(output_path, var_name, feature, force):
    if not JS_IDENTIFIER_RE.match(var_name):
        fail("Invalid JS variable name: {}".format(var_name))

    if output_path.exists() and not force:
        fail("Output file already exists: {}. Use --force to overwrite.".format(output_path))

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(feature, indent=2, ensure_ascii=False)
        output_path.write_text(
            "window.{} = {};\n".format(var_name, payload),
            encoding="utf-8",
        )
    except OSError as exc:
        fail("Could not write output file: {}".format(exc))


def js_string(value):
    return json.dumps(value, ensure_ascii=False)


def print_summary(args, point_count, distance_km, gain_m):
    print("GPX converted successfully")
    print("Points: {}".format(point_count))
    print("Distance: {:.2f} km".format(distance_km))
    print("Approx. elevation gain: {:.0f} m".format(gain_m))
    print("Output: {}".format(args.output))
    print("JS variable: window.{}".format(args.var_name))
    print()
    print("Snippet to add manually to data/runs.js:")
    print("{")
    print("  id: {},".format(js_string(args.id)))
    print("  title: {},".format(js_string(args.title)))
    print("  date: {},".format(js_string(args.date)))
    print("  distanceKm: {:.2f},".format(distance_km))
    print("  elevationGainM: {:.0f},".format(gain_m))
    print("  color: {},".format(js_string(args.color)))
    print("  visible: true,")
    print("  track: window.{},".format(args.var_name))
    print("  photos: []")
    print("}")


def main():
    args = parse_args()
    gpx_path = Path(args.gpx_file)
    output_path = Path(args.output)

    points = read_track_points(gpx_path)
    distance_km = total_distance_km(points)
    gain_m = elevation_gain_m(points, args.elevation_threshold_m)
    feature = feature_from_points(points)

    write_geojson_js(output_path, args.var_name, feature, args.force)
    print_summary(args, len(points), distance_km, gain_m)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print("Error: {}".format(exc), file=sys.stderr)
        sys.exit(1)
