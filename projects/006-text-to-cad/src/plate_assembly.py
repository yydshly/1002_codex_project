"""Plate plus four generic pins: a measured assembly, not a purchased component."""
from __future__ import annotations

from cadgen import build123d as bd
from cadgen import glb, srgb, step
from mounting_plate import HOLE_CENTERS, THICKNESS, mounting_plate

PIN_DIAMETER = 4.5
PIN_HEIGHT = 12.0


@step(out="../STEP/plate_assembly.step")
@glb(out="../GLB/plate_assembly.glb", mesh_tolerance=4e-4)
def plate_assembly():
    plate = mounting_plate()
    centered = (bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER)
    pin = bd.Cylinder(PIN_DIAMETER / 2, PIN_HEIGHT, align=centered)
    pin.color = srgb("#E6A34B")
    pins = []
    for index, (x, y) in enumerate(HOLE_CENTERS, start=1):
        occurrence = pin.moved(bd.Location((x, y, (PIN_HEIGHT - THICKNESS) / 2)))
        occurrence.label = f"pin_{index}"
        pins.append(occurrence)
    return bd.Compound(children=[plate, *pins], label="plate_assembly")


if __name__ == "__main__":
    plate_assembly()
