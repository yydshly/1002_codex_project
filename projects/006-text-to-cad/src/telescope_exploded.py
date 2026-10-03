from cadgen import build123d as bd, step, glb
from telescope_tube import telescope_tube
from telescope_objective import telescope_objective
from telescope_focuser import telescope_focuser
from telescope_focus_unit import telescope_focus_unit
from telescope_cradle import telescope_cradle
from telescope_mount import telescope_mount

@step(out="../STEP/telescope_exploded.step")
@glb(out="../GLB/telescope_exploded.glb", mesh_tolerance=0.001)
def telescope_exploded():
    return bd.Compound(children=[
        telescope_mount(),
        telescope_tube().moved(bd.Location((0, -100, 70))),
        telescope_objective().moved(bd.Location((-110, -100, 70))),
        telescope_focuser().moved(bd.Location((80, -100, 70))),
        telescope_focus_unit().moved(bd.Location((160, -100, 70))),
        telescope_cradle().moved(bd.Location((0, 80, 130))),
    ], label="telescope_exploded")

if __name__ == "__main__":
    telescope_exploded()
