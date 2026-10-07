#!/usr/bin/env python3
"""Local service boundary tests. Injected test runners are not model evidence."""
from dataclasses import replace
from contextlib import contextmanager, nullcontext
import builtins
import hashlib
import http.client
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from PIL import Image

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "tryon-service.py"
SPEC = importlib.util.spec_from_file_location("atelier_tryon_service_tested", SCRIPT)
SERVICE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SERVICE
SPEC.loader.exec_module(SERVICE)


def image_bytes(format="PNG", size=(96, 144), color="#847165", **kwargs):
    stream = io.BytesIO()
    Image.new("RGB", size, color).save(stream, format=format, **kwargs)
    return stream.getvalue()


def input_image():
    return SERVICE.decode_image(image_bytes(), "image/png")


def multipart(extra=(), filename="photo.png"):
    boundary = "atelier-local-boundary"
    parts = [("person", filename, "image/png", image_bytes()), ("garment", filename, "image/png", image_bytes())] + list(extra)
    result = b""
    for name, file, mime, payload in parts:
        result += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"".encode()
        if file is not None:
            result += f"; filename=\"{file}\"".encode()
        result += f"\r\nContent-Type: {mime}\r\n\r\n".encode() + payload + b"\r\n"
    result += f"--{boundary}--\r\n".encode()
    return f"multipart/form-data; boundary={boundary}", result


def wait_status(manager, job_id, statuses=SERVICE.TERMINAL, timeout=3):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state = manager.get(job_id)
        if state["status"] in statuses:
            return state
        time.sleep(.01)
    raise AssertionError(f"Job did not reach {statuses}: {manager.get(job_id)}")


class TestRunner:
    execution_profile = {"generation": "test-double", "pose_detection": "test-double",
                         "human_parser": "test-double", "not_model_evidence": True}
    def __init__(self, block=None, failure=False):
        self.progress_callback = None
        self.block, self.failure = block, failure
        self.calls, self.maximum_running, self.running = [], 0, 0
    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        self.running += 1
        self.maximum_running = max(self.maximum_running, self.running)
        try:
            if self.block:
                self.block.wait(timeout=3)
            if self.failure:
                self.progress_callback("sampling", 3, kwargs["num_timesteps"])
                raise RuntimeError("intentional test runner failure; not model inference")
            self.progress_callback("sampling", 1, kwargs["num_timesteps"])
            self.progress_callback("sampling", kwargs["num_timesteps"], kwargs["num_timesteps"])
            return SimpleNamespace(images=[Image.new("RGB", (80, 120), "#557799")])
        finally:
            self.running -= 1


