"""Parameter variant: length 100 mm, X hole pitch 80 mm, all else retained."""
from __future__ import annotations

from cadgen import glb, step, stl
from mounting_plate import plate_geometry

LENGTH = 100.0
WIDTH = 50.0


@step(out="../STEP/mounting_plate_wide.step")
@stl(out="../STL/mounting_plate_wide.stl", mesh_tolerance=4e-4)
@glb(out="../GLB/mounting_plate_wide.glb", mesh_tolerance=4e-4)
def mounting_plate_wide():
    shape = plate_geometry(LENGTH, WIDTH)
    shape.label = "mounting_plate_wide"
    return shape


if __name__ == "__main__":
    mounting_plate_wide()
