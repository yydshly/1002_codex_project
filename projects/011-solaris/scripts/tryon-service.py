#!/usr/bin/env python3
"""Loopback-only, serial local FASHN VTON 1.5 research service.

No model download, remote-image URL, CPU generation fallback or placeholder
result exists here. Install/download explicitly before starting this process.
API: /health; multipart POST /jobs (person, garment, photo_type); /jobs/<id>;
/jobs/<id>/result.png; /jobs/<id>/metadata.json; POST /jobs/<id>/cancel.
Official inference source: https://github.com/fashn-AI/fashn-vton-1.5
Parser license: https://github.com/NVlabs/SegFormer/blob/master/LICENSE
"""
import argparse
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
import gc
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import inspect
import io
import json
import logging
import os
from pathlib import Path
import re
import socket
import threading
import time
import uuid
import warnings

PROJECT = Path(__file__).resolve().parents[1]
RUNTIME = PROJECT / ".runtime" / "tryon"
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = 21 * 1024 * 1024
MIN_EDGE, MAX_EDGE, MAX_PIXELS = 64, 4096, 12_000_000
JOB_ID = re.compile(r"[0-9a-f]{32}\Z")
DEFAULT_ORIGINS = tuple(f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (4189, 4194, 4195))
TERMINAL = {"succeeded", "failed", "cancelled"}
MIME_FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}

spec = importlib.util.spec_from_file_location("atelier_tryon_probe", Path(__file__).with_name("tryon-probe.py"))
PROBE = importlib.util.module_from_spec(spec)
spec.loader.exec_module(PROBE)


