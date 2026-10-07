#!/usr/bin/env python3
"""Read-only local FASHN runtime probe; never downloads or loads model weights.

Official pipeline: https://github.com/fashn-AI/fashn-vton-1.5
Parser model/license: https://huggingface.co/fashn-ai/fashn-human-parser
"""
import argparse
import importlib.metadata
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

PROJECT = Path(__file__).resolve().parents[1]
RUNTIME = PROJECT / ".runtime" / "tryon"
REQUIRED_WEIGHTS = ("model.safetensors", "dwpose/yolox_l.onnx", "dwpose/dw-ll_ucoco_384.onnx")
PACKAGES = {"PIL": "Pillow", "torch": "torch", "torchvision": "torchvision", "fashn_vton": "fashn-vton",
            "fashn_human_parser": "fashn-human-parser", "onnxruntime": "onnxruntime-gpu",
            "transformers": "transformers", "safetensors": "safetensors", "cv2": "opencv-python"}


def configure_offline(hf_home):
    home = str(Path(hf_home).resolve())
    os.environ.update(HF_HOME=home, HF_HUB_CACHE=str(Path(home) / "hub"),
                      HUGGINGFACE_HUB_CACHE=str(Path(home) / "hub"), HF_HUB_OFFLINE="1",
                      TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")


def checkpoint_status(path):
    """Check local readability/header, not tensor validity or provenance."""
    path = Path(path)
    result = {"present": path.is_file(), "bytes": 0, "readable": False, "header_checked": False}
    if not result["present"]:
        return result
    try:
        result["bytes"] = path.stat().st_size
        with path.open("rb") as stream:
            first = stream.read(8)
            if path.suffix == ".safetensors":
                length = int.from_bytes(first, "little")
                if len(first) != 8 or not 2 <= length <= min(16 * 1024 * 1024, result["bytes"] - 8):
                    raise ValueError("invalid safetensors header length")
                header = json.loads(stream.read(length))
                if not isinstance(header, dict) or not any(key != "__metadata__" for key in header):
                    raise ValueError("missing tensor descriptors")
                result["header_checked"] = True
            elif not first:
                raise ValueError("empty weight file")
        result["readable"] = True
    except (OSError, ValueError, TypeError) as error:
        result["error"] = str(error)[:300]
    return result


def parser_cache_status(hf_home):
    repository = Path(hf_home) / "hub" / "models--fashn-ai--fashn-human-parser"
    reference = repository / "refs" / "main"
    result = {"repository": "fashn-ai/fashn-human-parser", "cached": False, "main_reference": False,
              "license": "nvidia-segformer; non-commercial research/evaluation",
              "license_url": "https://github.com/NVlabs/SegFormer/blob/master/LICENSE"}
    try:
        commit = reference.read_text(encoding="utf-8").strip()
        if len(commit) != 40 or any(char not in "0123456789abcdef" for char in commit):
            raise ValueError("invalid local main reference")
        snapshot = repository / "snapshots" / commit
        config = json.loads((snapshot / "config.json").read_text(encoding="utf-8"))
        weights = checkpoint_status(snapshot / "model.safetensors")
        result.update(main_reference=True, revision=commit, weights=weights,
                      cached=isinstance(config, dict) and weights["readable"])
    except (OSError, ValueError, TypeError) as error:
        result["error"] = str(error)[:300]
    return result


def probe_environment(weights_dir=RUNTIME / "weights", hf_home=RUNTIME / "hf-home"):
    configure_offline(hf_home)
    packages = {}
    for module, distribution in PACKAGES.items():
        try:
            available = importlib.util.find_spec(module) is not None
        except (ImportError, ValueError):
            available = False
        try:
            version = importlib.metadata.version(distribution) if available else None
        except importlib.metadata.PackageNotFoundError:
            version = "installed-module; distribution version unavailable" if available else None
        packages[module] = {"available": available, "version": version}
    cuda = {"available": False, "device": None, "bf16_supported": False}
    if packages["torch"]["available"]:
        try:
            import torch
            cuda.update(available=torch.cuda.is_available(), torch_cuda_version=torch.version.cuda)
            if cuda["available"]:
                free, total = torch.cuda.mem_get_info(0)
                cuda.update(device=torch.cuda.get_device_name(0), total_bytes=total, free_bytes=free,
                            bf16_supported=torch.cuda.is_bf16_supported())
        except Exception as error:
            cuda["error"] = f"{type(error).__name__}: {error}"[:500]
    weights = {name: checkpoint_status(Path(weights_dir) / name) for name in REQUIRED_WEIGHTS}
    parser = parser_cache_status(hf_home)
    reasons = []
    missing_packages = [name for name, item in packages.items() if not item["available"]]
    if missing_packages:
        reasons.append("Missing packages: " + ", ".join(missing_packages))
    if not cuda["available"]:
        reasons.append("PyTorch CUDA is unavailable; no CPU generation fallback is enabled.")
    missing_weights = [name for name, item in weights.items() if not item["readable"]]
    if missing_weights:
        reasons.append("Missing/unreadable local weights: " + ", ".join(missing_weights))
    if not parser["cached"]:
        reasons.append("Human-parser main revision is not completely cached locally.")
    driver = None
    executable = shutil.which("nvidia-smi")
    if executable:
        try:
            result = subprocess.run([executable, "--query-gpu=name,memory.total,memory.free,driver_version",
                                     "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5)
            driver = {"exit_code": result.returncode, "report": result.stdout.strip()[:1000]}
        except (OSError, subprocess.TimeoutExpired) as error:
            driver = {"error": str(error)[:300]}
    return {"python": sys.version.split()[0], "python_executable": sys.executable, "packages": packages,
            "cuda": cuda, "driver": driver, "weights": weights, "human_parser": parser,
            "can_submit": not reasons, "pipeline_loaded": False, "reasons": reasons,
            "probe_is_model_validation": False, "network": "offline; local weights only",
            "execution": {"generation": "cuda", "pose_detection": "cpu", "human_parser": "cpu",
                          "checkpoint_loading": "cpu then dtype conversion then cuda"}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights-dir", type=Path, default=RUNTIME / "weights")
    parser.add_argument("--hf-home", type=Path, default=RUNTIME / "hf-home")
    args = parser.parse_args()
    print(json.dumps(probe_environment(args.weights_dir, args.hf_home), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
