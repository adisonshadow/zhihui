#!/usr/bin/env python3
"""
MOSS-SoundEffect（mlx-speech）HTTP 常驻服务。
"""
from __future__ import annotations

import argparse
import json
import os
import tempfile
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

import numpy as np
import soundfile as sf

MODEL = None
LAST_REQUEST_TIME = time.time()
IDLE_TIMEOUT = 180
MODEL_PATH = None
CODEC_PATH = None
BACKEND = "sfx_moss"

# 与 mlx_speech.models.moss_delay.sound_effect 一致：提示与预算均按 12.5 tokens/s
SFX_TOKENS_PER_SECOND = 12.5


def estimate_sfx_max_new_tokens(duration_seconds: float) -> int:
    """按目标时长估算生成 token 上限（略留余量，避免过早截断语义）。"""
    base = max(1, int(float(duration_seconds) * SFX_TOKENS_PER_SECOND))
    return min(512, max(base + 8, int(base * 1.25)))


def trim_waveform_to_duration(audio_np: np.ndarray, sample_rate: int, duration_seconds: float) -> np.ndarray:
    """写文件前按用户设定时长硬截断（模型未必遵守 prompt 中的 tokens 提示）。"""
    max_samples = int(round(float(duration_seconds) * int(sample_rate)))
    if max_samples <= 0 or audio_np.size <= max_samples:
        return audio_np
    return audio_np[:max_samples]


def resolve_mlx_weights_dir(model_root: str) -> str:
    for sub in ("mlx-4bit", "mlx-int8", "mlx"):
        p = os.path.join(model_root, sub)
        if os.path.isdir(p):
            return p
    return model_root


def resolve_sfx_codec_candidates(model_root: str, main_weights: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    def add(p: str) -> None:
        if p and p not in seen and os.path.isdir(p):
            seen.add(p)
            ordered.append(p)

    env_codec = os.environ.get("YIMAN_MOSS_SFX_CODEC_DIR", "").strip()
    if env_codec:
        add(resolve_mlx_weights_dir(env_codec))

    for sub in ("moss_audio_tokenizer", "MOSS-Audio-Tokenizer", "audio_tokenizer"):
        add(resolve_mlx_weights_dir(os.path.join(model_root, sub)))

    add(main_weights)
    return ordered


def send_json(handler: BaseHTTPRequestHandler, status: int, data: dict):
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_cors_headers()
    handler.end_headers()
    handler.wfile.write(body)


class SfxHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        req_h = self.headers.get("Access-Control-Request-Headers")
        self.send_header("Access-Control-Allow-Headers", req_h or "*")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        global LAST_REQUEST_TIME
        if self.path == "/health":
            LAST_REQUEST_TIME = time.time()
            send_json(
                self,
                200,
                {
                    "ok": MODEL is not None,
                    "backend": BACKEND,
                    "model": MODEL_PATH,
                    "codec": CODEC_PATH,
                },
            )
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        global LAST_REQUEST_TIME
        if self.path != "/generate":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            send_json(self, 400, {"ok": False, "error": "invalid JSON"})
            return

        description = (
            (body.get("description") or body.get("text") or body.get("ambient_sound") or "")
            .strip()
        )
        if not description:
            send_json(self, 400, {"ok": False, "error": "description 不能为空"})
            return

        try:
            duration = float(body.get("durationSeconds") or body.get("duration_seconds") or 6)
        except (TypeError, ValueError):
            duration = 6.0
        duration = max(2.0, min(15.0, duration))

        nonlocal_model = globals().get("MODEL")
        if nonlocal_model is None:
            send_json(self, 503, {"ok": False, "error": "MOSS-SoundEffect model not loaded"})
            return

        print(
            json.dumps(
                {
                    "event": "moss_sfx_generate_start",
                    "description_chars": len(description),
                    "duration_seconds": duration,
                }
            ),
            flush=True,
        )

        max_new_tokens = estimate_sfx_max_new_tokens(duration)

        synth_t0 = time.time()
        try:
            result = nonlocal_model.generate(
                description,
                duration_seconds=duration,
                max_new_tokens=max_new_tokens,
            )
        except Exception as e:
            send_json(self, 500, {"ok": False, "error": str(e)})
            return

        synth_wall_s = round(time.time() - synth_t0, 3)
        LAST_REQUEST_TIME = time.time()

        sr_out = int(getattr(result, "sample_rate", 48000))
        waveform = getattr(result, "waveform", None)
        if waveform is None:
            send_json(self, 500, {"ok": False, "error": "empty waveform"})
            return

        audio_np = np.asarray(waveform)
        if audio_np.ndim > 1:
            audio_np = audio_np.squeeze()

        raw_samples = int(audio_np.shape[0]) if audio_np.size else 0
        audio_np = trim_waveform_to_duration(audio_np, sr_out, duration)
        trimmed_samples = int(audio_np.shape[0]) if audio_np.size else 0

        print(
            json.dumps(
                {
                    "event": "moss_sfx_generate_done",
                    "wall_synthesis_s": synth_wall_s,
                    "sample_rate": sr_out,
                    "max_new_tokens": max_new_tokens,
                    "target_duration_s": duration,
                    "samples_raw": raw_samples,
                    "samples": trimmed_samples,
                    "duration_s_actual": round(trimmed_samples / sr_out, 3) if sr_out and trimmed_samples else 0,
                }
            ),
            flush=True,
        )

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            sf.write(f.name, audio_np, sr_out)
            with open(f.name, "rb") as af:
                audio_bytes = af.read()
            os.unlink(f.name)

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio_bytes)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(audio_bytes)