class APIError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass(frozen=True)
class Config:
    weights_dir: Path = RUNTIME / "weights"
    hf_home: Path = RUNTIME / "hf-home"
    jobs_dir: Path = RUNTIME / "jobs"
    steps: int = 20
    seed: int = 42
    max_waiting: int = 2
    max_jobs: int = 24

    def __post_init__(self):
        if self.steps not in (20, 30) or self.seed != 42 or self.max_waiting != 2 or self.max_jobs < 3:
            raise ValueError("Fixed research configuration is steps 20/30, seed 42, one worker and two waiting jobs.")


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def decode_image(data, mime):
    from PIL import Image, ImageOps, UnidentifiedImageError
    if mime not in MIME_FORMATS:
        raise APIError(415, "image_type", "Only JPEG, PNG and WebP uploads are accepted.")
    if not isinstance(data, bytes) or not data or len(data) > MAX_IMAGE_BYTES:
        raise APIError(413, "image_size", "Each image must contain at most 10 MiB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as opened:
                if opened.format != MIME_FORMATS[mime]:
                    raise APIError(415, "image_type", "Upload media type does not match decoded image format.")
                width, height = opened.size
                if min(width, height) < MIN_EDGE or max(width, height) > MAX_EDGE or width * height > MAX_PIXELS:
                    raise APIError(422, "image_dimensions", "Image edges must be 64–4096 pixels, with at most 12 million pixels.")
                if getattr(opened, "n_frames", 1) != 1:
                    raise APIError(422, "animated_image", "Use a single still image, not an animation.")
                opened.load()
                oriented = ImageOps.exif_transpose(opened)
                if oriented.mode in ("RGBA", "LA") or (oriented.mode == "P" and "transparency" in oriented.info):
                    rgba = oriented.convert("RGBA")
                    result = Image.new("RGB", rgba.size, "white")
                    result.paste(rgba, mask=rgba.getchannel("A"))
                else:
                    result = oriented.convert("RGB")
                result.info.clear()
                return result, {"format": opened.format, "uploaded_bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                                "decoded_size": [width, height], "normalized_size": list(result.size), "metadata_stripped": True}
    except APIError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError) as error:
        raise APIError(422, "image_decode", "The uploaded file cannot be decoded as a safe still image.") from error


def parse_multipart(content_type, body):
    if not isinstance(content_type, str) or "\r" in content_type or "\n" in content_type or len(content_type) > 256:
        raise APIError(400, "multipart", "Invalid multipart content type.")
    if not isinstance(body, bytes) or len(body) > MAX_REQUEST_BYTES:
        raise APIError(413, "request_size", "The complete upload must be at most 21 MiB.")
    try:
        encoded_type = content_type.encode("ascii", "strict")
    except UnicodeEncodeError as error:
        raise APIError(400, "multipart", "Invalid multipart content type.") from error
    message = BytesParser(policy=policy.default).parsebytes(b"Content-Type: " + encoded_type + b"\r\nMIME-Version: 1.0\r\n\r\n" + body)
    if message.get_content_type() != "multipart/form-data" or not message.is_multipart() or message.defects:
        raise APIError(400, "multipart", "Use multipart/form-data with both image files.")
    boundary = message.get_boundary()
    try:
        final_boundary = ("--" + (boundary or "") + "--").encode("ascii")
    except UnicodeEncodeError as error:
        raise APIError(400, "multipart", "Invalid multipart boundary.") from error
    if not boundary or len(boundary) > 70 or not body.rstrip().endswith(final_boundary):
        raise APIError(400, "multipart", "Multipart upload is incomplete.")
    fields = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if part.is_multipart() or part.defects or part.get("Content-Transfer-Encoding") or part.get_content_disposition() != "form-data" or name not in ("person", "garment", "photo_type") or name in fields:
            raise APIError(400, "fields", "Supply exactly person, garment and optional photo_type; URL/path/settings fields are not accepted.")
        payload = part.get_payload(decode=True)
        if not isinstance(payload, bytes):
            raise APIError(400, "multipart", "Multipart fields must contain byte payloads.")
        if name == "photo_type":
            if part.get_filename() is not None or len(payload) > 16:
                raise APIError(400, "photo_type", "photo_type must be model or flat-lay.")
            try:
                fields[name] = payload.decode("ascii")
            except UnicodeDecodeError as error:
                raise APIError(400, "photo_type", "photo_type must be model or flat-lay.") from error
        else:
            if part.get_filename() is None:
                raise APIError(400, "files", "Both image inputs must be uploaded files, not paths or URLs.")
            fields[name] = decode_image(payload, part.get_content_type())
    if not {"person", "garment"}.issubset(fields):
        raise APIError(400, "files", "Upload both a person and a garment image.")
    photo_type = fields.get("photo_type", "flat-lay")
    if photo_type not in ("model", "flat-lay"):
        raise APIError(400, "photo_type", "photo_type must be model or flat-lay.")
    return fields["person"], fields["garment"], photo_type


def create_low_memory_pipeline(weights_dir, hf_home, progress=None):
    """Official sampler/preprocessing; change only component placement/loading."""
    PROBE.configure_offline(hf_home)
    import torch
    from torch.nn.attention import SDPBackend, sdpa_kernel
    from fashn_vton import TryOnPipeline
    from fashn_vton.dwpose import DWposeDetector
    from fashn_vton.dwpose.wholebody import Wholebody
    import onnxruntime as ort
    from fashn_vton.tryon_mmdit import TryOnModel
    from fashn_vton.utils import load_checkpoint
    from fashn_human_parser import FashnHumanParser
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; this service has no CPU generation fallback.")
    required = {"person_image", "garment_image", "category", "garment_photo_type", "num_samples", "num_timesteps", "seed", "guidance_scale", "skip_cfg_last_n_steps", "segmentation_free"}
    if not required.issubset(inspect.signature(TryOnPipeline.__call__).parameters):
        raise RuntimeError("Installed FASHN pipeline signature does not match the registered v1.5 interface.")

    class LowMemoryPipeline(TryOnPipeline):
        def _setup_tryon_model(self):
            # Avoid a second 3.62 GiB float32 parameter allocation in system RAM.
            # Strict assignment binds the official checkpoint tensors unchanged.
            with torch.device("meta"):
                self.tryon_model = TryOnModel()
            state = load_checkpoint(str(Path(self.weights_dir) / "model.safetensors"), device="cpu")
            self.tryon_model.load_state_dict(state, strict=True, assign=True)
            del state
            gc.collect()
            if any(tensor.is_meta for tensor in list(self.tryon_model.parameters()) + list(self.tryon_model.buffers())):
                raise RuntimeError("Official checkpoint left uninitialized model tensors.")
            self.tryon_model.to(device=self.device, dtype=self.inference_dtype).eval()

        def _setup_pose_model(self):
            options = ort.SessionOptions()
            options.enable_cpu_mem_arena = False
            options.enable_mem_pattern = False
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            class CPUWholebody(Wholebody):
                def __init__(inner):
                    directory = Path(self.weights_dir) / "dwpose"
                    inner.session_det = ort.InferenceSession(str(directory / "yolox_l.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
                    inner.session_pose = ort.InferenceSession(str(directory / "dw-ll_ucoco_384.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
            self.pose_model = DWposeDetector.__new__(DWposeDetector)
            self.pose_model.pose_estimation = CPUWholebody()

        def _setup_hp_model(self):
            self.hp_model = FashnHumanParser(device="cpu")

        def __call__(self, *args, **kwargs):
            try:
                if self.pose_model is None:
                    self._setup_pose_model()
                if self.hp_model is None:
                    self._setup_hp_model()
                return super().__call__(*args, **kwargs)
            finally:
                # Also release partially rebuilt helpers when preprocessing
                # fails before reaching the sampling boundary.
                self.pose_model = None
                self.hp_model = None
                gc.collect()

        def _sample(self, **kwargs):
            # Preprocessing has completed. Its CPU networks/ORT arenas are not
            # needed during generation; release their memory before GPU work.
            self.pose_model = None
            self.hp_model = None
            gc.collect()
            torch.cuda.empty_cache()
            # Report genuinely completed official forward calls, without changing
            # Euler/CFG operations, timesteps, tensor precision or resolution.
            total, completed = kwargs.get("num_timesteps", 30), 0
            original = self.tryon_model.forward_for_cfg
            def measured(*args, **values):
                nonlocal completed
                result = original(*args, **values)
                if self.progress_callback:
                    # CUDA launches asynchronously; a reported step means its
                    # actual forward computation finished, not just dispatched.
                    torch.cuda.synchronize(self.device)
                completed += 1
                if self.progress_callback:
                    self.progress_callback("sampling", completed, total)
                return result
            self.tryon_model.forward_for_cfg = measured
            try:
                torch.cuda.reset_peak_memory_stats(self.device)
                # The registered Windows GPU passed both real small tensor
                # layouts. Prevent a silent NxN MATH allocation on this laptop.
                with sdpa_kernel(backends=[SDPBackend.EFFICIENT_ATTENTION]):
                    return super()._sample(**kwargs)
            finally:
                # Restore the class method; storing a bound method on its own
                # instance creates a cycle which can retain GPU weights.
                del self.tryon_model.forward_for_cfg
                self.last_gpu_stats = {
                    "peak_allocated_mib": round(torch.cuda.max_memory_allocated(self.device) / 2**20, 2),
                    "peak_reserved_mib": round(torch.cuda.max_memory_reserved(self.device) / 2**20, 2),
                    "scope": "sampling in this process; excludes other applications",
                }

    pipeline = LowMemoryPipeline(weights_dir=str(weights_dir), device="cuda")
    pipeline.progress_callback = progress
    pipeline.execution_profile = {"generation": "cuda", "pose_detection": "cpu", "human_parser": "cpu",
                                  "checkpoint_loading": "meta construction; strict CPU checkpoint assignment then cuda",
                                  "attention": "PyTorch CUDA EFFICIENT_ATTENTION only; no MATH fallback",
                                  "preprocessor_lifetime": "CPU networks released before sampling; recreated for next input",
                                  "pose_session_memory": "CPU arena/pattern disabled; intra/inter threads 2/1; original Wholebody and detector operations",
                                  "dtype": str(pipeline.inference_dtype), "model_resolution": [576, 864],
                                  "algorithm": "official Euler sampler/CFG; unchanged"}
    return pipeline


class JobManager:
    def __init__(self, config=Config(), runner_factory=None, probe=None, start_worker=True):
        self.config = config
        self.root = Path(config.jobs_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self._factory = runner_factory or create_low_memory_pipeline
        self._probe = probe or (lambda: PROBE.probe_environment(config.weights_dir, config.hf_home))
        self._condition = threading.Condition(threading.RLock())
        self._jobs, self._queue, self._runner = {}, deque(), None
        self._active, self._closed, self.last_error = None, False, None
        self._probe_value, self._probe_time = None, 0
        self.worker = None
        if start_worker:
            self.worker = threading.Thread(target=self._work, name="atelier-serial-tryon", daemon=True)
            self.worker.start()

    def directory(self, job_id):
        if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
            raise APIError(404, "job_id", "Unknown job identifier.")
        directory = (self.root / job_id).resolve()
        if directory.parent != self.root:
            raise APIError(404, "job_id", "Unknown job identifier.")
        return directory

    def _metadata(self, job):
        result = {key: value for key, value in job.items() if not key.startswith("_")}
        now = job.get("_finished_monotonic", time.monotonic())
        result["elapsed_seconds"] = round(now - job["_monotonic"], 2)
        if "_started_monotonic" in job:
            result["execution_seconds"] = round(now - job["_started_monotonic"], 2)
            result["queue_seconds"] = round(job["_started_monotonic"] - job["_monotonic"], 2)
        if job["status"] == "succeeded":
            result["result_url"] = f"/jobs/{job['id']}/result.png"
            result["metadata_url"] = f"/jobs/{job['id']}/metadata.json"
        return result

    def _persist(self, job):
        directory = self.directory(job["id"])
        temporary = directory / "metadata.tmp"
        temporary.write_text(json.dumps(self._metadata(job), ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, directory / "metadata.json")

    def health(self, fresh=False):
        with self._condition:
            if fresh or self._probe_value is None or time.monotonic() - self._probe_time > 10:
                self._probe_value = self._probe()
                self._probe_time = time.monotonic()
            value = dict(self._probe_value)
            value.update(service="atelier-local-tryon", pipeline_loaded=self._runner is not None,
                         ready=self._runner is not None and value.get("can_submit", False),
                         active_job=self._active, waiting_jobs=len(self._queue), waiting_limit=self.config.max_waiting,
                         stored_jobs=len(self._jobs), job_store_limit=self.config.max_jobs,
                         fixed_settings={"category": "tops", "steps": self.config.steps, "seed": self.config.seed, "samples": 1},
                         last_error=self.last_error, job_registry="current process session; files retained locally")
            if self._runner is not None:
                value["execution"] = self._runner.execution_profile
            return value

    def submit(self, person, garment, photo_type):
        if photo_type not in ("model", "flat-lay"):
            raise APIError(400, "photo_type", "photo_type must be model or flat-lay.")
        if not self.health().get("can_submit", False):
            raise APIError(503, "environment", "Local CUDA/packages/weights/parser cache are not ready. Inspect /health; no fallback result is created.")
        with self._condition:
            if self._closed:
                raise APIError(503, "closed", "The local worker is shutting down.")
            if len(self._queue) >= self.config.max_waiting:
                raise APIError(429, "queue_full", "One job runs at a time, with at most two waiting jobs.")
            if len(self._jobs) >= self.config.max_jobs:
                raise APIError(429, "job_store_full", "The local job store is full; restart with a fresh private jobs directory or remove retained local jobs explicitly.")
            job_id = uuid.uuid4().hex
            directory = self.directory(job_id)
            directory.mkdir()
            job = {"id": job_id, "status": "queued", "created_at": utc_now(), "updated_at": utc_now(),
                   "_monotonic": time.monotonic(), "progress": {"stage": "queued", "completed_steps": 0, "total_steps": self.config.steps},
                   "settings": {"model": "FASHN VTON 1.5", "category": "tops", "garment_photo_type": photo_type,
                                "num_samples": 1, "num_timesteps": self.config.steps, "seed": self.config.seed,
                                "guidance_scale": 1.5, "skip_cfg_last_n_steps": 1, "segmentation_free": True},
                   "inputs": {"person": person[1], "garment": garment[1]},
                   "licenses": {"tryon": "Apache-2.0", "human_parser": "nvidia-segformer; research/evaluation only",
                                "human_parser_url": "https://github.com/NVlabs/SegFormer/blob/master/LICENSE"}}
            try:
                person[0].save(directory / "person.png", format="PNG")
                garment[0].save(directory / "garment.png", format="PNG")
                self._persist(job)
            except Exception:
                for filename in ("person.png", "garment.png", "metadata.tmp", "metadata.json"):
                    (directory / filename).unlink(missing_ok=True)
                directory.rmdir()
                raise
            self._jobs[job_id] = job
            self._queue.append(job_id)
            self._condition.notify()
            return self._metadata(job)

    def get(self, job_id):
        self.directory(job_id)
        with self._condition:
            if job_id not in self._jobs:
                raise APIError(404, "job_id", "Unknown job identifier.")
            return self._metadata(self._jobs[job_id])

    def cancel(self, job_id):
        self.get(job_id)
        with self._condition:
            job = self._jobs[job_id]
            if job["status"] != "queued":
                raise APIError(409, "not_queued", "Only a queued job can be cancelled; running inference cannot be safely interrupted.")
            self._queue.remove(job_id)
            self._update(job_id, "cancelled")
            return self._metadata(job)

    def _update(self, job_id, stage, completed=None, total=None, **extra):
        with self._condition:
            job = self._jobs[job_id]
            if completed is None:
                completed = job["progress"]["completed_steps"] if stage in TERMINAL else 0
            job.update(status=stage, updated_at=utc_now(), **extra)
            if stage in TERMINAL:
                job["_finished_monotonic"] = time.monotonic()
            job["progress"] = {"stage": stage, "completed_steps": completed, "total_steps": total or self.config.steps}
            self._persist(job)

    def artifact(self, job_id, name):
        job = self.get(job_id)
        if name == "result.png" and job["status"] != "succeeded":
            raise APIError(409, "result_pending", "No generated image exists for this job state.")
        if name not in ("result.png", "metadata.json"):
            raise APIError(404, "artifact", "Unknown job artifact.")
        path = self.directory(job_id) / name
        if not path.is_file():
            raise APIError(404, "artifact", "Job artifact is missing.")
        return path

    def _work(self):
        while True:
            with self._condition:
                self._condition.wait_for(lambda: self._queue or self._closed)
                if self._closed:
                    return
                job_id = self._queue.popleft()
                self._active = job_id
                self._jobs[job_id].update(started_at=utc_now(), _started_monotonic=time.monotonic())
            try:
                from PIL import Image
                self._update(job_id, "loading" if self._runner is None else "preprocessing")
                callback = lambda stage, done, total: self._update(job_id, stage, done, total)
                if self._runner is None:
                    self._runner = self._factory(self.config.weights_dir, self.config.hf_home, callback)
                self._runner.progress_callback = callback
                self._update(job_id, "preprocessing", execution=self._runner.execution_profile)
                directory = self.directory(job_id)
                with Image.open(directory / "person.png") as person, Image.open(directory / "garment.png") as garment:
                    output = self._runner(person_image=person.convert("RGB"), garment_image=garment.convert("RGB"),
                                          category="tops", garment_photo_type=self._jobs[job_id]["settings"]["garment_photo_type"],
                                          num_samples=1, num_timesteps=self.config.steps, seed=self.config.seed,
                                          guidance_scale=1.5, skip_cfg_last_n_steps=1, segmentation_free=True)
                if not getattr(output, "images", None) or len(output.images) != 1 or not isinstance(output.images[0], Image.Image):
                    raise RuntimeError("The inference pipeline did not return exactly one generated PIL image.")
                generated = output.images[0].convert("RGB")
                if min(generated.size) < 1 or max(generated.size) > MAX_EDGE or generated.width * generated.height > MAX_PIXELS:
                    raise RuntimeError("The inference output dimensions are invalid.")
                self._update(job_id, "saving", self.config.steps)
                generated.save(directory / "result.tmp", format="PNG")
                os.replace(directory / "result.tmp", directory / "result.png")
                content = (directory / "result.png").read_bytes()
                self._update(job_id, "succeeded", self.config.steps,
                             gpu_memory=getattr(self._runner, "last_gpu_stats", None),
                             output={"width": generated.width, "height": generated.height, "bytes": len(content),
                                     "sha256": hashlib.sha256(content).hexdigest(), "mime": "image/png"})
            except Exception as error:
                logging.exception("Local try-on job %s failed", job_id)
                message = f"{type(error).__name__}: {error}"[:1500]
                self.last_error = message
                directory = self.directory(job_id)
                for name in ("result.tmp", "result.png"):
                    (directory / name).unlink(missing_ok=True)
                try:
                    self._update(job_id, "failed", error={"type": type(error).__name__, "message": message})
                except OSError:
                    logging.exception("Failed to persist failure metadata for %s", job_id)
                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except ImportError:
                    pass
            finally:
                with self._condition:
                    self._active = None
                    self._condition.notify_all()

    def close(self):
        with self._condition:
            self._closed = True
            for job_id in list(self._queue):
                self._update(job_id, "cancelled", error={"type": "shutdown", "message": "Service shut down before inference started."})
            self._queue.clear()
            self._condition.notify_all()


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, manager, allowed_origins=DEFAULT_ORIGINS):
        if address[0] != "127.0.0.1":
            raise ValueError("The try-on server binds only to 127.0.0.1.")
        for origin in allowed_origins:
            if not re.fullmatch(r"http://(?:localhost|127\.0\.0\.1):[0-9]{1,5}", origin):
                raise ValueError("Only explicit HTTP loopback frontend origins may be allowed.")
        self.manager, self.allowed_origins = manager, frozenset(allowed_origins)
        self._slots = threading.BoundedSemaphore(4)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self._slots.acquire(blocking=False):
            request.sendall(b"HTTP/1.1 503 Busy\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
            self.shutdown_request(request)
            return
        super().process_request(request, client_address)

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def _guard(self):
        if len(self.headers.get_all("Host", [])) != 1 or len(self.headers.get_all("Origin", [])) > 1:
            raise APIError(400, "request_headers", "Ambiguous host or origin headers are not accepted.")
        host = self.headers.get("Host", "")
        port = self.server.server_address[1]
        if host not in (f"localhost:{port}", f"127.0.0.1:{port}"):
            raise APIError(403, "host", "Only the loopback service host is accepted.")
        origin = self.headers.get("Origin")
        if origin is not None and origin not in self.server.allowed_origins:
            raise APIError(403, "origin", "This frontend origin is not allowed.")
        if origin is None and self.headers.get("Sec-Fetch-Site") == "cross-site":
            raise APIError(403, "origin", "Cross-site requests require an explicitly allowed origin.")
        if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) > 1:
            raise APIError(400, "request_framing", "Chunked or ambiguous request bodies are not accepted.")

    def _send(self, status, content, mime="application/json; charset=utf-8"):
        if not isinstance(content, bytes):
            content = json.dumps(content, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        origin = self.headers.get("Origin")
        if origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        if content:
            self.wfile.write(content)
        self.close_connection = True

    def _body(self):
        length = self.headers.get("Content-Length")
        if length is None or not length.isascii() or not length.isdecimal():
            raise APIError(411, "content_length", "A bounded Content-Length is required.")
        if len(length) > 8:
            raise APIError(413, "request_size", "The complete upload must be at most 21 MiB.")
        size = int(length)
        if size > MAX_REQUEST_BYTES:
            raise APIError(413, "request_size", "The complete upload must be at most 21 MiB.")
        body = self.rfile.read(size)
        if len(body) != size:
            raise APIError(400, "truncated", "The upload body is incomplete.")
        return body

    def _dispatch(self):
        self._guard()
        if self.command == "OPTIONS":
            if self.headers.get("Access-Control-Request-Method", "GET") not in ("GET", "POST"):
                raise APIError(405, "method", "Only GET and POST are supported.")
            return self._send(204, b"")
        if self.path == "/health" and self.command == "GET":
            return self._send(200, self.server.manager.health())
        if self.path == "/jobs" and self.command == "POST":
            inputs = parse_multipart(self.headers.get("Content-Type", ""), self._body())
            return self._send(202, self.server.manager.submit(*inputs))
        match = re.fullmatch(r"/jobs/([0-9a-f]{32})(?:/(result\.png|metadata\.json|cancel))?", self.path)
        if not match:
            raise APIError(404, "route", "Unknown local try-on route; URL/path input is not supported.")
        job_id, suffix = match.groups()
        if self.command == "POST" and suffix == "cancel":
            if self._body():
                raise APIError(400, "cancel_body", "Cancellation accepts an empty request body only.")
            return self._send(200, self.server.manager.cancel(job_id))
        if self.command != "GET" or suffix == "cancel":
            raise APIError(405, "method", "This route does not support this method.")
        if suffix is None:
            return self._send(200, self.server.manager.get(job_id))
        path = self.server.manager.artifact(job_id, suffix)
        return self._send(200, path.read_bytes(), "image/png" if suffix == "result.png" else "application/json; charset=utf-8")

    def _handle(self):
        try:
            self._dispatch()
        except APIError as error:
            self._send(error.status, {"error": {"code": error.code, "message": error.message}})
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            self.close_connection = True
        except Exception:
            logging.exception("Local request failed")
            self._send(500, {"error": {"code": "internal", "message": "Local service failed; no result was generated for this request."}})

    do_GET = do_POST = do_OPTIONS = _handle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4197)
    parser.add_argument("--weights-dir", type=Path, default=RUNTIME / "weights")
    parser.add_argument("--hf-home", type=Path, default=RUNTIME / "hf-home")
    parser.add_argument("--jobs-dir", type=Path, default=RUNTIME / "jobs")
    parser.add_argument("--steps", type=int, choices=(20, 30), default=20)
    parser.add_argument("--allowed-origin", action="append", default=None)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("port must be 1024–65535")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    PROBE.configure_offline(args.hf_home)
    config = Config(args.weights_dir, args.hf_home, args.jobs_dir, args.steps)
    manager = JobManager(config)
    server = LocalServer(("127.0.0.1", args.port), manager, args.allowed_origin or DEFAULT_ORIGINS)
    print(json.dumps({"service": f"http://127.0.0.1:{args.port}", "steps": args.steps, "seed": 42,
                      "privacy": "local files and offline inference; no third-party image upload",
                      "ready_check": "/health", "license": "research/evaluation; parser has separate NVIDIA terms"}), flush=True)
    try:
        server.serve_forever(poll_interval=.25)
    except KeyboardInterrupt:
        pass
    finally:
        manager.close()
        server.server_close()


if __name__ == "__main__":
    main()
