"""Render a measured engineering drawing of the baseline mounting plate.

Run after src/mounting_plate.py has produced STEP/mounting_plate.step.
API source:
https://github.com/earthtojake/text-to-cad/blob/main/skills/engineering-drawing/references/sheet-api.md
https://github.com/earthtojake/text-to-cad/blob/main/packages/cadgen/src/cadgen/eng_drawing.py
"""

from __future__ import annotations

from math import isclose
from pathlib import Path
import sys

import cadgen
from cadgen import build123d as bd
from cadgen.eng_drawing import Sheet, eng_drawing


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

# Import design intent without calling the model or rebuilding its geometry.
from mounting_plate import (  # noqa: E402
    CORNER_RADIUS,
    HOLE_CENTERS,
    HOLE_DIAMETER,
    LENGTH,
    THICKNESS,
    WIDTH,
)


MEASUREMENT_TOLERANCE_MM = 1e-5


def _close(actual: float, expected: float) -> bool:
    return isclose(actual, expected, abs_tol=MEASUREMENT_TOLERANCE_MM, rel_tol=0.0)


def _plate_features(part):
    """Read back dimensions and circular openings before annotating them."""
    box = part.bounding_box()
    size = box.size
    for name, actual, expected in (
        ("length", size.X, LENGTH),
        ("width", size.Y, WIDTH),
        ("thickness", size.Z, THICKNESS),
    ):
        if not _close(actual, expected):
            raise ValueError(
                f"Saved STEP {name} is {actual:g} mm; source declares {expected:g} mm. "
                "Regenerate the baseline model before making its drawing."
            )

    circles = list(part.edges().filter_by(bd.GeomType.CIRCLE))
    openings = {}
    for level, z in (("top", box.max.Z), ("bottom", box.min.Z)):
        found = [
            edge
            for edge in circles
            if _close(edge.arc_center.Z, z)
            and _close(2 * edge.radius, HOLE_DIAMETER)
            and _close(edge.length, 2 * 3.141592653589793 * edge.radius)
        ]
        if len(found) != len(HOLE_CENTERS):
            raise ValueError(
                f"Expected {len(HOLE_CENTERS)} complete {level} hole openings; "
                f"saved STEP contains {len(found)}."
            )
        for x, y in HOLE_CENTERS:
            matches = [
                edge for edge in found
                if _close(edge.arc_center.X, x) and _close(edge.arc_center.Y, y)
            ]
            if len(matches) != 1:
                raise ValueError(f"No unique measured {level} hole at ({x}, {y}).")
        openings[level] = found

    corners = [
        edge for edge in circles
        if _close(edge.arc_center.Z, box.max.Z)
        and _close(edge.radius, CORNER_RADIUS)
        and edge.arc_center.X > 0
        and edge.arc_center.Y > 0
    ]
    if len(corners) != 1:
        raise ValueError("Cannot identify the baseline top-right corner arc.")
    return box, openings["top"], corners[0]


@eng_drawing(out="../PDF/mounting_plate_drawing.pdf")
def mounting_plate_drawing():
    part = cadgen.read_step(PROJECT_ROOT / "STEP" / "mounting_plate.step")
    box, holes, corner = _plate_features(part)
    sheet = Sheet(
        "A3",
        scale=1.0,
        title="PARAMETRIC MOUNTING PLATE",
        part_number="CAD-DEMO-006",
        revision="A",
        author="Local CAD experiment",
        units="mm",
        projection="THIRD ANGLE",
        notes=["DIMENSIONS ARE NOMINAL; NO TOLERANCES SPECIFIED."],
    )
    top, front, right, iso = sheet.three_views(part, gap=65.0, iso=True)
    top.overall()

    # Dimension the measured hole-axis spacings from points on the outline.
    # Values remain unset, so the drawing engine measures them from the points.
    xs = sorted({edge.arc_center.X for edge in holes})
    ys = sorted({edge.arc_center.Y for edge in holes})
    top.dim((xs[0], box.max.Y, box.max.Z), (xs[-1], box.max.Y, box.max.Z))
    top.dim((box.min.X, ys[0], box.max.Z), (box.min.X, ys[-1], box.max.Z))

    selected_hole = max(holes, key=lambda edge: (edge.arc_center.X, edge.arc_center.Y))
    hole_center = selected_hole.arc_center
    top.hole(
        (hole_center.X, hole_center.Y, hole_center.Z),
        2 * selected_hole.radius,
        thru=True,
        count=len(holes),
        angle=-45.0,
    )
    arc_center = corner.arc_center
    top.radius((arc_center.X, arc_center.Y, arc_center.Z), corner.radius, angle=45.0)

    # The straight front edge contains these points; its measured height is 5 mm.
    front.dim(
        (0.0, box.min.Y, box.min.Z),
        (0.0, box.min.Y, box.max.Z),
        orientation="v",
        offset=-(box.size.X / 2 + 12.0),
    )
    return sheet


if __name__ == "__main__":
    (PROJECT_ROOT / "PDF").mkdir(parents=True, exist_ok=True)
    mounting_plate_drawing()
