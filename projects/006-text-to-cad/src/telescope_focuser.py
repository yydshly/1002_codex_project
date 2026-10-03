from cadgen import step, glb
from telescope_geometry import focuser_geometry

@step(out="../STEP/telescope_focuser.step")
@glb(out="../GLB/telescope_focuser.glb", mesh_tolerance=0.001)
def telescope_focuser():
    return focuser_geometry()

if __name__ == "__main__":
    telescope_focuser()
