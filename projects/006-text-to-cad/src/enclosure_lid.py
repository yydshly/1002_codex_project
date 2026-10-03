"""Parametric enclosure lid; XY centered, underside Z=0; mm."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import glb, srgb, step

from enclosure_base import LENGTH, OUTER_CORNER_RADIUS, WIDTH, screw_centers


LID_THICKNESS = 3.0
LID_HOLE_DIAMETER = 3.5


def lid_geometry(
    length: float = LENGTH,
    width: float = WIDTH,
    thickness: float = LID_THICKNESS,
    corner_radius: float = OUTER_CORNER_RADIUS,
):
    datum = (bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN)
    body = bd.Box(length, width, thickness, align=datum)
    body = bd.fillet(body.edges().filter_by(bd.Axis.Z), radius=corner_radius)
    overtravel = thickness / 3
    for x, y in screw_centers(length, width):
        cutter = bd.Pos(x, y, -overtravel) * bd.Cylinder(
            LID_HOLE_DIAMETER / 2, thickness + 2 * overtravel, align=datum
        )
        body = body - cutter
    body.label = "enclosure_lid"
    body.color = srgb("#EBC16B")
    return body


@step(out="../STEP/enclosure_lid.step")
@glb(out="../GLB/enclosure_lid.glb", mesh_tolerance=0.002)
def enclosure_lid():
    return lid_geometry()


if __name__ == "__main__":
    enclosure_lid()