def idle_checker(server: HTTPServer, timeout_sec: float):
    def check():
        while True:
            time.sleep(5)
            if timeout_sec <= 0:
                continue
            if time.time() - LAST_REQUEST_TIME > timeout_sec:
                print(json.dumps({"event": "idle_timeout", "backend": BACKEND}), flush=True)
                server.shutdown()
                return

    t = threading.Thread(target=check, daemon=True)
    t.start()


def run(model_path: str, port: int, timeout_sec: int) -> None:
    global MODEL, MODEL_PATH, IDLE_TIMEOUT, LAST_REQUEST_TIME, CODEC_PATH

    from mlx_sfx_model_paths import diagnose_sfx_model_root

    diag = diagnose_sfx_model_root(model_path)
    if not diag.get("ok"):
        print(
            json.dumps(
                {
                    "event": "error",
                    "backend": BACKEND,
                    "error": diag.get("message", "未找到 MLX 权重"),
                    "model_root": diag.get("root", model_path),
                    "kind": diag.get("kind"),
                },
            ),
            flush=True,
        )
        raise SystemExit(1)

    MODEL_PATH = str(diag["resolved"])
    IDLE_TIMEOUT = timeout_sec

    print(
        json.dumps(
            {
                "event": "loading",
                "backend": BACKEND,
                "model": MODEL_PATH,
            },
        ),
        flush=True,
    )
    t0 = time.time()

    try:
        from mlx_speech.tts import load as sfx_load
    except ImportError as e:
        print(
            json.dumps(
                {
                    "event": "error",
                    "backend": BACKEND,
                    "error": f"mlx-speech 未安装: {e}",
                },
            ),
            flush=True,
        )
        raise SystemExit(1) from e

    weights_main = MODEL_PATH
    codec_candidates = resolve_sfx_codec_candidates(model_path, weights_main)
    last_exc: BaseException | None = None
    loaded = None
    codec_used: str | None = None

    for cdir in codec_candidates:
        try:
            loaded = sfx_load(weights_main, codec_path_or_repo=cdir)
            codec_used = cdir
            break
        except BaseException as e:
            last_exc = e
            continue

    if loaded is None:
        try:
            loaded = sfx_load(weights_main)
            codec_used = None
        except BaseException as e:
            last_exc = e

    if loaded is None:
        err = str(last_exc) if last_exc else "load failed"
        print(
            json.dumps({"event": "error", "backend": BACKEND, "error": err}),
            flush=True,
        )
        raise SystemExit(1) from last_exc

    MODEL = loaded
    CODEC_PATH = codec_used

    elapsed = time.time() - t0
    print(
        json.dumps(
            {
                "event": "ready",
                "backend": BACKEND,
                "model": MODEL_PATH,
                "codec": CODEC_PATH,
                "load_time_s": round(elapsed, 1),
            },
        ),
        flush=True,
    )

    LAST_REQUEST_TIME = time.time()
    server = HTTPServer(("127.0.0.1", port), SfxHandler)
    idle_checker(server, float(IDLE_TIMEOUT))

    print(
        json.dumps(
            {"event": "listening", "port": port, "timeout_s": IDLE_TIMEOUT, "backend": BACKEND},
        ),
        flush=True,
    )

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print(json.dumps({"event": "shutdown", "backend": BACKEND}), flush=True)


def main_cli():
    parser = argparse.ArgumentParser(description="Yiman Local SFX Server (MOSS-SoundEffect)")
    parser.add_argument("--model", required=True, help="MOSS-SoundEffect MLX 模型根目录")
    parser.add_argument("--port", type=int, default=54324, help="HTTP 端口")
    parser.add_argument("--timeout", type=int, default=180, help="空闲超时（秒）")
    args = parser.parse_args()
    run(args.model, args.port, args.timeout)


if __name__ == "__main__":
    main_cli()
