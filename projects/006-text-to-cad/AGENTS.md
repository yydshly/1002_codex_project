# text-to-cad capability lab

Use the project-local upstream skills in `.agents/skills/` for CAD work.
Run Python and cadgen through `uv run`; dependencies are pinned in `uv.lock`.
Model sources live in `src/`, saved CAD in format folders, reusable measurements
in `checks/`, and human review images in `assets/`. All model dimensions are mm.

After a geometry change, regenerate its declared outputs, read back the saved
STEP for the relevant measurements, and render and inspect a snapshot. Check
artifact geometry rather than assuming source constants establish correctness.
Record assumptions and distinguish geometry tests from manufacturing approval.
Preserve `notes/installation.json` and the upstream MIT license when updating
the local skill snapshot. Do not start prints or order parts during this lab.
