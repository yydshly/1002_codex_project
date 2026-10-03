from cadgen import step, glb
from telescope_assembly import telescope_geometry

@step(out="../STEP/telescope_extended.step")
@glb(out="../GLB/telescope_extended.glb", mesh_tolerance=0.001)
def telescope_extended():
    return telescope_geometry(focus_offset=20)

if __name__ == "__main__":
    telescope_extended()
