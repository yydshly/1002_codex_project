"""Parametric ventilated enclosure base; XY centered, underside Z=0; mm."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import glb, srgb, step


LENGTH = 100.0
WIDTH = 70.0
HEIGHT = 30.0
WALL_THICKNESS = 3.0
BOTTOM_THICKNESS = 3.0
OUTER_CORNER_RADIUS = 5.0
INNER_CORNER_RADIUS = OUTER_CORNER_RADIUS - WALL_THICKNESS
BOSS_DIAMETER = 10.0
SCREW_HOLE_DIAMETER = 3.2
SCREW_EDGE_MARGIN = 10.0
SCREW_CENTERS = [(-40.0, -25.0), (40.0, -25.0), (-40.0, 25.0), (40.0, 25.0)]
VENT_WIDTH = 6.0
VENT_HEIGHT = 8.0
VENT_CENTER_Z = 18.0
VENT_X = [-24.0, -12.0, 0.0, 12.0, 24.0]


def screw_centers(length: float, width: float):
    x = length / 2 - SCREW_EDGE_MARGIN
    y = width / 2 - SCREW_EDGE_MARGIN
    return [(-x, -y), (x, -y), (-x, y), (x, y)]


def base_geometry(
    length: float = LENGTH,
    width: float = WIDTH,
    height: float = HEIGHT,
    wall: float = WALL_THICKNESS,
    bottom: float = BOTTOM_THICKNESS,
    outer_corner: float = OUTER_CORNER_RADIUS,
):
    """Build walls, a floor, four bosses and ten through-wall rectangular vents."""
    if not (0 < bottom < height and 0 < wall < outer_corner):
        raise ValueError("Bottom thickness and corner/wall relationship are invalid.")
    if min(length, width) <= 2 * outer_corner:
        raise ValueError("Outer corner radius does not fit the requested footprint.")
    datum = (bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN)
    centered = (bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER)
    body = bd.Box(length, width, height, align=datum)
    body = bd.fillet(body.edges().filter_by(bd.Axis.Z), radius=outer_corner)

    # The cutter goes beyond the open top; its bottom defines the floor datum.
    overtravel = wall / 3
    cavity = bd.Box(length - 2 * wall, width - 2 * wall,
                    height - bottom + overtravel, align=datum)
    cavity = bd.fillet(cavity.edges().filter_by(bd.Axis.Z), radius=outer_corner - wall)
    body = body - bd.Pos(0, 0, bottom) * cavity

    centers = screw_centers(length, width)
    for x, y in centers:
        boss = bd.Pos(x, y, bottom) * bd.Cylinder(BOSS_DIAMETER / 2, height - bottom, align=datum)
        body = body + boss
    for x, y in centers:
        # This screw hole cuts through both its boss and the full floor thickness.
        cutter = bd.Pos(x, y, -overtravel) * bd.Cylinder(
            SCREW_HOLE_DIAMETER / 2, height + 2 * overtravel, align=datum
        )
        body = body - cutter

    for side in (-1, 1):
        sidewall_center = side * (width / 2 - wall / 2)
        for x in VENT_X:
            cutter = bd.Pos(x, sidewall_center, VENT_CENTER_Z) * bd.Box(
                VENT_WIDTH, wall + 2 * overtravel, VENT_HEIGHT, align=centered
            )
            body = body - cutter
    body.label = "enclosure_base"
    body.color = srgb("#416B83")
    return body


@step(out="../STEP/enclosure_base.step")
@glb(out="../GLB/enclosure_base.glb", mesh_tolerance=0.002)
def enclosure_base():
    return base_geometry()


if __name__ == "__main__":
    enclosure_base()
