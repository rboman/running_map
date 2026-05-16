"""Shared GPX helpers for RunningMap scripts.

The elevation gain is intentionally approximate: GPS altitude is noisy, so
small positive changes are ignored with a configurable threshold.
"""

import math
import re
import unicodedata
import xml.etree.ElementTree as ET


EARTH_RADIUS_KM = 6371.0088
JS_IDENTIFIER_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")
RUN_FOLDER_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2}) - (.+)$")


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
    return sum(
        haversine_km(points[index - 1], points[index])
        for index in range(1, len(points))
    )


def elevation_gain_m(points, threshold_m):
    if threshold_m < 0:
        fail("--elevation-threshold-m must be zero or greater.")

    gain = 0.0
    baseline_elevation = None

    for _, _, elevation in points:
        if elevation is None:
            continue

        if baseline_elevation is None:
            baseline_elevation = elevation
            continue

        delta = elevation - baseline_elevation
        if delta >= threshold_m:
            gain += delta
            baseline_elevation = elevation
        elif delta < 0:
            baseline_elevation = elevation

    return gain


def coordinates_for_geojson(points):
    coordinates = []
    for lon, lat, elevation in points:
        coordinate = [lon, lat]
        if elevation is not None:
            coordinate.append(elevation)
        coordinates.append(coordinate)
    return coordinates


def feature_from_points(points):
    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates_for_geojson(points),
        },
        "properties": {},
    }


def parse_run_folder_name(folder_name):
    match = RUN_FOLDER_RE.match(folder_name)
    if not match:
        return None

    year, month, day, title = match.groups()
    date = "{}-{}-{}".format(year, month, day)
    return {
        "date": date,
        "year": year,
        "title": title.strip(),
        "id": slugify_run_id(date, title),
    }


def slugify_run_id(date, title):
    value = "{}-{}".format(date, title)
    value = value.replace("(", " ").replace(")", " ")
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value


def simplify_points(points, tolerance_m):
    if tolerance_m < 0:
        fail("--simplify-tolerance-m must be zero or greater.")
    if tolerance_m == 0 or len(points) <= 2:
        return list(points)

    projected = project_points_to_local_meters(points)
    keep = set([0, len(points) - 1])
    douglas_peucker_keep(projected, 0, len(points) - 1, tolerance_m, keep)
    return [points[index] for index in sorted(keep)]


def project_points_to_local_meters(points):
    latitudes = [lat for _, lat, _ in points]
    mean_lat_rad = math.radians(sum(latitudes) / len(latitudes))
    meters_per_degree_lat = 111320.0
    meters_per_degree_lon = 111320.0 * math.cos(mean_lat_rad)

    return [
        (lon * meters_per_degree_lon, lat * meters_per_degree_lat)
        for lon, lat, _ in points
    ]


def douglas_peucker_keep(projected, start, end, tolerance_m, keep):
    if end <= start + 1:
        return

    max_distance = -1.0
    max_index = None
    start_point = projected[start]
    end_point = projected[end]

    for index in range(start + 1, end):
        distance = perpendicular_distance_m(projected[index], start_point, end_point)
        if distance > max_distance:
            max_distance = distance
            max_index = index

    if max_index is not None and max_distance > tolerance_m:
        keep.add(max_index)
        douglas_peucker_keep(projected, start, max_index, tolerance_m, keep)
        douglas_peucker_keep(projected, max_index, end, tolerance_m, keep)


def perpendicular_distance_m(point, line_start, line_end):
    x, y = point
    x1, y1 = line_start
    x2, y2 = line_end
    dx = x2 - x1
    dy = y2 - y1

    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)

    numerator = abs(dy * x - dx * y + x2 * y1 - y2 * x1)
    denominator = math.hypot(dx, dy)
    return numerator / denominator
