from cadgen import step, glb
from telescope_geometry import cradle_geometry

@step(out="../STEP/telescope_cradle.step")
@glb(out="../GLB/telescope_cradle.glb", mesh_tolerance=0.001)
def telescope_cradle():
    return cradle_geometry()

if __name__ == "__main__":
    telescope_cradle()
