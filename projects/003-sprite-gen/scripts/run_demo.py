"""One-command, key-free reproduction of the sprite-gen processing demo.

Run: python scripts/run_demo.py
Creates an isolated .venv, fetches hash-verified pinned sources, then invokes
the upstream sprite-gen console script. All input art is procedural geometry,
not AI output. Outputs and validation are safe to serve as static assets.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

from fetch_upstream import fetch_sources

ROOT = Path(__file__).resolve().parents[1]
VENV = ROOT / ".venv"
VENV_PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
CLI = VENV / ("Scripts/sprite-gen.exe" if os.name == "nt" else "bin/sprite-gen")
DEMO = ROOT / "web" / "demo"
INPUT = DEMO / "input"
OUTPUT = DEMO / "output"
FRAMES = OUTPUT / "frames"
RUN = ROOT / ".cache" / "demo-run"
LOGS = ROOT / ".cache" / "logs"
VALIDATION = ROOT / "notes" / "validation.json"
STAGES: list[dict] = []


def command(args: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)


def bootstrap() -> None:
    if Path(sys.prefix).resolve() != VENV.resolve():
        if not VENV_PYTHON.exists():
            command([sys.executable, "-m", "venv", str(VENV)])
        raise SystemExit(subprocess.call([str(VENV_PYTHON), str(Path(__file__).resolve()), *sys.argv[1:]], cwd=ROOT))
    expected = {"Pillow": "12.3.0", "numpy": "2.5.3"}
    missing = False
    for name, version in expected.items():
        try:
            missing |= importlib.metadata.version(name) != version
        except importlib.metadata.PackageNotFoundError:
            missing = True
    if missing:
        command([sys.executable, "-m", "pip", "install", "-r", str(ROOT / "scripts" / "requirements-demo.txt")])
    fetch_sources()
    if not CLI.exists():
        command([sys.executable, "-m", "pip", "install", "--no-deps", "-e", str(ROOT / ".cache" / "upstream")])


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cli(stage: str, args: list[str], inputs: list[Path], outputs: list[Path]) -> dict:
    started = time.perf_counter()
    result = subprocess.run([str(CLI), *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    log = LOGS / f"{stage}.txt"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(result.stdout + result.stderr, encoding="utf-8")
    entry = {"stage": stage, "command": "sprite-gen " + " ".join(args),
             "input": [rel(path) for path in inputs], "output": [rel(path) for path in outputs],
             "status": "passed" if result.returncode == 0 else "failed",
             "exitCode": result.returncode, "elapsedSeconds": round(time.perf_counter() - started, 3),
             "measurement": {}, "log": rel(log), "version": "2.20.0"}
    STAGES.append(entry)
    print(f"{stage}: {entry['status']} ({entry['elapsedSeconds']} s)", flush=True)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return entry


def sample() -> None:
    from PIL import Image, ImageDraw
    INPUT.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (384, 320), "#ff00ff")
    phases = [0, 1, 2, 3, 2, 1]
    for i, phase in enumerate(phases):
        cell = Image.new("RGB", (128, 160), "#ff00ff")
        d = ImageDraw.Draw(cell)
        dark, teal, light, accent = "#203640", "#3fbbc2", "#eee9d5", "#ed9248"
        # Antenna and feet keep every phase's vertical bounds constant.
        d.rectangle((61, 20, 67, 37), fill=dark)
        d.rectangle((58, 20, 70, 27), fill=accent)
        d.rectangle((45, 112, 55, 138), fill=dark)
        d.rectangle((70, 112, 80, 138), fill=dark)
        d.rectangle((38, 134, 57, 142), fill=accent)
        d.rectangle((68, 134, 87, 142), fill=accent)
        d.rectangle((37, 70, 89, 118), fill=dark)
        d.rectangle((41, 74, 85, 114), fill=teal)
        d.rectangle((34, 34, 92, 75), fill=dark)
        d.rectangle((38, 38, 88, 69), fill=light)
        d.rectangle((45, 47, 53, 57), fill=dark)
        d.rectangle((72, 47, 80, 57), fill=dark)
        d.rectangle((57, 61, 68, 64), fill=accent)
        d.rectangle((54, 88, 72, 101), fill=dark)
        d.rectangle((58, 92, 68, 97), fill=accent)
        d.rectangle((26, 80, 40, 91), fill=dark)
        d.rectangle((23, 87, 32, 111), fill=dark)
        d.rectangle((21, 105, 35, 118), fill=accent)
        elbow_y = [100, 88, 73, 60][phase]
        hand_x = [107, 112, 111, 103][phase]
        hand_y = [108, 89, 60, 45][phase]
        d.line([(85, 86), (101, elbow_y), (hand_x, hand_y)], fill=dark, width=10)
        d.rectangle((hand_x - 6, hand_y - 6, hand_x + 6, hand_y + 6), fill=accent)
        image.paste(cell, ((i % 3) * 128, (i // 3) * 160))
    image.save(INPUT / "keyed-sheet.png")
    write_json(INPUT / "provenance.json", {
        "kind": "procedural-algorithm-test", "aiGenerated": False,
        "description": "Six simple geometric robot poses drawn by this script with Pillow primitives.",
        "purpose": "Exercise chroma cutout, grid slicing, transparent atlas packing and deterministic palette swap.",
        "grid": [3, 2], "cell": [128, 160], "background": "#ff00ff", "phases": phases,
        "authoringScript": "scripts/run_demo.py", "externalApiCalls": 0})


def measure_rgba(path: Path) -> dict:
    import numpy as np
    from PIL import Image
    with Image.open(path) as image:
        data = np.asarray(image.convert("RGBA"))
        alpha = data[:, :, 3]
        return {"width": image.width, "height": image.height,
                "nontransparentPixels": int(np.count_nonzero(alpha)),
                "transparentPixels": int(np.count_nonzero(alpha == 0)),
                "partialAlphaPixels": int(np.count_nonzero((alpha > 0) & (alpha < 255))),
                "dirtyTransparentPixels": int(np.count_nonzero((alpha == 0) & np.any(data[:, :, :3] != 0, axis=2))),
                "contentBbox": list(image.convert("RGBA").getchannel("A").getbbox() or [])}


def run_demo() -> None:
    import numpy as np
    from PIL import Image

    sample()
    keyed = INPUT / "keyed-sheet.png"
    cutout = OUTPUT / "cutout-sheet.png"
    stage = cli("cutout", ["cutout", rel(keyed), "--out", rel(cutout), "--key", "auto"], [keyed], [cutout])
    stage["measurement"] = measure_rgba(cutout)
    source = np.asarray(Image.open(keyed).convert("RGB"))
    cut = np.asarray(Image.open(cutout).convert("RGBA"))
    key_mask = np.all(source == (255, 0, 255), axis=2)
    assert np.all(cut[:, :, 3][key_mask] == 0), "key background was not removed"
    assert np.all(cut[:, :, 3][~key_mask] > 0), "test figure lost pixels"
    assert stage["measurement"]["dirtyTransparentPixels"] == 0
    stage["measurement"]["backgroundPixelsRemoved"] = int(np.count_nonzero(key_mask))
    stage["measurement"]["allSourceForegroundRetained"] = True

    names = ",".join(f"frame-{i:02d}" for i in range(6))
    stage = cli("slice-sheet", ["slice-sheet", "--sheet", rel(keyed), "--out-dir", rel(FRAMES),
                                "--chroma-key", "magenta", "--grid", "3x2", "--names", names,
                                "--cell-width", "128", "--cell-height", "160", "--baseline-y", "144",
                                "--target-height", "123"], [keyed], [FRAMES])
    frame_paths = sorted(FRAMES.glob("frame-*.png"))
    assert len(frame_paths) == 6
    stage["measurement"] = {"frameCount": len(frame_paths), "frames": [measure_rgba(p) for p in frame_paths]}
    assert all(item["width"] == 128 and item["height"] == 160 and item["nontransparentPixels"] > 0
               for item in stage["measurement"]["frames"])

    stage = cli("unpack-atlas", ["unpack-atlas", "--pngs-dir", rel(FRAMES), "--state-name", "wave",
                                  "--out-dir", rel(RUN), "--force"], [FRAMES], [RUN / "sprite-request.json", RUN / "frames"])
    stage["measurement"] = {"importedFrameCount": len(list((RUN / "frames" / "wave").glob("frame-*.png"))), "state": "wave"}
    assert stage["measurement"]["importedFrameCount"] == 6
    # PNG import deliberately defaults to a still set (2 fps, non-looping).
    # Author the demo's playback recipe explicitly before upstream composition.
    recipe_path = RUN / "sprite-request.json"
    recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
    recipe["character"] = {"id": "geometry-wave-test", "description": "Programmatically drawn geometric robot poses; not AI-generated."}
    recipe["states"]["wave"].update({"fps": 6, "loop": True, "action": "procedural six-pose wave test"})
    write_json(recipe_path, recipe)
    write_json(INPUT / "sprite-request.json", recipe)
    stage["measurement"]["explicitLocalRecipeEdit"] = {"fps": 6, "loop": True, "characterId": "geometry-wave-test"}
    stage = cli("compose-atlas", ["compose-atlas", "--run-dir", rel(RUN), "--atlas", "atlas.png"],
                [RUN / "sprite-request.json", RUN / "frames"], [RUN / "atlas.png", RUN / "manifest.json"])
    for name in ("atlas.png", "manifest.json", "sprite-sheet-alpha.report.json"):
        shutil.copy2(RUN / name, OUTPUT / name)
    manifest = json.loads((OUTPUT / "manifest.json").read_text(encoding="utf-8"))
    rects = manifest["frame_layout"]["rows"]["wave"]
    atlas = Image.open(OUTPUT / "atlas.png").convert("RGBA")
    assert len(rects) == 6
    for rect, path in zip(rects, frame_paths):
        crop = atlas.crop((rect["x"], rect["y"], rect["x"] + rect["w"], rect["y"] + rect["h"]))
        assert np.array_equal(np.asarray(crop), np.asarray(Image.open(path).convert("RGBA")))
    stage["measurement"] = {**measure_rgba(OUTPUT / "atlas.png"), "frameCount": len(rects),
                             "frameRects": rects, "everyAtlasFrameMatchesSource": True}

    roundtrip = ROOT / ".cache" / "roundtrip-run"
    stage = cli("unpack-atlas-roundtrip", ["unpack-atlas", "--atlas", rel(OUTPUT / "atlas.png"),
                                          "--manifest", rel(OUTPUT / "manifest.json"), "--out-dir", rel(roundtrip), "--force"],
                [OUTPUT / "atlas.png", OUTPUT / "manifest.json"], [roundtrip / "frames", roundtrip / "sprite-request.json"])
    rebuilt_paths = sorted((roundtrip / "frames" / "wave").glob("frame-*.png"))
    assert len(rebuilt_paths) == 6
    for actual, expected in zip(rebuilt_paths, frame_paths):
        assert np.array_equal(np.asarray(Image.open(actual).convert("RGBA")), np.asarray(Image.open(expected).convert("RGBA")))
    stage["measurement"] = {"frameCount": len(rebuilt_paths), "allFramesPixelIdentical": True,
                            "layoutSource": "exact manifest rectangles"}

    stage = cli("compose-gif", ["compose-gif", *[rel(path) for path in frame_paths], "--output", rel(OUTPUT / "wave.gif"),
                                "--delay-ticks", "17", "--manifest-output", rel(OUTPUT / "gif-manifest.json"),
                                "--contact-output", rel(OUTPUT / "contact-sheet.png")],
                [FRAMES], [OUTPUT / "wave.gif", OUTPUT / "gif-manifest.json", OUTPUT / "contact-sheet.png"])
    with Image.open(OUTPUT / "wave.gif") as gif:
        durations = []
        transparent_pixels = []
        loop_count = gif.info.get("loop")
        for i in range(gif.n_frames):
            gif.seek(i)
            durations.append(gif.info.get("duration"))
            transparent_pixels.append(int(np.count_nonzero(np.asarray(gif.convert("RGBA"))[:, :, 3] == 0)))
        stage["measurement"] = {"frameCount": gif.n_frames, "width": gif.width, "height": gif.height,
                                "durationsMs": durations, "loop": loop_count,
                                "transparentPixelsPerFrame": transparent_pixels,
                                "transparency": all(count > 0 for count in transparent_pixels)}
        assert gif.n_frames == 6
        assert stage["measurement"]["transparency"], "GIF did not preserve transparent background"

    palette = OUTPUT / "palette.json"
    stage = cli("recolor-palette", ["recolor-palette", "--base", rel(OUTPUT / "atlas.png"), "--out", rel(palette)],
                [OUTPUT / "atlas.png"], [palette])
    palette_data = json.loads(palette.read_text(encoding="utf-8"))
    stage["measurement"] = {"colorCount": palette_data["color_count"]}
    # Identity-map every other colour so the report describes deliberate coverage.
    base_map = {item["hex"]: item["hex"] for item in palette_data["colors"]}
    sunset = {**base_map, "#3fbbc2": "#e7ae58", "#ed9248": "#df6559"}
    violet = {**base_map, "#3fbbc2": "#9f8ddb", "#ed9248": "#f3be72"}
    spec = INPUT / "recolor-spec.json"
    write_json(spec, {"version": 1, "kind": "sprite-gen-recolor", "match": "exact",
                     "variants": [{"name": "sunset", "map": sunset}, {"name": "violet", "map": violet}]})
    stage = cli("recolor", ["recolor", "--base", rel(OUTPUT / "atlas.png"), "--spec", rel(spec),
                            "--manifest", rel(OUTPUT / "manifest.json"), "--out-dir", rel(OUTPUT / "variants")],
                [OUTPUT / "atlas.png", spec, OUTPUT / "manifest.json"], [OUTPUT / "variants"])
    report = json.loads((OUTPUT / "variants" / "recolor.report.json").read_text(encoding="utf-8"))
    measurements = []
    original_arr = np.asarray(atlas)
    for variant in report["variants"]:
        arr = np.asarray(Image.open(OUTPUT / "variants" / variant["sheet"]).convert("RGBA"))
        assert np.array_equal(original_arr[:, :, 3], arr[:, :, 3])
        changed = int(np.count_nonzero(np.any(original_arr[:, :, :3] != arr[:, :, :3], axis=2)))
        assert changed > 0
        measurements.append({"name": variant["name"], "sheet": variant["sheet"], "changedRgbPixels": changed,
                             "alphaPreserved": True, "passthroughPixels": variant["passthrough_pixels"]})
    stage["measurement"] = {"variants": measurements}

    stage = cli("export-aseprite", ["export-aseprite", "--run-dir", rel(RUN), "--output", "exports/aseprite.json"],
                [RUN / "manifest.json"], [RUN / "exports" / "aseprite.json"])
    shutil.copy2(RUN / "exports" / "aseprite.json", OUTPUT / "aseprite.json")
    exported = json.loads((OUTPUT / "aseprite.json").read_text(encoding="utf-8"))
    stage["measurement"] = {"frameCount": len(exported["frames"]), "frameTags": exported["meta"]["frameTags"],
                             "format": "Aseprite JSON array", "nativeAseFile": False}
    assert len(exported["frames"]) == 6

    png_export = OUTPUT / "exported-pngs"
    stage = cli("export-pngs", ["export-pngs", "--run-dir", rel(RUN), "--state", "wave", "--out-dir", rel(png_export)],
                [RUN / "frames", RUN / "sprite-request.json"], [png_export])
    exported_pngs = sorted(png_export.glob("*.png"))
    assert len(exported_pngs) == 6
    for actual, expected in zip(exported_pngs, frame_paths):
        assert np.array_equal(np.asarray(Image.open(actual).convert("RGBA")), np.asarray(Image.open(expected).convert("RGBA")))
    stage["measurement"] = {"frameCount": len(exported_pngs), "allFramesPixelIdentical": True,
                            "filenames": [p.name for p in exported_pngs]}

    write_json(DEMO / "demo.json", {
        "title": "程序构造的六帧挥手机器人", "aiGenerated": False,
        "input": "input/keyed-sheet.png", "cutout": "output/cutout-sheet.png", "atlas": "output/atlas.png",
        "manifest": "output/manifest.json", "gif": "output/wave.gif", "fps": 6,
        "frames": ["output/frames/" + p.name for p in frame_paths],
        "rects": rects, "variants": [{"name": v["name"], "atlas": "output/variants/" + v["sheet"],
                                         "manifest": "output/variants/" + v["name"] + ".manifest.json"}
                                        for v in report["variants"]],
        "exports": {"asepriteJson": "output/aseprite.json", "palette": "output/palette.json",
                    "pngs": ["output/exported-pngs/" + p.name for p in exported_pngs]},
        "scope": "真实运行上游 CLI 的图像后处理；未调用 AI 图像或视频模型。"})


def save_report(status: str, error: str | None = None) -> None:
    source_report = json.loads((ROOT / ".cache" / "upstream" / "fetch-report.json").read_text(encoding="utf-8"))
    output_files = [p for p in DEMO.rglob("*") if p.is_file()]
    payload = {
        "status": status, "validatedAt": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "timezone": "Asia/Shanghai", "repository": source_report["repository"], "commit": source_report["commit"],
        "version": "2.20.0", "sourceMode": "selective pinned raw source download; git blob hashes verified",
        "pythonModuleCount": source_report["pythonModuleCount"],
        "entrypoint": "upstream installed console script sprite-gen (editable install from selective source snapshot)",
        "environment": {"python": sys.version.split()[0], "pythonExecutable": str(Path(sys.executable).resolve()),
                        "isolatedVenv": True, "pillow": importlib.metadata.version("Pillow"),
                        "numpy": importlib.metadata.version("numpy"), "platform": sys.platform},
        "reproduce": "python scripts/run_demo.py", "aiGeneratedInput": False, "modelApiCalls": 0,
        "sample": "Pillow rectangle/line primitives, 6 geometric robot poses, 3x2 magenta keyed sheet",
        "notValidated": ["AI image generation", "AI video generation", "video loop detection", "pixel-unfake", "curation web server", "Godot/Unity/Phaser runtime import"],
        "stages": STAGES, "artifacts": [{"path": rel(p), "bytes": p.stat().st_size,
                                          "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(output_files)],
    }
    if error:
        payload["error"] = error
    write_json(VALIDATION, payload)


if __name__ == "__main__":
    bootstrap()
    try:
        run_demo()
        save_report("passed")
        print("All 10 upstream CLI runs (9 distinct commands) passed. See notes/validation.json and web/demo/demo.json.")
    except Exception as exc:
        save_report("failed", str(exc))
        raise
