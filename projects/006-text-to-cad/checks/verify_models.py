"""Verify saved STEP artifacts against an independent, fixed specification.

This script never imports model source or treats its parameters as evidence.
API reference:
https://github.com/earthtojake/text-to-cad/blob/main/skills/cad/references/inspection-and-validation.md
"""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
from math import isfinite, pi
from pathlib import Path
import sys

from cadgen import build123d as bd, read_scene, read_step
from cadgen.geometry import closest_points, overlap_volume


ROOT = Path(__file__).resolve().parents[1]
LENGTH_TOLERANCE_MM = 1e-5
VOLUME_TOLERANCE_MM3 = 1e-3
BASELINE = {
    "length": 80.0, "width": 50.0, "thickness": 5.0,
    "corner_radius": 3.0, "hole_diameter": 5.5,
    "hole_centers": [(-30.0, -15.0), (30.0, -15.0), (-30.0, 15.0), (30.0, 15.0)],
    "pitch_x": 60.0, "pitch_y": 30.0,
}
WIDE = {
    "length": 100.0, "width": 50.0, "thickness": 5.0,
    "corner_radius": 3.0, "hole_diameter": 5.5,
    "hole_centers": [(-40.0, -15.0), (40.0, -15.0), (-40.0, 15.0), (40.0, 15.0)],
    "pitch_x": 80.0, "pitch_y": 30.0,
}
PIN_DIAMETER_MM = 4.5
PIN_HEIGHT_MM = 12.0
PIN_BOTTOM_Z_MM = -2.5
CLEARANCE_MM = 0.5


def _close(a, b, tolerance=LENGTH_TOLERANCE_MM):
    return isfinite(float(a)) and abs(float(a) - float(b)) <= tolerance


def _check(result, name, passed, observed, expected, units=None, tolerance=None):
    check = {
        "name": name, "status": "pass" if passed else "fail",
        "observed": observed, "expected": expected,
    }
    if units is not None:
        check["units"] = units
    if tolerance is not None:
        check["absolute_tolerance"] = tolerance
    result["checks"].append(check)
    return passed


def _near(result, name, observed, expected, units="mm", tolerance=LENGTH_TOLERANCE_MM):
    return _check(result, name, _close(observed, expected, tolerance),
                  float(observed), float(expected), units, tolerance)


def _solid(result, shape, prefix):
    solids = list(shape.solids())
    _check(result, f"{prefix}.solid_count", len(solids) == 1, len(solids), 1)
    if len(solids) != 1:
        raise ValueError(f"{prefix} must contain exactly one solid.")
    solid = solids[0]
    _check(result, f"{prefix}.topology_valid", bool(solid.is_valid), bool(solid.is_valid), True)
    _check(result, f"{prefix}.positive_volume", solid.volume > 0,
           float(solid.volume), "> 0", "mm^3")
    return solid


def _ring_edges(shape, z):
    """Return full analytic circular edges at a particular saved Z plane."""
    return sorted(
        [edge for edge in shape.edges().filter_by(bd.GeomType.CIRCLE)
         if _close(edge.arc_center.Z, z)
         and _close(edge.length, 2 * pi * edge.radius)],
        key=lambda edge: (round(edge.arc_center.Y, 6), round(edge.arc_center.X, 6)),
    )


