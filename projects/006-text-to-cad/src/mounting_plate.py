"""Four through holes and four R3 vertical corner fillets; units: mm."""
from __future__ import annotations

from cadgen import build123d as bd
from cadgen import glb, srgb, step, stl

LENGTH = 80.0
WIDTH = 50.0
THICKNESS = 5.0
CORNER_RADIUS = 3.0
HOLE_DIAMETER = 5.5
HOLE_EDGE_MARGIN = 10.0
HOLE_CENTERS = [(-30.0, -15.0), (30.0, -15.0), (-30.0, 15.0), (30.0, 15.0)]


def hole_centers(length: float, width: float) -> list[tuple[float, float]]:
    x, y = length / 2 - HOLE_EDGE_MARGIN, width / 2 - HOLE_EDGE_MARGIN
    return [(-x, -y), (x, -y), (-x, y), (x, y)]


def plate_geometry(length: float = LENGTH, width: float = WIDTH):
    centered = (bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER)
    body = bd.Box(length, width, THICKNESS, align=centered)
    body = bd.fillet(body.edges().filter_by(bd.Axis.Z), radius=CORNER_RADIUS)
    for x, y in hole_centers(length, width):
        tool = bd.Pos(x, y, 0) * bd.Cylinder(
            HOLE_DIAMETER / 2, THICKNESS * 2, align=centered
        )
        body = body - tool
    body.label = "mounting_plate"
    body.color = srgb("#148A9C")
    return body


@step(out="../STEP/mounting_plate.step")
@stl(out="../STL/mounting_plate.stl", mesh_tolerance=4e-4)
@glb(out="../GLB/mounting_plate.glb", mesh_tolerance=4e-4)
def mounting_plate():
    return plate_geometry()


if __name__ == "__main__":
    mounting_plate()
