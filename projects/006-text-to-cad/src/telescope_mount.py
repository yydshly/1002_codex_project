from cadgen import step, glb
from telescope_geometry import mount_geometry

@step(out="../STEP/telescope_mount.step")
@glb(out="../GLB/telescope_mount.glb", mesh_tolerance=0.001)
def telescope_mount():
    return mount_geometry()

if __name__ == "__main__":
    telescope_mount()
