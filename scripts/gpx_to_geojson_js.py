#!/usr/bin/env python3
"""Convert a GPX track to a GeoJSON JavaScript file for running-map."""

import argparse
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


EARTH_RADIUS_KM = 6371.0088
JS_IDENTIFIER_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


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


def fail(message):
    raise RuntimeError(message)


def local_name(tag):
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag


def child_text(element, name):
    for child in element:
        if local_name(child.tag) == name:
            return child.text
    return None


def parse_float(value, field_name):
    try:
        return float(value)
    except (TypeError, ValueError):
        fail("Invalid GPX point: {} is not a number.".format(field_name))


def read_track_points(gpx_path):
    if not gpx_path.exists():
        fail("GPX file does not exist: {}".format(gpx_path))

    try:
        tree = ET.parse(gpx_path)
    except ET.ParseError as exc:
        fail("Invalid GPX XML: {}".format(exc))
    except OSError as exc:
        fail("Could not read GPX file: {}".format(exc))

    points = []
    root = tree.getroot()

    for element in root.iter():
        if local_name(element.tag) != "trkpt":
            continue

        lat = parse_float(element.get("lat"), "latitude")
        lon = parse_float(element.get("lon"), "longitude")

        ele_text = child_text(element, "ele")
        elevation = None
        if ele_text is not None and ele_text.strip():
            elevation = parse_float(ele_text.strip(), "elevation")

        points.append((lon, lat, elevation))

    if not points:
        fail("No GPX track points found.")
    if len(points) < 2:
        fail("At least two GPX track points are required.")

    return points


def haversine_km(point_a, point_b):
    lon1, lat1, _ = point_a
    lon2, lat2, _ = point_b
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def total_distance_km(points):
    return sum(haversine_km(points[index - 1], points[index]) for index in range(1, len(points)))


def elevation_gain_m(points, threshold_m):
    if threshold_m < 0:
        fail("--elevation-threshold-m must be zero or greater.")

    gain = 0.0
    previous_elevation = None

    for _, _, elevation in points:
        if elevation is None:
            continue

        if previous_elevation is not None:
            delta = elevation - previous_elevation
            # GPS elevation is noisy, so this D+ is only approximate. A future
            # version can use better filtering or Strava metadata instead.
            if delta >= threshold_m:
                gain += delta

        previous_elevation = elevation

    return gain


def coordinates_for_geojson(points):
    coordinates = []
    for lon, lat, elevation in points:
        coordinate = [lon, lat]
        if elevation is not None:
            coordinate.append(elevation)
        coordinates.append(coordinate)
    return coordinates


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
    feature = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates_for_geojson(points),
        },
        "properties": {},
    }

    write_geojson_js(output_path, args.var_name, feature, args.force)
    print_summary(args, len(points), distance_km, gain_m)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print("Error: {}".format(exc), file=sys.stderr)
        sys.exit(1)
