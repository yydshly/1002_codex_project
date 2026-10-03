"""Agent specifies placements and motion; cadgen/build123d/OCCT execute them."""
from cadgen import build123d as bd, step, glb, revolute, slider
from telescope_tube import telescope_tube
from telescope_objective import telescope_objective
from telescope_focuser import telescope_focuser
from telescope_focus_unit import telescope_focus_unit
from telescope_cradle import telescope_cradle
from telescope_mount import telescope_mount

KINEMATICS = {
    "mates": [
        revolute("azimuth", parent="#pedestal", child="#mount_yoke", origin=(210, 0, 225), direction=(0, 0, 1), limits=(-135, 135)),
        revolute("altitude", parent="#mount_yoke", child="#optical_assembly", origin=(210, 0, 300), direction=(0, 1, 0), limits=(0, 60)),
        slider("focus", parent="#telescope_tube", child="#focus_unit", origin=(414, 0, 355), direction=(1, 0, 0), limits=(0, 20)),
    ],
    "poses": {"home": {"azimuth": 0, "altitude": 0, "focus": 0},
              "focused": {"azimuth": 0, "altitude": 0, "focus": 20},
              "observing": {"azimuth": 35, "altitude": 25, "focus": 10}},
}

def telescope_geometry(focus_offset=0.0):
    mount = telescope_mount()
    focus = telescope_focus_unit().moved(bd.Location((focus_offset, 0, 0)))
    focus.label = "focus_unit"
    optics = bd.Compound(children=[telescope_tube(), telescope_objective(), telescope_focuser(), focus, telescope_cradle()], label="optical_assembly")
    return bd.Compound(children=[mount, optics], label="telescope_assembly")

@step(out="../STEP/telescope_assembly.step", kinematics=KINEMATICS)
@glb(out="../GLB/telescope_assembly.glb", mesh_tolerance=0.001, kinematics=KINEMATICS)
def telescope_assembly():
    return telescope_geometry()

if __name__ == "__main__":
    telescope_assembly()
