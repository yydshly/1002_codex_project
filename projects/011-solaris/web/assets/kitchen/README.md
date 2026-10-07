# Four genuine whole-food models

The runtime reads `manifest.json` and loads `models/{sourceId}/{sourceId}.gltf`. Each original glTF references its local binary geometry and three local 1024×1024 JPEG maps. The four source models use Poly Haven's official **1k glTF** variant, retaining all original geometry, node transforms, source PBR material values and texture bytes.

`manifest.models` supplies stable `id` values (`avocado`, `onion`, `lemon`, `apple`), source IDs, localized names, `file` / `gltf` paths relative to this directory, official sources, authors, numerical bounds after source transforms, triangle counts and `centerAndGroundTranslation`. Measurements are in glTF metres and describe these individual assets, not the weight, serving size or dimensions of every real specimen. Keep the source node transformations; do not apply another Z-to-Y rotation.

The assets are whole, uncut foods with their rind / skin. Use them for ingredient selection, arranging and container composition. A full avocado model does not represent diced avocado, and a whole onion does not represent peeled slices or finished salad. No replacement spheres, generated food textures or website preview images are used.

`download.mjs` is a build-time provenance utility. It selects the API's 1k glTF and checks every byte count and official MD5 before saving, then records SHA-256 and bounds. It can use project `.cache` metadata or the public API. Re-run from the workspace with `node projects/011-solaris/web/assets/kitchen/download.mjs` when explicitly refreshing assets; ordinary product startup does not run it. `scripts/verify-kitchen-assets.mjs` independently verifies all files, JPEG dimensions, complete local glTF references, indices, vertices, material/image counts and bounds without network.

Actual browser load, appearance and mouse-gesture acceptance are recorded separately by the product. See `LICENSE.md` for official source credits.
