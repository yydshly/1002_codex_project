from cadgen import step, glb
from telescope_geometry import tube_geometry

@step(out="../STEP/telescope_tube.step")
@glb(out="../GLB/telescope_tube.glb", mesh_tolerance=0.001)
def telescope_tube():
    return tube_geometry()

if __name__ == "__main__":
    telescope_tube()
