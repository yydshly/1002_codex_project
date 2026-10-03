"""Compose two independently generated parts with a visible 0.5 mm lid gap."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import glb, step

from enclosure_base import HEIGHT, enclosure_base
from enclosure_lid import enclosure_lid


LID_GAP = 0.5


@step(out="../STEP/enclosure_assembly.step")
@glb(out="../GLB/enclosure_assembly.glb", mesh_tolerance=0.002)
def enclosure_assembly():
    base = enclosure_base()
    base.label = "enclosure_base"
    lid = enclosure_lid().moved(bd.Location((0.0, 0.0, HEIGHT + LID_GAP)))
    lid.label = "enclosure_lid"
    return bd.Compound(children=[base, lid], label="enclosure_assembly")


if __name__ == "__main__":
    enclosure_assembly()