class LowMemoryLifecycleTests(unittest.TestCase):
    """Exercise the production factory without Torch, weights or CUDA work."""

    @contextmanager
    def fake_components(self):
        state = SimpleNamespace(parser_loads=0, pose_sessions=0,
                                fail_parser_load=False, sample_calls=0)

        class FakeModel:
            def forward_for_cfg(self, *args, **kwargs):
                return {"test_double": True}

        class FakePipeline:
            def __init__(self, weights_dir, device):
                self.weights_dir, self.device = weights_dir, device
                self.inference_dtype = "test-double; not model evidence"
                self.tryon_model = FakeModel()
                self.fail_preprocessing = False
                self._setup_pose_model()
                self._setup_hp_model()

            def __call__(self, person_image=None, garment_image=None, category="tops",
                         garment_photo_type="flat-lay", num_samples=1,
                         num_timesteps=20, seed=42, guidance_scale=1.5,
                         skip_cfg_last_n_steps=1, segmentation_free=True):
                if self.fail_preprocessing:
                    raise RuntimeError("intentional test preprocessing failure")
                return self._sample(num_timesteps=num_timesteps)

            def _sample(self, **kwargs):
                if self.pose_model is not None or self.hp_model is not None:
                    raise AssertionError("CPU helpers survived the sampling boundary")
                state.sample_calls += 1
                return self.tryon_model.forward_for_cfg("test-double input")

        class FakeParser:
            def __init__(self, device):
                state.parser_loads += 1
                if state.fail_parser_load:
                    raise ImportError("intentional test parser setup failure")

        def fake_session(*args, **kwargs):
            state.pose_sessions += 1
            return SimpleNamespace(test_double=True)

        cuda = SimpleNamespace(is_available=lambda: True, empty_cache=Mock(),
                               synchronize=Mock(), reset_peak_memory_stats=Mock(),
                               max_memory_allocated=lambda device: 3 * 2**20,
                               max_memory_reserved=lambda device: 4 * 2**20)
        components = {
            "torch": {"cuda": cuda},
            "torch.nn": {},
            "torch.nn.attention": {"SDPBackend": SimpleNamespace(EFFICIENT_ATTENTION="fake"),
                                   "sdpa_kernel": lambda **kwargs: nullcontext()},
            "fashn_vton": {"TryOnPipeline": FakePipeline},
            "fashn_vton.dwpose": {"DWposeDetector": type("FakeDetector", (), {})},
            "fashn_vton.dwpose.wholebody": {"Wholebody": type("FakeWholebody", (), {})},
            "fashn_vton.tryon_mmdit": {"TryOnModel": FakeModel},
            "fashn_vton.utils": {"load_checkpoint": Mock()},
            "fashn_human_parser": {"FashnHumanParser": FakeParser},
            "onnxruntime": {"SessionOptions": SimpleNamespace, "InferenceSession": fake_session},
        }
        modules = {}
        for name, exports in components.items():
            modules[name] = ModuleType(name)
            modules[name].__dict__.update(exports)
        with patch.dict(sys.modules, modules), patch.object(SERVICE.PROBE, "configure_offline"):
            runner = SERVICE.create_low_memory_pipeline(Path("test-only-weights"), Path("test-only-cache"))
            yield runner, state, cuda

    def test_preprocessing_and_partial_helper_setup_failure_release_and_rebuild_helpers(self):
        with self.fake_components() as (runner, state, cuda):
            original_model = runner.tryon_model
            runner.fail_preprocessing = True
            with self.assertRaisesRegex(RuntimeError, "preprocessing failure"):
                runner()
            self.assertIsNone(runner.pose_model)
            self.assertIsNone(runner.hp_model)
            self.assertEqual(state.sample_calls, 0)

            runner.fail_preprocessing = False
            state.fail_parser_load = True
            with self.assertRaisesRegex(ImportError, "parser setup failure"):
                runner()
            self.assertIsNone(runner.pose_model)
            self.assertIsNone(runner.hp_model)
            self.assertEqual(state.sample_calls, 0)

            state.fail_parser_load = False
            self.assertEqual(runner(), {"test_double": True})
            self.assertEqual((state.pose_sessions, state.parser_loads), (6, 3))
            self.assertIs(runner.tryon_model, original_model)
            self.assertIsNone(runner.pose_model)
            self.assertIsNone(runner.hp_model)
            self.assertEqual(state.sample_calls, 1)

    def test_peak_reset_failure_restores_forward_method_and_next_call_recovers(self):
        with self.fake_components() as (runner, state, cuda):
            original_function = runner.tryon_model.forward_for_cfg.__func__
            cuda.reset_peak_memory_stats.side_effect = RuntimeError("intentional peak reset failure")
            with self.assertRaisesRegex(RuntimeError, "peak reset failure"):
                runner()
            self.assertNotIn("forward_for_cfg", runner.tryon_model.__dict__)
            self.assertIs(runner.tryon_model.forward_for_cfg.__func__, original_function)
            self.assertIsNone(runner.pose_model)
            self.assertIsNone(runner.hp_model)
            self.assertEqual(state.sample_calls, 0)

            cuda.reset_peak_memory_stats.side_effect = None
            self.assertEqual(runner(), {"test_double": True})
            self.assertEqual(state.sample_calls, 1)
            self.assertNotIn("forward_for_cfg", runner.tryon_model.__dict__)
            self.assertIs(runner.tryon_model.forward_for_cfg.__func__, original_function)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.managers, self.servers = [], []

    def tearDown(self):
        for server in self.servers:
            server.shutdown()
            server.server_close()
        for manager in self.managers:
            manager.close()
            if manager.worker:
                manager.worker.join(timeout=3)
        self.temporary.cleanup()

    def manager(self, runner=None, worker=False, ready=True, **overrides):
        config = SERVICE.Config(jobs_dir=self.root / f"jobs-{len(self.managers)}", **overrides)
        runner = runner or TestRunner()
        factory = lambda *args: runner
        manager = SERVICE.JobManager(config, runner_factory=factory,
                                     probe=lambda: {"can_submit": ready, "cuda": {"available": ready}, "reasons": [] if ready else ["test-unavailable"]},
                                     start_worker=worker)
        self.managers.append(manager)
        return manager

    def server(self, manager):
        server = SERVICE.LocalServer(("127.0.0.1", 0), manager)
        threading.Thread(target=server.serve_forever, kwargs={"poll_interval": .01}, daemon=True).start()
        self.servers.append(server)
        return server

    def request(self, server, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=3)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        data, result = response.read(), (response.status, dict(response.getheaders()))
        connection.close()
        return result[0], result[1], data

    def assert_api_error(self, code, function, *args):
        with self.assertRaises(SERVICE.APIError) as raised:
            function(*args)
        self.assertEqual(raised.exception.code, code)
        return raised.exception

    def test_decode_accepts_verified_still_formats_and_strips_exif_with_orientation(self):
        for format, mime in (("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp")):
            raw = image_bytes(format)
            image, metadata = SERVICE.decode_image(raw, mime)
            self.assertEqual(image.mode, "RGB")
            self.assertEqual(image.size, (96, 144))
            self.assertEqual(metadata["sha256"], hashlib.sha256(raw).hexdigest())
            self.assertFalse(image.info)
        exif = Image.Exif(); exif[274] = 6
        image, metadata = SERVICE.decode_image(image_bytes("JPEG", exif=exif), "image/jpeg")
        self.assertEqual(image.size, (144, 96))
        self.assertEqual(metadata["decoded_size"], [96, 144])
        self.assertEqual(metadata["normalized_size"], [144, 96])
        self.assertFalse(image.getexif())

    def test_decode_enforces_format_size_dimensions_and_no_animated_images(self):
        self.assert_api_error("image_type", SERVICE.decode_image, image_bytes(), "image/jpeg")
        self.assert_api_error("image_type", SERVICE.decode_image, image_bytes(), "image/svg+xml")
        self.assert_api_error("image_decode", SERVICE.decode_image, b"not an image", "image/png")
        self.assert_api_error("image_size", SERVICE.decode_image, b"x" * (SERVICE.MAX_IMAGE_BYTES + 1), "image/png")
        for size in ((63, 144), (4097, 64), (4000, 3100)):
            self.assert_api_error("image_dimensions", SERVICE.decode_image, image_bytes(size=size), "image/png")
        animated = io.BytesIO()
        frames = [Image.new("RGB", (96, 144), color) for color in ("red", "blue")]
        frames[0].save(animated, format="WEBP", save_all=True, append_images=frames[1:], duration=50, loop=0)
        self.assert_api_error("animated_image", SERVICE.decode_image, animated.getvalue(), "image/webp")

    def test_alpha_images_are_composited_to_rgb_and_not_preserved_as_hidden_metadata(self):
        image = Image.new("RGBA", (96, 144), (255, 0, 0, 0)); buffer = io.BytesIO(); image.save(buffer, format="PNG")
        decoded, _ = SERVICE.decode_image(buffer.getvalue(), "image/png")
        self.assertEqual(decoded.getpixel((0, 0)), (255, 255, 255))
        self.assertFalse(decoded.info)

    def test_multipart_rejects_duplicate_unknown_remote_path_and_setting_fields(self):
        content_type, body = multipart()
        person, garment, photo_type = SERVICE.parse_multipart(content_type, body)
        self.assertEqual(photo_type, "flat-lay")
        self.assertEqual(person[0].size, (96, 144))
        for name, file, mime, payload in (("person", "other.png", "image/png", image_bytes()),
                                        ("person_url", None, "text/plain", b"https://example.com/image.png"),
                                        ("path", None, "text/plain", b"C:/private/photo.jpg"),
                                        ("seed", None, "text/plain", b"99")):
            kind, invalid = multipart([(name, file, mime, payload)])
            self.assert_api_error("fields", SERVICE.parse_multipart, kind, invalid)
        for value in (b"other", b"https://example.com"):
            kind, invalid = multipart([("photo_type", None, "text/plain", value)])
            self.assert_api_error("photo_type", SERVICE.parse_multipart, kind, invalid)
        kind, valid = multipart([("photo_type", None, "text/plain", b"model")])
        self.assertEqual(SERVICE.parse_multipart(kind, valid)[2], "model")
        self.assert_api_error("multipart", SERVICE.parse_multipart, content_type, body[:-10])
        self.assert_api_error("multipart", SERVICE.parse_multipart, "multipart/form-data; boundary=衣", body)

    def test_untrusted_filenames_are_discarded_and_job_paths_are_internal_identifiers(self):
        kind, body = multipart(filename="../../outside.png")
        manager = self.manager()
        job = manager.submit(*SERVICE.parse_multipart(kind, body))
        directory = manager.directory(job["id"])
        self.assertEqual(directory.parent, manager.root)
        self.assertEqual({p.name for p in directory.iterdir()}, {"person.png", "garment.png", "metadata.json"})
        self.assertNotIn("outside", json.dumps(job))
        for bad in ("../private", "C:\\private", "https://example.com", "0" * 31, "0" * 32 + "/person.png", "%2e%2e"):
            self.assert_api_error("job_id", manager.directory, bad)
        self.assert_api_error("artifact", manager.artifact, job["id"], "person.png")
        self.assert_api_error("result_pending", manager.artifact, job["id"], "result.png")

    def test_missing_environment_never_accepts_a_job_or_writes_placeholder_files(self):
        manager = self.manager(ready=False)
        self.assert_api_error("environment", manager.submit, input_image(), input_image(), "flat-lay")
        self.assertFalse(list(manager.root.iterdir()))
        health = manager.health()
        self.assertFalse(health["can_submit"]); self.assertFalse(health["ready"]); self.assertFalse(health["pipeline_loaded"])

    def test_queue_capacity_and_cancel_are_atomic_and_do_not_change_other_jobs(self):
        manager = self.manager()
        first = manager.submit(input_image(), input_image(), "flat-lay")
        second = manager.submit(input_image(), input_image(), "model")
        self.assert_api_error("queue_full", manager.submit, input_image(), input_image(), "flat-lay")
        self.assertEqual(len(list(manager.root.iterdir())), 2)
        first_after = manager.cancel(first["id"])
        self.assertEqual(first_after["status"], "cancelled")
        self.assertEqual(manager.get(second["id"])["status"], "queued")
        self.assert_api_error("not_queued", manager.cancel, first["id"])
        replacement = manager.submit(input_image(), input_image(), "flat-lay")
        self.assertEqual(list(manager._queue), [second["id"], replacement["id"]])
        manager.close()
        self.assertEqual(manager.get(second["id"])["status"], "cancelled")
        self.assertEqual(manager.get(replacement["id"])["status"], "cancelled")

    def test_single_worker_reuses_one_runner_and_reports_real_callback_counts_with_fixed_settings(self):
        gate = threading.Event(); runner = TestRunner(block=gate); manager = self.manager(runner, worker=True)
        try:
            first = manager.submit(input_image(), input_image(), "flat-lay")
            wait_status(manager, first["id"], {"preprocessing"})
            self.assert_api_error("not_queued", manager.cancel, first["id"])
            second = manager.submit(input_image(), input_image(), "model")
            third = manager.submit(input_image(), input_image(), "flat-lay")
            self.assert_api_error("queue_full", manager.submit, input_image(), input_image(), "flat-lay")
            gate.set()
            for job in (first, second, third):
                result = wait_status(manager, job["id"])
                self.assertEqual(result["status"], "succeeded")
                self.assertEqual(result["progress"]["completed_steps"], 20)
                with Image.open(manager.artifact(job["id"], "result.png")) as png:
                    self.assertEqual(png.format, "PNG"); self.assertEqual(png.size, (80, 120))
                self.assertTrue(result["execution"]["not_model_evidence"])
            self.assertEqual(runner.maximum_running, 1)
            self.assertEqual([call["garment_photo_type"] for call in runner.calls], ["flat-lay", "model", "flat-lay"])
            for call in runner.calls:
                self.assertEqual((call["category"], call["seed"], call["num_samples"], call["num_timesteps"]), ("tops", 42, 1, 20))
                self.assertEqual(call["guidance_scale"], 1.5); self.assertTrue(call["segmentation_free"])
                self.assertEqual(call["skip_cfg_last_n_steps"], 1)
            with patch.object(SERVICE.time, "monotonic", return_value=time.monotonic() + 120):
                later = manager.get(third["id"])
            self.assertEqual(later["elapsed_seconds"], result["elapsed_seconds"])
            self.assertEqual(later["execution_seconds"], result["execution_seconds"])
        finally:
            gate.set()

    def test_failed_runner_produces_only_explicit_error_metadata_and_no_result(self):
        manager = self.manager(TestRunner(failure=True), worker=True)
        with self.assertLogs(level="ERROR"):
            job = manager.submit(input_image(), input_image(), "flat-lay")
            result = wait_status(manager, job["id"])
        self.assertEqual(result["status"], "failed")
        self.assertIn("intentional test runner failure", result["error"]["message"])
        self.assertNotIn("result_url", result)
        self.assertFalse((manager.directory(job["id"]) / "result.png").exists())
        self.assert_api_error("result_pending", manager.artifact, job["id"], "result.png")
        metadata = json.loads(manager.artifact(job["id"], "metadata.json").read_text(encoding="utf-8"))
        self.assertEqual(metadata["status"], "failed")
        self.assertIn("RuntimeError", manager.health()["last_error"])
        self.assertEqual(result["progress"]["completed_steps"], 3)

    def test_failed_input_save_rolls_back_all_job_files_and_admission(self):
        manager = self.manager()
        person, garment = input_image(), input_image()
        with patch.object(garment[0], "save", side_effect=OSError("intentional local disk-write failure")):
            with self.assertRaises(OSError): manager.submit(person, garment, "flat-lay")
        self.assertFalse(list(manager.root.iterdir()))
        self.assertEqual(manager.health()["waiting_jobs"], 0)
        self.assertEqual(manager.health()["stored_jobs"], 0)
        self.assertEqual(manager.submit(input_image(), input_image(), "flat-lay")["status"], "queued")

    def test_missing_worker_image_dependency_fails_job_and_preserves_worker_for_recovery(self):
        # Inputs already exist before the worker's own Pillow import is denied.
        # This tests dependency failure handling, not real model output quality.
        person, garment = input_image(), input_image()
        real_import = builtins.__import__
        def denied_worker_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "PIL" and "Image" in fromlist and globals and globals.get("__name__") == SERVICE.__name__:
                raise ImportError("intentional missing worker Pillow dependency")
            return real_import(name, globals, locals, fromlist, level)
        with self.assertLogs(level="ERROR"), patch.object(builtins, "__import__", side_effect=denied_worker_import):
            manager = self.manager(worker=True)
            job = manager.submit(person, garment, "flat-lay")
            failed = wait_status(manager, job["id"])
            self.assertEqual(failed["status"], "failed")
            self.assertEqual(failed["error"]["type"], "ImportError")
            self.assertIn("missing worker Pillow", failed["error"]["message"])
            self.assertNotIn("result_url", failed)
            self.assertFalse((manager.directory(job["id"]) / "result.png").exists())
            self.assertTrue(manager.worker.is_alive())
        recovered = manager.submit(person, garment, "flat-lay")
        self.assertEqual(wait_status(manager, recovered["id"])["status"], "succeeded")
        self.assertTrue(manager.worker.is_alive())

    def test_retained_terminal_jobs_are_bounded_independently_of_waiting_queue(self):
        manager = self.manager(max_jobs=3)
        for _ in range(3):
            job = manager.submit(input_image(), input_image(), "flat-lay")
            manager.cancel(job["id"])
        self.assert_api_error("job_store_full", manager.submit, input_image(), input_image(), "flat-lay")
        self.assertEqual(manager.health()["waiting_jobs"], 0)
        self.assertEqual(manager.health()["stored_jobs"], 3)
        self.assertEqual(len(list(manager.root.iterdir())), 3)

    def test_http_host_origin_and_preflight_guards_allow_only_explicit_loopback_frontends(self):
        server = self.server(self.manager())
        status, headers, body = self.request(server, "GET", "/health", headers={"Origin": "http://localhost:4189"})
        self.assertEqual(status, 200); self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:4189")
        self.assertEqual(headers["Cache-Control"], "no-store")
        for origin in ("https://example.com", "null", "http://localhost:9999", "http://localhost:4189.evil"):
            status, headers, _ = self.request(server, "GET", "/health", headers={"Origin": origin})
            self.assertEqual(status, 403); self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(self.request(server, "GET", "/health", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request(server, "GET", "/health", headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.request(server, "OPTIONS", "/jobs", headers={"Origin": "http://127.0.0.1:4189", "Access-Control-Request-Method": "POST"})[0], 204)
        self.assertEqual(self.request(server, "OPTIONS", "/jobs", headers={"Origin": "http://localhost:4189", "Access-Control-Request-Method": "DELETE"})[0], 405)
        with self.assertRaises(ValueError): SERVICE.LocalServer(("0.0.0.0", 0), self.manager())

    def test_http_upload_paths_and_failed_inputs_never_mutate_existing_jobs(self):
        manager = self.manager(); server = self.server(manager); kind, body = multipart()
        status, _, response = self.request(server, "POST", "/jobs", body, {"Content-Type": kind, "Origin": "http://localhost:4189"})
        self.assertEqual(status, 202); job = json.loads(response); before = manager.get(job["id"])
        bad_kind, bad_body = multipart([("url", None, "text/plain", b"https://example.com")])
        self.assertEqual(self.request(server, "POST", "/jobs", bad_body, {"Content-Type": bad_kind})[0], 400)
        self.assertEqual(manager.get(job["id"])["status"], before["status"])
        self.assertEqual(manager.health()["stored_jobs"], 1)
        for suffix in ("person.png", "../metadata.json", "%2e%2e/metadata.json", "result.png?path=C:/private"):
            self.assertEqual(self.request(server, "GET", f"/jobs/{job['id']}/{suffix}")[0], 404)
        self.assertEqual(self.request(server, "GET", f"/jobs/{job['id']}/result.png")[0], 409)
        self.assertEqual(self.request(server, "POST", f"/jobs/{job['id']}/cancel", b"{}")[0], 400)
        self.assertEqual(self.request(server, "POST", f"/jobs/{job['id']}/cancel", b"")[0], 200)
        self.assertEqual(manager.get(job["id"])["status"], "cancelled")

    def test_fixed_configuration_rejects_arbitrary_sampling_seed_and_queue_expansion(self):
        for values in ({"steps": 10}, {"seed": 99}, {"max_waiting": 20}, {"max_jobs": 1}):
            with self.assertRaises(ValueError): SERVICE.Config(**values)
        manager = self.manager(steps=30)
        self.assertEqual(manager.submit(input_image(), input_image(), "flat-lay")["settings"]["num_timesteps"], 30)

    def test_weight_probe_checks_real_local_headers_and_parser_reference_without_model_loading(self):
        checkpoint = self.root / "model.safetensors"
        header = json.dumps({"tensor": {"dtype": "U8", "shape": [1], "data_offsets": [0, 1]}}).encode()
        checkpoint.write_bytes(len(header).to_bytes(8, "little") + header + b"\0")
        result = SERVICE.PROBE.checkpoint_status(checkpoint)
        self.assertTrue(result["readable"]); self.assertTrue(result["header_checked"])
        checkpoint.write_bytes((99999999).to_bytes(8, "little") + b"short")
        self.assertFalse(SERVICE.PROBE.checkpoint_status(checkpoint)["readable"])
        self.assertFalse(SERVICE.PROBE.parser_cache_status(self.root)["cached"])
        revision = "a" * 40
        repository = self.root / "hub" / "models--fashn-ai--fashn-human-parser"
        snapshot = repository / "snapshots" / revision; snapshot.mkdir(parents=True)
        (repository / "refs").mkdir(); (repository / "refs" / "main").write_text(revision)
        (snapshot / "config.json").write_text('{}')
        (snapshot / "model.safetensors").write_bytes(len(header).to_bytes(8, "little") + header + b"\0")
        self.assertTrue(SERVICE.PROBE.parser_cache_status(self.root)["cached"])
        (repository / "refs" / "main").write_text("../escape")
        self.assertFalse(SERVICE.PROBE.parser_cache_status(self.root)["cached"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
