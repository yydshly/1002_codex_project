"""Fetch only pinned Python sources, not the upstream repository's large media.

The tree snapshot is checked in; git blob hashes are checked before each write.
No API key or model backend is used.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "notes" / "upstream-snapshot.json"
DEST = ROOT / ".cache" / "upstream"


def git_hash(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def fetch_sources() -> dict:
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8-sig"))
    commit = snapshot["commit"]
    entries = [item for item in snapshot["tree"] if item["type"] == "blob" and
               ((item["path"].startswith("sprite_gen/") and item["path"].endswith(".py"))
                or item["path"] in ("pyproject.toml", "LICENSE", "README.md"))]

    def one(item: dict) -> str:
        target = DEST / item["path"]
        if target.is_file() and git_hash(target.read_bytes()) == item["sha"]:
            return item["path"]
        request = urllib.request.Request(
            f"https://raw.githubusercontent.com/aldegad/sprite-gen/{commit}/{item['path']}",
            headers={"User-Agent": "sprite-gen-offline-demo-source-fetch"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=40) as response:
                    data = response.read()
                if git_hash(data) != item["sha"]:
                    raise ValueError(f"git blob mismatch: {item['path']}")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                return item["path"]
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(attempt + 1)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        paths = sorted(pool.map(one, entries))
    report = {"repository": snapshot["repository"], "commit": commit,
              "pythonModuleCount": sum(p.endswith(".py") for p in paths),
              "fileCount": len(paths), "gitBlobHashesVerified": True,
              "paths": paths}
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "fetch-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    report = fetch_sources()
    print(f"Verified {report['fileCount']} pinned source files ({report['pythonModuleCount']} Python modules).")