def _plate(result, shape, spec, prefix):
    solid = _solid(result, shape, prefix)
    box = solid.bounding_box()
    for axis, dimension in (("X", "length"), ("Y", "width"), ("Z", "thickness")):
        _near(result, f"{prefix}.envelope_{axis}", getattr(box.size, axis), spec[dimension])
        _near(result, f"{prefix}.min_{axis}", getattr(box.min, axis), -spec[dimension] / 2)
        _near(result, f"{prefix}.max_{axis}", getattr(box.max, axis), spec[dimension] / 2)

    expected_volume = (
        spec["length"] * spec["width"]
        - (4 - pi) * spec["corner_radius"] ** 2
        - 4 * pi * (spec["hole_diameter"] / 2) ** 2
    ) * spec["thickness"]
    _near(result, f"{prefix}.analytic_volume", solid.volume, expected_volume,
          "mm^3", VOLUME_TOLERANCE_MM3)

    measured_centers = {}
    circles = list(solid.edges().filter_by(bd.GeomType.CIRCLE))
    for level, z in (("top", spec["thickness"] / 2), ("bottom", -spec["thickness"] / 2)):
        rings = _ring_edges(solid, z)
        _check(result, f"{prefix}.{level}.full_hole_ring_count", len(rings) == 4, len(rings), 4)
        centers = []
        for index, (edge, expected) in enumerate(zip(rings, spec["hole_centers"]), 1):
            center = edge.arc_center
            centers.append((float(center.X), float(center.Y), float(center.Z)))
            _near(result, f"{prefix}.{level}.hole_{index}.diameter", 2 * edge.radius,
                  spec["hole_diameter"])
            for axis, observed, wanted in zip("XYZ", (center.X, center.Y, center.Z), (*expected, z)):
                _near(result, f"{prefix}.{level}.hole_{index}.center_{axis}", observed, wanted)
            _near(result, f"{prefix}.{level}.hole_{index}.complete_circle_length",
                  edge.length, 2 * pi * edge.radius)
        measured_centers[level] = centers
        if len(centers) == 4:
            for row, (left, right) in enumerate(((0, 1), (2, 3)), 1):
                _near(result, f"{prefix}.{level}.row_{row}.pitch_X",
                      centers[right][0] - centers[left][0], spec["pitch_x"])
            for column, (lower, upper) in enumerate(((0, 2), (1, 3)), 1):
                _near(result, f"{prefix}.{level}.column_{column}.pitch_Y",
                      centers[upper][1] - centers[lower][1], spec["pitch_y"])

        corners = sorted(
            [edge for edge in circles if _close(edge.arc_center.Z, z)
             and not _close(edge.length, 2 * pi * edge.radius)],
            key=lambda edge: (round(edge.arc_center.Y, 6), round(edge.arc_center.X, 6)),
        )
        _check(result, f"{prefix}.{level}.corner_arc_count", len(corners) == 4, len(corners), 4)
        cx = spec["length"] / 2 - spec["corner_radius"]
        cy = spec["width"] / 2 - spec["corner_radius"]
        for index, (edge, expected) in enumerate(zip(corners, [(-cx, -cy), (cx, -cy), (-cx, cy), (cx, cy)]), 1):
            _near(result, f"{prefix}.{level}.corner_{index}.radius", edge.radius, spec["corner_radius"])
            _near(result, f"{prefix}.{level}.corner_{index}.quarter_arc_length",
                  edge.length, pi * spec["corner_radius"] / 2)
            for axis, wanted in zip("XYZ", (*expected, z)):
                _near(result, f"{prefix}.{level}.corner_{index}.center_{axis}",
                      getattr(edge.arc_center, axis), wanted)
    result.setdefault("measurements", {})[prefix] = {
        "signed_volume_mm3": float(solid.volume), "analytic_volume_mm3": expected_volume,
        "hole_centers_mm": measured_centers,
    }
    return solid


def _pin(result, shape, expected_center, prefix):
    solid = _solid(result, shape, prefix)
    box = solid.bounding_box()
    for axis in "XY":
        _near(result, f"{prefix}.envelope_{axis}", getattr(box.size, axis), PIN_DIAMETER_MM)
    _near(result, f"{prefix}.height", box.size.Z, PIN_HEIGHT_MM)
    _near(result, f"{prefix}.bottom_Z", box.min.Z, PIN_BOTTOM_Z_MM)
    _near(result, f"{prefix}.top_Z", box.max.Z, PIN_BOTTOM_Z_MM + PIN_HEIGHT_MM)
    for axis, wanted in zip("XY", expected_center):
        center = (getattr(box.min, axis) + getattr(box.max, axis)) / 2
        _near(result, f"{prefix}.center_{axis}", center, wanted)
    _near(result, f"{prefix}.analytic_volume", solid.volume,
          pi * (PIN_DIAMETER_MM / 2) ** 2 * PIN_HEIGHT_MM, "mm^3", VOLUME_TOLERANCE_MM3)
    for level, z in (("bottom", PIN_BOTTOM_Z_MM), ("top", PIN_BOTTOM_Z_MM + PIN_HEIGHT_MM)):
        rings = _ring_edges(solid, z)
        _check(result, f"{prefix}.{level}.full_ring_count", len(rings) == 1, len(rings), 1)
        if len(rings) == 1:
            edge = rings[0]
            _near(result, f"{prefix}.{level}.diameter", 2 * edge.radius, PIN_DIAMETER_MM)
            for axis, wanted in zip("XYZ", (*expected_center, z)):
                _near(result, f"{prefix}.{level}.center_{axis}", getattr(edge.arc_center, axis), wanted)
    return solid


