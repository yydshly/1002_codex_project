"""Verify saved enclosure STEP geometry against independent specifications.

No source-model imports. The point classifier signature was checked in:
https://github.com/gumyr/build123d/blob/v0.11.1/src/build123d/topology/three_d.py
CAD readback/clearance interfaces:
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
LENGTH_TOLERANCE = 1e-5
VOLUME_TOLERANCE = 1e-3
LENGTH, WIDTH, HEIGHT = 100.0, 70.0, 30.0
WALL, FLOOR, OUTER_RADIUS, INNER_RADIUS = 3.0, 3.0, 5.0, 2.0
LID_THICKNESS, LID_BOTTOM = 3.0, 30.5
SCREW_CENTERS = [(-40.0, -25.0), (40.0, -25.0), (-40.0, 25.0), (40.0, 25.0)]
VENT_X = [-24.0, -12.0, 0.0, 12.0, 24.0]


def _close(a, b, tolerance=LENGTH_TOLERANCE):
    return isfinite(float(a)) and abs(float(a) - float(b)) <= tolerance


def _check(result, name, observed, expected, *, units=None, tolerance=None):
    passed = _close(observed, expected, tolerance) if tolerance is not None else observed == expected
    check = {"name": name, "observed": observed, "expected": expected,
             "status": "pass" if passed else "fail"}
    if units is not None:
        check["units"] = units
    if tolerance is not None:
        check["absolute_tolerance"] = tolerance
    result["checks"].append(check)


def _near(result, name, observed, expected, *, volume=False):
    _check(result, name, float(observed), float(expected),
           units="mm^3" if volume else "mm",
           tolerance=VOLUME_TOLERANCE if volume else LENGTH_TOLERANCE)


def _single_solid(result, shape, prefix):
    solids = list(shape.solids())
    _check(result, f"{prefix}.solid_count", len(solids), 1)
    if len(solids) != 1:
        raise ValueError(f"{prefix}: expected exactly one connected solid.")
    solid = solids[0]
    _check(result, f"{prefix}.topology_valid", bool(solid.is_valid), True)
    _check(result, f"{prefix}.positive_volume", solid.volume > 0, True)
    result.setdefault("measurements", {})[f"{prefix}.signed_volume_mm3"] = float(solid.volume)
    return solid


def _envelope(result, solid, prefix, bottom, height):
    box = solid.bounding_box()
    for axis, expected in zip("XYZ", (LENGTH, WIDTH, height)):
        _near(result, f"{prefix}.size_{axis}", getattr(box.size, axis), expected)
    for axis, lower, upper in (("X", -50.0, 50.0), ("Y", -35.0, 35.0), ("Z", bottom, bottom + height)):
        _near(result, f"{prefix}.min_{axis}", getattr(box.min, axis), lower)
        _near(result, f"{prefix}.max_{axis}", getattr(box.max, axis), upper)


def _rings(result, solid, prefix, levels, diameter):
    circles = list(solid.edges().filter_by(bd.GeomType.CIRCLE))
    for level, z in levels:
        rings = sorted(
            [edge for edge in circles if _close(edge.arc_center.Z, z)
             and _close(2 * edge.radius, diameter)
             and _close(edge.length, 2 * pi * edge.radius)],
            key=lambda edge: (round(edge.arc_center.Y, 6), round(edge.arc_center.X, 6)),
        )
        _check(result, f"{prefix}.{level}.full_ring_count", len(rings), 4)
        for index, (edge, center) in enumerate(zip(rings, SCREW_CENTERS), 1):
            _near(result, f"{prefix}.{level}.{index}.diameter", 2 * edge.radius, diameter)
            _near(result, f"{prefix}.{level}.{index}.complete_circumference", edge.length, pi * diameter)
            for axis, expected in zip("XYZ", (*center, z)):
                _near(result, f"{prefix}.{level}.{index}.axis_{axis}", getattr(edge.arc_center, axis), expected)


def _corner_arcs(result, solid, prefix, levels, radius):
    circles = list(solid.edges().filter_by(bd.GeomType.CIRCLE))
    for level, z in levels:
        arcs = sorted(
            [edge for edge in circles if _close(edge.arc_center.Z, z)
             and _close(edge.radius, radius) and _close(edge.length, pi * radius / 2)],
            key=lambda edge: (round(edge.arc_center.Y, 6), round(edge.arc_center.X, 6)),
        )
        _check(result, f"{prefix}.{level}.quarter_arc_count", len(arcs), 4)
        for index, (edge, center) in enumerate(zip(arcs, [(-45.0, -30.0), (45.0, -30.0), (-45.0, 30.0), (45.0, 30.0)]), 1):
            _near(result, f"{prefix}.{level}.{index}.radius", edge.radius, radius)
            for axis, expected in zip("XYZ", (*center, z)):
                _near(result, f"{prefix}.{level}.{index}.center_{axis}", getattr(edge.arc_center, axis), expected)


def _point(result, solid, name, point, expected_material):
    # Points are deliberately inside regions, not on their boundaries.
    observed = bool(solid.is_inside(point, tolerance=LENGTH_TOLERANCE))
    _check(result, name, observed, expected_material)
    result["checks"][-1]["point_mm"] = list(point)


def _base(result, shape, prefix):
    solid = _single_solid(result, shape, prefix)
    _envelope(result, solid, prefix, 0.0, 30.0)
    _rings(result, solid, f"{prefix}.screw_holes", [("bottom", 0.0), ("top", 30.0)], 3.2)
    _rings(result, solid, f"{prefix}.bosses", [("bottom", 3.0), ("top", 30.0)], 10.0)
    _corner_arcs(result, solid, f"{prefix}.outer_corners", [("bottom", 0.0), ("top", 30.0)], 5.0)
    _corner_arcs(result, solid, f"{prefix}.cavity_corners", [("floor", 3.0), ("top", 30.0)], 2.0)
    outer_area = LENGTH * WIDTH - (4 - pi) * OUTER_RADIUS ** 2
    cavity_area = 94.0 * 64.0 - (4 - pi) * INNER_RADIUS ** 2
    expected_volume = outer_area * HEIGHT - cavity_area * 27.0 + 4 * pi * 5.0 ** 2 * 27.0
    expected_volume -= 4 * pi * 1.6 ** 2 * HEIGHT + 10 * 6.0 * 8.0 * WALL
    _near(result, f"{prefix}.analytic_volume", solid.volume, expected_volume, volume=True)

    for index, point in enumerate([(0.0, 0.0, 3.1), (0.0, 0.0, 15.0), (0.0, 0.0, 29.9),
                                   (46.9, 0.0, 15.0), (-46.9, 0.0, 15.0),
                                   (0.0, 31.9, 10.0), (0.0, -31.9, 10.0)], 1):
        _point(result, solid, f"{prefix}.empty_cavity_point_{index}", point, False)
    for index, point in enumerate([(0.0, 0.0, 1.5), (0.0, 0.0, 2.9),
                                   (48.5, 0.0, 15.0), (-48.5, 0.0, 15.0),
                                   (36.0, 33.5, 18.0), (36.0, -33.5, 18.0)], 1):
        _point(result, solid, f"{prefix}.present_floor_or_wall_point_{index}", point, True)
    for index, (x, y) in enumerate(SCREW_CENTERS, 1):
        for z in (1.5, 15.0, 29.9):
            _point(result, solid, f"{prefix}.hole_{index}.empty_axis_z_{z}", (x, y, z), False)
        _point(result, solid, f"{prefix}.boss_{index}.present_material", (x + 3.0, y, 15.0), True)
    for side in (-1, 1):
        for index, x in enumerate(VENT_X, 1):
            for y in (32.2, 33.5, 34.8):
                _point(result, solid, f"{prefix}.vent_{side}_{index}.through_wall_y_{y}",
                       (x, side * y, 18.0), False)
            for suffix, dx, dz, material in (("inside_left", -2.9, 0.0, False),
                                              ("outside_right", 3.1, 0.0, True),
                                              ("inside_top", 0.0, 3.9, False),
                                              ("outside_top", 0.0, 4.1, True)):
                _point(result, solid, f"{prefix}.vent_{side}_{index}.{suffix}",
                       (x + dx, side * 33.5, 18.0 + dz), material)
    return solid


def _lid(result, shape, prefix, bottom=0.0):
    solid = _single_solid(result, shape, prefix)
    _envelope(result, solid, prefix, bottom, 3.0)
    levels = [("bottom", bottom), ("top", bottom + 3.0)]
    _rings(result, solid, f"{prefix}.screw_holes", levels, 3.5)
    _corner_arcs(result, solid, f"{prefix}.outer_corners", levels, 5.0)
    expected_volume = (LENGTH * WIDTH - (4 - pi) * 25.0 - 4 * pi * 1.75 ** 2) * 3.0
    _near(result, f"{prefix}.analytic_volume", solid.volume, expected_volume, volume=True)
    for index, (x, y) in enumerate(SCREW_CENTERS, 1):
        _point(result, solid, f"{prefix}.hole_{index}.empty_axis", (x, y, bottom + 1.5), False)
    _point(result, solid, f"{prefix}.present_center_material", (0.0, 0.0, bottom + 1.5), True)
    return solid


def _assembly(result, path):
    scene = read_scene(path)
    leaves = list(scene.leaves())
    _check(result, "assembly.leaf_count", len(leaves), 2)
    _check(result, "assembly.labels", sorted(leaf.label for leaf in leaves), ["enclosure_base", "enclosure_lid"])
    result["occurrences"] = [{"label": leaf.label, "ref": leaf.ref} for leaf in leaves]
    result["document_hash"] = scene.document_hash
    selected = {}
    for label in ("enclosure_base", "enclosure_lid"):
        matching = [leaf for leaf in leaves if leaf.label == label]
        if len(matching) != 1:
            raise ValueError(f"Expected one saved geometry leaf labelled {label}.")
        selected[label] = scene.resolve(matching[0].ref).shape()
    base = _base(result, selected["enclosure_base"], "assembly.base")
    lid = _lid(result, selected["enclosure_lid"], "assembly.lid", bottom=LID_BOTTOM)
    _check(result, "assembly.solid_count", sum(len(shape.solids()) for shape in selected.values()), 2)
    gap = closest_points(base, lid)
    _near(result, "assembly.minimum_base_lid_gap", gap.distance, 0.5)
    _near(result, "assembly.base_lid_overlap", overlap_volume(base, lid), 0.0, volume=True)
    result["measurements"]["clearance_witness_mm"] = {
        "point_on_base": list(gap.point_a), "point_on_lid": list(gap.point_b), "distance": float(gap.distance),
    }


def main():
    report = {
        "schema_version": 1, "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "basis": "Saved STEP B-rep; independent dimensions; no source-model imports.",
        "absolute_tolerances": {"length_mm": LENGTH_TOLERANCE, "volume_mm3": VOLUME_TOLERANCE},
        "specification": {"outer_size_mm": [100, 70, 30], "wall_mm": 3, "floor_mm": 3,
                          "outer_corner_radius_mm": 5, "cavity_size_mm": [94, 64, 27],
                          "cavity_corner_radius_mm": 2, "boss_diameter_mm": 10,
                          "base_hole_diameter_mm": 3.2, "lid_hole_diameter_mm": 3.5,
                          "hole_centers_mm": SCREW_CENTERS, "vent_size_mm": [6, 8],
                          "vent_x_mm": VENT_X, "vent_center_z_mm": 18,
                          "lid_size_mm": [100, 70, 3], "assembled_lid_bottom_z_mm": 30.5,
                          "base_lid_gap_mm": 0.5},
        "artifacts": [],
    }
    for name, relative, operation in (("base", "STEP/enclosure_base.step", _base),
                                      ("lid", "STEP/enclosure_lid.step", _lid),
                                      ("assembly", "STEP/enclosure_assembly.step", None)):
        result = {"name": name, "file": relative, "checks": []}
        report["artifacts"].append(result)
        try:
            path = ROOT / relative
            data = path.read_bytes()
            result["sha256"] = sha256(data).hexdigest()
            result["size_bytes"] = len(data)
            if operation is None:
                _assembly(result, path)
            else:
                operation(result, read_step(path), name)
        except Exception as exc:
            result["error"] = {"type": type(exc).__name__, "message": str(exc)}
        result["status"] = "pass" if result["checks"] and not result.get("error") and all(
            check["status"] == "pass" for check in result["checks"]
        ) else "fail"
    report["status"] = "pass" if all(result["status"] == "pass" for result in report["artifacts"]) else "fail"
    report["checks_passed"] = sum(check["status"] == "pass" for item in report["artifacts"] for check in item["checks"])
    report["checks_failed"] = sum(check["status"] == "fail" for item in report["artifacts"] for check in item["checks"])
    output = ROOT / "notes" / "enclosure-validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "passed": report["checks_passed"],
                      "failed": report["checks_failed"], "report": str(output)}, ensure_ascii=False))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
