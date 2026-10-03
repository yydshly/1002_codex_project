# Model catalog

All coordinates and dimensions are in millimeters. These are generic capability
experiments, with no specified loads, materials or production tolerances.

| Entrypoint | Purpose | Main artifact |
| --- | --- | --- |
| mounting_plate.py | 80 x 50 x 5, R3 corners, four diameter 5.5 through holes | STEP/mounting_plate.step |
| mounting_plate_wide.py | Same factory, 100 mm length and 80 mm X hole pitch | STEP/mounting_plate_wide.step |
| plate_assembly.py | Baseline plus four generic diameter 4.5 pins | STEP/plate_assembly.step |
| enclosure_base.py | Hollow shell, mounting posts and ten side vents | STEP/enclosure_base.step |
| enclosure_lid.py | Separately modeled rounded lid with four through holes | STEP/enclosure_lid.step |
| enclosure_assembly.py | Base and lid with 0.5 mm separation | STEP/enclosure_assembly.step |
| telescope_tube.py | Hollow 420 mm tube, OD86/ID80 | STEP/telescope_tube.step |
| telescope_objective.py | Objective cell and curved glass geometry placeholder | STEP/telescope_objective.step |
| telescope_focuser.py | Fixed focus housing | STEP/telescope_focuser.step |
| telescope_focus_unit.py | Drawtube, ocular barrel, glass placeholder and eyecup | STEP/telescope_focus_unit.step |
| telescope_cradle.py | Two collars, saddle and pivot pins | STEP/telescope_cradle.step |
| telescope_mount.py | Pedestal and movable yoke | STEP/telescope_mount.step |
| telescope_assembly.py | 11 solids, azimuth/altitude/focus declarations | STEP/telescope_assembly.step |
| telescope_extended.py | Saved 20 mm focus-extension configuration | STEP/telescope_extended.step |
| telescope_exploded.py | Separated functional groups for explanation | STEP/telescope_exploded.step |

Run an entrypoint with `uv run --frozen python src/<name>.py` from the project root.
Models declare the other formats they maintain; the viewer reads the saved files.
The separate `scripts/drawing_demo.py` derives a PDF drawing from the baseline STEP.
Use `checks/verify_models.py` and `checks/verify_enclosure.py` for saved-file checks.

`telescope_geometry.py` is a shared factory module. Telescope checks are in
`checks/verify_telescope.py`; its full walkthrough and assumptions are in
[the telescope demo](../notes/telescope-demo.md). Lens geometry is not an optical prescription.