def _assembly(result, path):
    scene = read_scene(path)
    leaves = list(scene.leaves())
    result["document_hash"] = scene.document_hash
    result["occurrences"] = [{"label": leaf.label, "ref": leaf.ref} for leaf in leaves]
    _check(result, "assembly.leaf_count", len(leaves) == 5, len(leaves), 5)
    solid_count = sum(len(leaf.shape().solids()) for leaf in leaves)
    _check(result, "assembly.solid_count", solid_count == 5, solid_count, 5)
    plate_selection = scene.resolve("#mounting_plate")
    plate = _plate(result, plate_selection.shape(), BASELINE, "assembly.mounting_plate")
    pins = []
    for index, expected_center in enumerate(BASELINE["hole_centers"], 1):
        label = f"pin_{index}"
        selection = scene.resolve(f"#{label}")
        pin = _pin(result, selection.shape(), expected_center, f"assembly.{label}")
        gap = closest_points(plate, pin)
        overlap = overlap_volume(plate, pin)
        _near(result, f"assembly.{label}.plate_clearance", gap.distance, CLEARANCE_MM)
        _near(result, f"assembly.{label}.plate_overlap", overlap, 0.0,
              "mm^3", VOLUME_TOLERANCE_MM3)
        pins.append({
            "label": label, "ref": selection.ref, "clearance_mm": float(gap.distance),
            "overlap_mm3": float(overlap), "point_on_plate_mm": list(gap.point_a),
            "point_on_pin_mm": list(gap.point_b),
        })
    result["measurements"]["plate_pin_pairs"] = pins


def main():
    report = {
        "schema_version": 1, "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "measurement_basis": "Saved STEP B-rep readback; no model-source imports.",
        "units": {"length": "mm", "volume": "mm^3"},
        "absolute_tolerances": {"length_mm": LENGTH_TOLERANCE_MM, "volume_mm3": VOLUME_TOLERANCE_MM3},
        "independent_specification": {"baseline": BASELINE, "wide": WIDE,
                                      "pin_diameter_mm": PIN_DIAMETER_MM, "pin_height_mm": PIN_HEIGHT_MM,
                                      "pin_bottom_z_mm": PIN_BOTTOM_Z_MM, "plate_pin_clearance_mm": CLEARANCE_MM},
        "artifacts": [],
    }
    tasks = [
        ("baseline", "STEP/mounting_plate.step", BASELINE),
        ("wide", "STEP/mounting_plate_wide.step", WIDE),
        ("assembly", "STEP/plate_assembly.step", None),
    ]
    for name, relative, spec in tasks:
        result = {"name": name, "file": relative, "checks": []}
        report["artifacts"].append(result)
        try:
            path = ROOT / relative
            data = path.read_bytes()
            result["sha256"] = sha256(data).hexdigest()
            result["file_size_bytes"] = len(data)
            if spec is None:
                _assembly(result, path)
            else:
                _plate(result, read_step(path), spec, name)
        except Exception as exc:
            result["error"] = {"type": type(exc).__name__, "message": str(exc)}
        result["status"] = "pass" if not result.get("error") and all(
            check["status"] == "pass" for check in result["checks"]
        ) and result["checks"] else "fail"
    report["status"] = "pass" if all(item["status"] == "pass" for item in report["artifacts"]) else "fail"
    report["checks_passed"] = sum(check["status"] == "pass" for item in report["artifacts"] for check in item["checks"])
    report["checks_failed"] = sum(check["status"] == "fail" for item in report["artifacts"] for check in item["checks"])
    output = ROOT / "notes" / "validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "passed": report["checks_passed"],
                      "failed": report["checks_failed"], "report": str(output)}, ensure_ascii=False))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
