"""Agent-authored geometry helpers; every dimension is an educational assumption."""
from __future__ import annotations
from cadgen import build123d as bd, srgb

AXIS_Z = 355.0
PIVOT = (210.0, 0.0, 300.0)


def cylinder_x(radius, length, start_x, y=0.0, z=AXIS_Z):
    shape = bd.Cylinder(radius, length, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    return shape.rotate(bd.Axis.Y, 90).moved(bd.Location((start_x, y, z)))


def ring_x(outer, inner, length, start_x, y=0.0, z=AXIS_Z):
    return cylinder_x(outer / 2, length, start_x, y, z) - cylinder_x(inner / 2, length, start_x, y, z)


def cylinder_y(radius, length, start_y, x=210.0, z=300.0):
    shape = bd.Cylinder(radius, length, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    return shape.rotate(bd.Axis.X, -90).moved(bd.Location((x, start_y, z)))


def named(shape, label, color, opacity=1.0):
    shape.label = label
    shape.color = srgb(color, opacity)
    return shape


def tube_geometry():
    return named(ring_x(86, 80, 420, 0), "optical_tube", "#244C76")


def objective_geometry():
    cell = ring_x(96, 70, 12, -12) + ring_x(96, 86.5, 16, 0)
    cell = named(cell, "objective_cell", "#BDB7A8")
    # Two spherical surfaces provide a curved visual placeholder, not an optical prescription.
    # Intersect placed native solids; build123d 0.11.1 moved compounds may traverse unmoved children.
    half_separation = (160**2 - 35**2)**0.5
    left = bd.Sphere(160).moved(bd.Location((-6 - half_separation, 0, AXIS_Z))).solids()[0]
    right = bd.Sphere(160).moved(bd.Location((-6 + half_separation, 0, AXIS_Z))).solids()[0]
    glass = left & right
    glass = named(glass, "objective_glass", "#78CFDC", 0.38)
    return bd.Compound(children=[cell, glass], label="objective_unit")


def focuser_geometry():
    housing = ring_x(90, 86.5, 16, 404) + ring_x(90, 42, 26, 420)
    return named(housing, "focuser_housing", "#ADB6C0")


def focus_geometry():
    draw = named(ring_x(41.5, 32, 80, 414), "focus_drawtube", "#BD934C")
    ocular = ring_x(48, 41.8, 10, 486) + ring_x(48, 28, 26, 496)
    ocular = named(ocular, "eyepiece_barrel", "#424B58")
    lens = named(cylinder_x(14, 4, 501), "eyepiece_glass", "#9CA8E2", 0.38)
    cup = named(ring_x(52, 28, 12, 522), "eyecup", "#252B34")
    return bd.Compound(children=[draw, ocular, lens, cup], label="focus_unit")


def cradle_geometry():
    cradle = bd.Box(140, 90, 12).moved(bd.Location((210, 0, 302)))
    for x in (154, 254):
        cradle = cradle + ring_x(98, 87, 12, x)
    for start_y in (-67, 45):
        cradle = cradle + cylinder_y(5, 22, start_y)
    return named(cradle, "tube_cradle", "#BA924E")


def mount_geometry():
    datum = (bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN)
    foot = bd.Box(180, 160, 10, align=datum).moved(bd.Location((210, 0, 0)))
    foot = bd.fillet(foot.edges().filter_by(bd.Axis.Z), 8)
    post = bd.Box(40, 40, 203, align=datum).moved(bd.Location((210, 0, 10)))
    pad = bd.Cylinder(38, 12, align=datum).moved(bd.Location((210, 0, 213)))
    pedestal = foot + post + pad
    for x in (145, 275):
        for y in (-55, 55):
            pedestal = pedestal - bd.Cylinder(3.25, 10, align=datum).moved(bd.Location((x, y, 0)))
    pedestal = named(pedestal, "pedestal", "#737F8D")
    yoke = bd.Box(90, 140, 10, align=datum).moved(bd.Location((210, 0, 225)))
    for y in (-60, 60):
        arm = bd.Box(50, 10, 65, align=datum).moved(bd.Location((210, y, 235)))
        cap = cylinder_y(25, 10, y - 5)
        yoke = yoke + arm + cap
    yoke = yoke - cylinder_y(5.25, 140, -70)
    yoke = named(yoke, "mount_yoke", "#48586D")
    return bd.Compound(children=[pedestal, yoke], label="mount_unit")
