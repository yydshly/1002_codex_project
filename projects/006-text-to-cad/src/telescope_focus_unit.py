from cadgen import step, glb
from telescope_geometry import focus_geometry

@step(out="../STEP/telescope_focus_unit.step")
@glb(out="../GLB/telescope_focus_unit.glb", mesh_tolerance=0.001)
def telescope_focus_unit():
    return focus_geometry()

if __name__ == "__main__":
    telescope_focus_unit()
