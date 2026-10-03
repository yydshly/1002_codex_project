from cadgen import step, glb
from telescope_geometry import objective_geometry

@step(out="../STEP/telescope_objective.step")
@glb(out="../GLB/telescope_objective.glb", mesh_tolerance=0.001)
def telescope_objective():
    return objective_geometry()

if __name__ == "__main__":
    telescope_objective()
