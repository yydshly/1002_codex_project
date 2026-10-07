# ATELIER creative source images

Four real, locally served images support reference sampling and a recognizable still-life working surface. The files are not AI-generated and are not procedural substitutes for photographs or paintings.

| ID and file | Runtime role | Local dimensions | Bytes |
| --- | --- | --- | --- |
| `cat-fur` / `cat-fur.jpg` | Real fur material reference | 2400 × 1800 | 1,107,786 |
| `wheat-cypresses` / `wheat-cypresses.jpg` | Van Gogh directional, curved brushwork reference | 2400 × 1910 | 2,875,465 |
| `river-bridge` / `river-bridge.jpg` | Sisley short, flat water/reflection brushwork reference | 2400 × 1800 | 2,025,950 |
| `still-life` / `still-life.jpg` | Complete Cézanne still-life composition base | 2400 × 1904 | 1,593,289 |

Total image bytes: **7,602,490** (7.25 MiB), below the 8 MiB image budget. Captured Met metadata adds 7,658 bytes. `manifest.json` records each source page, artist, work date, license evidence, original download URL/hash/dimensions and derivative hash/dimensions. All images are 8-bit, three-channel JPEG with an embedded sRGB ICC profile and 4:4:4 chroma sampling. Numerical sRGB conversion follows the source profile; no aesthetic color grade was applied.

The original source bytes were downloaded into memory for hashing and decoding. Only the complete-frame 2400px derivatives are shipped. Their process is EXIF orientation, inside-fit Lanczos3 resampling without upscaling, conversion to sRGB, embedding the sRGB ICC profile and JPEG quality 92 encoding. Every source already had normal orientation. There is no crop, segmentation, recoloring, style generation, content replacement or repainting.

`download.mjs` is a build-time source reproduction utility, not a runtime network dependency. It requires `sharp` 0.35.4 / libvips 8.18.6 for the recorded exact derivatives. Set `CREATIVE_NODE_PACKAGES` to the workspace dependency package directory when using the Codex bundled runtime. A package installed normally in the repository also works for downloading.

Run the offline validation from the workspace root:

```text
node projects/011-solaris/scripts/verify-creative-assets.mjs
```

When `CREATIVE_NODE_PACKAGES` is set, the verifier additionally decodes every pixel with sharp. Otherwise its independent JPEG parser validates complete markers, dimensions, component sampling and the RGB ICC profile along with all local hashes and the captured public-domain records.

All four complete local files passed full-frame visual inspection on 2026-10-05: the root task reviewed the cat and still life, and the asset subagent reviewed Van Gogh and Sisley. The manifest records the reviewer, date and local-file method. Product browser acceptance is separately recorded by the root task; these source reviews do not claim browser or interaction verification. Re-running the source acquisition utility resets newly acquired files to pending review. Suggested source selections and capability boundaries are in `notes/creative-sources.md`.
