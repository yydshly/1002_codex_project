# Carnegie Mansion · exterior architectural model

`CooperHewitt_print.stl` is an unchanged CC0 Smithsonian model downloaded from an openly redistributable mirror on 2026-10-05. Its SHA-256 matches the mirror's published value. The official museum model page identifies 3D Systems as the scanner / producer and gives a June 2014 collection date.

This is the simplified, hollow **exterior printing model**, not the museum's textured FBX data, a complete interior, or a current-condition survey. It supplies genuine architectural geometry for ATELIER's landmark exploration, lighting and knowledge-hotspot interactions. Its single binary STL has 343,281 triangles and no external resource dependency, texture, original material, skin or animation.

The source file has no encoded length unit or coordinate-system metadata. Actual browser renders of the front, opposite side and roof confirmed that Y represents the building height, and that the viewer's 2× display scale, X/Z centering and Y grounding keep the model upright. This observation does not establish a geographic direction or a physical unit. Numerical bounds are documented in `manifest.json`; the viewer treats them as display coordinates. An architectural height or distance cannot be measured from this STL without a verified physical reference. No source textures or geographic coordinates are synthesized. Full browser acceptance is recorded separately in `notes/landmark-validation.json`.

Some original faces have zero normals / nearly zero area. They are preserved rather than silently repairing or replacing the model. `scripts/verify-landmark-assets.mjs` verifies the original binary structure, every finite vertex and normal, numeric bounds and SHA-256. Load / visual / performance acceptance is tracked separately by the product's validation record.

See `LICENSE.md` for credits and official source links. `hotspots.json` contains the separately source-checked educational content.
