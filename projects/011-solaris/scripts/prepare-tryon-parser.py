#!/usr/bin/env python3
"""Prepare the pinned official FASHN parser cache without Torch or inference.

Downloads only config.json and model.safetensors used by FashnHumanParser's
SegformerForSemanticSegmentation.from_pretrained call. Its preprocessing is
implemented in the wrapper; no AutoImageProcessor files or other models are
needed. All files stay under the project's ignored .runtime/tryon directory.
Run with --verify-only to recheck hashes and real offline HF cache resolution.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import time
from unittest.mock import patch

import requests

PROJECT = Path(__file__).resolve().parents[1]
RUNTIME = PROJECT / ".runtime" / "tryon"
REPOSITORY = "fashn-ai/fashn-human-parser"
REVISION = "1f80c34dbab321c5730dda5c3fea279fd3e97498"
API_URL = f"https://huggingface.co/api/models/{REPOSITORY}/revision/{REVISION}?blobs=true"
LICENSE_URL = "https://github.com/NVlabs/SegFormer/blob/master/LICENSE"
WRAPPER_SOURCE = "https://github.com/fashn-AI/fashn-human-parser/blob/main/src/fashn_human_parser/parser.py"
REGISTERED = {
    "config.json": {"bytes": 1654, "blob_id": "26f3fa06a94402acb07b6b5f9f2895f5b6d3a568"},
    "model.safetensors": {"bytes": 256146352, "blob_id": "4ff579502242ce3f7e0ed1b843bf3372d47dced9",
                          "sha256": "e43c8c8a9b04f28798f0a4630cf18caa2cdb27a0d454fae43a5716e6f7078244"},
}
CHUNK_BYTES = 32 * 1024 * 1024
EVIDENCE = RUNTIME / "downloads" / "parser-verified.json"
SOURCE_EVIDENCE = RUNTIME / "downloads" / "parser-source-metadata.json"


def contained(path):
    path = Path(path).resolve()
    if RUNTIME.resolve() not in path.parents:
        raise ValueError("Parser preparation writes only below .runtime/tryon.")
    return path


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for data in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(data)
    return digest.hexdigest()


def verify_file(path, name):
    expected = REGISTERED[name]
    path = contained(path)
    if path.stat().st_size != expected["bytes"]:
        raise ValueError(f"Unexpected {name} byte length.")
    digest = sha256(path)
    if "sha256" in expected:
        if digest != expected["sha256"]:
            raise ValueError(f"{name} failed official LFS SHA256 verification.")
    else:
        data = path.read_bytes()
        blob_id = hashlib.sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()
        if blob_id != expected["blob_id"]:
            raise ValueError(f"{name} failed official Git blob verification.")
    return {"name": name, "bytes": expected["bytes"], "sha256": digest, "git_blob_id": expected["blob_id"],
            "integrity_source": "official API LFS SHA256" if "sha256" in expected else "official API Git blob SHA1; local SHA256 also recorded",
            "source": f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{name}?download=true"}


def fetch_metadata():
    response = requests.get(API_URL, timeout=(20, 45))
    response.raise_for_status()
    metadata = response.json()
    if metadata.get("sha") != REVISION or metadata.get("cardData", {}).get("license_name") != "nvidia-segformer":
        raise ValueError("Official parser commit/license metadata differs from the registered research model.")
    entries = {entry["rfilename"]: entry for entry in metadata["siblings"]}
    for name, registered in REGISTERED.items():
        entry = entries[name]
        if entry["size"] != registered["bytes"] or entry["blobId"] != registered["blob_id"]:
            raise ValueError(f"Official {name} metadata differs from the pinned registration.")
        if "sha256" in registered and entry.get("lfs", {}).get("sha256") != registered["sha256"]:
            raise ValueError(f"Official {name} LFS hash differs from the pinned registration.")
    SOURCE_EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_EVIDENCE.write_text(json.dumps({"api": API_URL, "response": metadata}, indent=2) + "\n", encoding="utf-8")
    return metadata


def download(name, blob):
    if blob.is_file():
        try:
            return verify_file(blob, name)
        except ValueError:
            pass
    expected = REGISTERED[name]
    url = f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{name}?download=true"
    blob.parent.mkdir(parents=True, exist_ok=True)
    if name == "config.json":
        response = requests.get(url, timeout=(20, 45))
        response.raise_for_status()
        temporary = contained(blob.with_suffix(".preparing"))
        temporary.write_bytes(response.content)
        evidence = verify_file(temporary, name)
        temporary.replace(blob)
        return evidence
    size = expected["bytes"]
    with requests.get(url + "&atelier_parser_probe=1", headers={"Range": "bytes=0-0"}, stream=True, timeout=(20, 45)) as response:
        response.raise_for_status()
        if response.status_code != 206 or response.headers.get("Content-Range") != f"bytes 0-0/{size}":
            raise ValueError("Official parser CDN did not honor the registered range size.")
    parts = contained(RUNTIME / "downloads" / "parser-model.safetensors.parts")
    parts.mkdir(parents=True, exist_ok=True)
    ranges = [(index, start, min(size - 1, start + CHUNK_BYTES - 1)) for index, start in enumerate(range(0, size, CHUNK_BYTES))]

    def fetch_part(item):
        index, start, end = item
        target = contained(parts / f"{index:04d}.part")
        temporary = contained(parts / f"{index:04d}.partial")
        length = end - start + 1
        if target.is_file() and target.stat().st_size == length:
            return length
        for attempt in range(5):
            try:
                # A new resolver URL on retry avoids stale signed CDN redirects.
                request_url = url + f"&atelier_parser_part={index}-{attempt}-{time.time_ns()}"
                with requests.get(request_url, headers={"Range": f"bytes={start}-{end}"}, stream=True, timeout=(20, 45)) as response:
                    response.raise_for_status()
                    if response.status_code != 206 or response.headers.get("Content-Range") != f"bytes {start}-{end}/{size}":
                        raise ValueError("Unexpected official parser CDN range response.")
                    with temporary.open("wb") as handle:
                        for data in response.iter_content(1024 * 1024):
                            handle.write(data)
                if temporary.stat().st_size != length:
                    raise ValueError("Incomplete parser chunk.")
                temporary.replace(target)
                return length
            except (requests.RequestException, OSError, ValueError) as error:
                print(json.dumps({"component": "human-parser", "chunk": index, "retry": attempt + 1,
                                  "error_type": type(error).__name__}), flush=True)
                if attempt == 4:
                    raise
                time.sleep(1 + attempt)

    completed, started = 0, time.monotonic()
    with ThreadPoolExecutor(max_workers=2) as pool:
        for future in as_completed([pool.submit(fetch_part, item) for item in ranges]):
            completed += future.result()
            print(json.dumps({"component": "human-parser", "received_bytes": completed, "total_bytes": size,
                              "elapsed_seconds": round(time.monotonic() - started, 1)}), flush=True)
    assembled = contained(blob.with_suffix(".preparing"))
    with assembled.open("wb") as handle:
        for index, _, _ in ranges:
            with contained(parts / f"{index:04d}.part").open("rb") as part:
                for data in iter(lambda: part.read(8 * 1024 * 1024), b""):
                    handle.write(data)
    evidence = verify_file(assembled, name)
    assembled.replace(blob)
    for index, _, _ in ranges:
        contained(parts / f"{index:04d}.part").unlink()
    return evidence


def snapshot_file(blob, target):
    target = contained(target)
    if target.exists():
        try:
            verify_file(target, target.name)
            return "already-verified"
        except ValueError:
            target.unlink()
    try:
        os.link(blob, target)
        return "hardlink"
    except OSError:
        # Windows without symlink privileges can use ordinary snapshot files;
        # HF cache lookup supports the same public layout.
        import shutil
        shutil.copyfile(blob, target)
        return "copy"


def cache_validation(hf_home):
    hf_home = contained(hf_home)
    repository = hf_home / "hub" / "models--fashn-ai--fashn-human-parser"
    if (repository / "refs" / "main").read_text(encoding="utf-8").strip() != REVISION:
        raise ValueError("Offline parser main reference differs from the fixed commit.")
    snapshot = repository / "snapshots" / REVISION
    verified = [verify_file(snapshot / name, name) for name in REGISTERED]
    config = json.loads((snapshot / "config.json").read_text(encoding="utf-8"))
    if config.get("model_type") != "segformer" or config.get("architectures") != ["SegformerForSemanticSegmentation"] or len(config.get("id2label", {})) != 18:
        raise ValueError("Parser config does not match the registered 18-class SegFormer model.")
    model = snapshot / "model.safetensors"
    with model.open("rb") as handle:
        header_length = int.from_bytes(handle.read(8), "little")
        if not 2 <= header_length <= 16 * 1024 * 1024:
            raise ValueError("Invalid parser safetensors header size.")
        header = json.loads(handle.read(header_length))
    tensors = {name: value for name, value in header.items() if name != "__metadata__"}
    data_bytes = model.stat().st_size - 8 - header_length
    if not tensors or max(value["data_offsets"][1] for value in tensors.values()) != data_bytes:
        raise ValueError("Parser tensor data boundaries do not match the file.")
    spec = importlib.util.spec_from_file_location("atelier_parser_offline_probe", Path(__file__).with_name("tryon-probe.py"))
    probe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(probe)
    probe.configure_offline(hf_home)
    from huggingface_hub import hf_hub_download
    resolved = {}
    with patch.object(socket.socket, "connect", side_effect=AssertionError("Offline validation attempted a network connection")):
        for name in REGISTERED:
            path = hf_hub_download(REPOSITORY, name, revision="main", cache_dir=str(hf_home / "hub"), local_files_only=True)
            if Path(path).resolve() != (snapshot / name).resolve():
                raise ValueError("HF resolved a different snapshot.")
            resolved[name] = str(Path(path).resolve())
    status = probe.parser_cache_status(hf_home)
    if not status["cached"] or status["revision"] != REVISION:
        raise ValueError("Backend parser cache probe did not accept the real snapshot.")
    return {"files": verified, "hf_offline_lookup": resolved, "network_connection_guard": "passed; socket.connect blocked during actual HF local_files_only lookup",
            "backend_parser_cache": status, "safetensors_header": {"tensor_count": len(tensors), "data_bytes": data_bytes,
                "dtypes": dict(Counter(value["dtype"] for value in tensors.values()))},
            "config": {"model_type": config["model_type"], "architectures": config["architectures"], "labels": len(config["id2label"])},
            "validation_scope": "source-integrity, config/header and real offline cache resolution; no Torch/model loading/inference"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hf-home", type=Path, default=RUNTIME / "hf-cache")
    parser.add_argument("--verify-only", action="store_true", help="read/hash/cache lookup only; make no network requests or downloads")
    args = parser.parse_args()
    hf_home = contained(args.hf_home)
    if args.verify_only:
        evidence = cache_validation(hf_home)
        print(json.dumps({"status": "verified-offline", "repository": REPOSITORY, "revision": REVISION, **evidence}, indent=2), flush=True)
        return
    fetch_metadata()
    repository = contained(hf_home / "hub" / "models--fashn-ai--fashn-human-parser")
    snapshot = contained(repository / "snapshots" / REVISION)
    snapshot.mkdir(parents=True, exist_ok=True)
    storage = {}
    for name, registered in REGISTERED.items():
        blob = contained(repository / "blobs" / registered.get("sha256", registered["blob_id"]))
        download(name, blob)
        storage[name] = snapshot_file(blob, snapshot / name)
    reference = contained(repository / "refs" / "main")
    reference.parent.mkdir(parents=True, exist_ok=True)
    temporary = contained(reference.with_name("main.preparing"))
    temporary.write_text(REVISION, encoding="utf-8")
    temporary.replace(reference)
    validation = cache_validation(hf_home)
    evidence = {"component": "human-parser", "status": "verified", "repository": REPOSITORY, "revision": REVISION,
                "metadata_source": API_URL, "hf_home": str(hf_home), "snapshot_storage": storage,
                "license": "nvidia-segformer; non-commercial research/evaluation only", "license_url": LICENSE_URL,
                "wrapper_source": WRAPPER_SOURCE, "wrapper_distribution": "fashn-human-parser==0.1.1",
                "wrapper_dependency_source": "https://pypi.org/pypi/fashn-human-parser/0.1.1/json",
                "wrapper_dependencies": ["torch>=2.2", "transformers>=4.30", "opencv-python>=4.8", "numpy>=1.20", "pillow>=9.0"],
                "runtime_files": list(REGISTERED), "image_processor_file_required": False,
                "service_argument": f"--hf-home {hf_home}", **validation}
    EVIDENCE.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, indent=2), flush=True)


if __name__ == "__main__":
    main()
