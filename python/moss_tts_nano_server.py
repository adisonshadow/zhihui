#!/usr/bin/env python3
"""
MOSS-TTS-Nano（mlx-audio）HTTP 常驻服务。
依赖见同目录 requirements.txt
"""
from __future__ import annotations

import argparse
import json
import os
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

MODEL = None
LAST_REQUEST_TIME = time.time()
IDLE_TIMEOUT = 180
MODEL_PATH = None
BACKEND = "moss_nano"
AUDIO_TOKENIZER_SOURCE: str | None = None


def _is_audio_tokenizer_dir(path: Path) -> bool:
    return (path / "config.json").is_file() and (
        (path / "model.safetensors").is_file() or any(path.glob("*.safetensors"))
    )


def resolve_nano_codec_source(model_root: str) -> str | None:
    """环境变量 YIMAN_MOSS_NANO_CODEC_DIR → 主目录子路径 → None（由 mlx-audio 走 hub 默认）。"""
    env_codec = os.environ.get("YIMAN_MOSS_NANO_CODEC_DIR", "").strip()
    if env_codec and os.path.isdir(env_codec):
        return env_codec

    root = Path(model_root)
    for sub in (
        "audio_tokenizer",
        "MOSS-Audio-Tokenizer-Nano",
        "moss_audio_tokenizer_nano",
    ):
        candidate = root / sub
        if _is_audio_tokenizer_dir(candidate):
            return str(candidate)
    if _is_audio_tokenizer_dir(root):
        return str(root)
    return None


def send_json(handler: BaseHTTPRequestHandler, status: int, data: dict):
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_cors_headers()
    handler.end_headers()
    handler.wfile.write(body)


class TtsHandler(BaseHTTPRequestHandler):
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
            import tts_voice_ref_routes as vref

            payload = {"ok": True, "message": "ready", "backend": BACKEND, **vref.health_extra()}
            self.send_json(200, payload)
        else:
            send_json(self, 404, {"ok": False, "error": "Not Found"})

    def send_json(self, status, data):
        send_json(self, status, data)

    def do_POST(self):
        global LAST_REQUEST_TIME
        LAST_REQUEST_TIME = time.time()
        content_len = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_len))

        import tts_voice_ref_routes as vref
        import voice_reference_cache as vrc

        def _encode(ref_path: str, _ref_text, _body):
            model = globals().get("MODEL")
            if model is None:
                raise RuntimeError("MOSS-TTS-Nano model not loaded")
            return vrc._encode_moss_nano(model, ref_path, AUDIO_TOKENIZER_SOURCE)

        if vref.handle_post(self.path, self, body, BACKEND, _encode):
            return

        if self.path != "/generate":
            send_json(self, 404, {"ok": False, "error": "Not Found"})
            return

        text = body.get("text", "").strip()
        if not text:
            send_json(self, 400, {"ok": False, "error": "text is required"})
            return

        try:
            self._generate_nano(text, body)
        except ValueError as e:
            send_json(self, 422, {"ok": False, "error": str(e)})
        except Exception as e:
            send_json(self, 500, {"ok": False, "error": str(e)})

    def _generate_nano(self, text: str, body: dict):
        global LAST_REQUEST_TIME
        import tempfile

        import soundfile as sf

        nonlocal_model = globals().get("MODEL")
        if nonlocal_model is None:
            send_json(self, 503, {"ok": False, "error": "MOSS-TTS-Nano model not loaded"})
            return

        ref_raw = (
            (body.get("referenceAudioPath") or body.get("ref_audio") or "")
            .strip()
        )
        ref_path = ref_raw if ref_raw and os.path.isfile(ref_raw) else None
        if ref_raw and not ref_path:
            print(
                json.dumps(
                    {
                        "event": "moss_nano_ref_file_missing",
                        "referenceAudioPath": ref_raw,
                        "exists": os.path.exists(ref_raw),
                    }
                ),
                flush=True,
            )

        if not ref_path:
            raise ValueError(
                "MOSS-TTS-Nano 语音克隆需要参考音频（referenceAudioPath）。"
                "请在大纲绑定音色样本或在请求中传入可读绝对路径。"
            )

        import voice_reference_cache as vrc

        codec_src = AUDIO_TOKENIZER_SOURCE
        lookup = vrc.get_or_encode(
            BACKEND,
            ref_path,
            encoder=lambda: vrc._encode_moss_nano(nonlocal_model, ref_path, codec_src),
        )
        from voice_reference_cache import MossNanoVoicePayload

        payload = lookup.entry.payload
        if not isinstance(payload, MossNanoVoicePayload):
            raise RuntimeError("invalid moss_nano voice cache payload")
        prompt_codes = payload.prompt_audio_codes

        print(
            json.dumps(
                {
                    "event": "moss_nano_generate_start",
                    "text_chars": len(text),
                    "has_ref_audio": True,
                    "codec_source": codec_src,
                    "voice_ref_cache_hit": lookup.cache_hit,
                    "voice_ref_from_disk": lookup.from_disk,
                }
            ),
            flush=True,
        )

        synth_t0 = time.time()
        result = next(
            nonlocal_model.generate(
                text,
                prompt_audio_codes=prompt_codes,
                mode="voice_clone",
            )
        )
        synth_wall_s = round(time.time() - synth_t0, 3)
        LAST_REQUEST_TIME = time.time()

        sr_out = int(getattr(result, "sample_rate", 48000))
        proc_s = getattr(result, "processing_time_seconds", None)

        print(
            json.dumps(
                {
                    "event": "moss_nano_generate_done",
                    "wall_synthesis_s": synth_wall_s,
                    "mlx_processing_time_s": proc_s,
                    "sample_rate": sr_out,
                }
            ),
            flush=True,
        )

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            sf.write(f.name, result.audio, sr_out)
            with open(f.name, "rb") as af:
                audio_bytes = af.read()
            os.unlink(f.name)

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio_bytes)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(audio_bytes)


def idle_checker(server: HTTPServer, timeout: float):
    def check():
        while True:
            time.sleep(10)
            elapsed = time.time() - LAST_REQUEST_TIME
            if elapsed > timeout:
                print(
                    json.dumps({"event": "idle_timeout", "elapsed": elapsed, "backend": BACKEND}),
                    flush=True,
                )
                server.shutdown()
                break

    t = threading.Thread(target=check, daemon=True)
    t.start()


def run(model_path: str, port: int, timeout_sec: int) -> None:
    global MODEL, MODEL_PATH, IDLE_TIMEOUT, LAST_REQUEST_TIME, AUDIO_TOKENIZER_SOURCE

    from mlx_nano_model_paths import diagnose_nano_model_root

    diag = diagnose_nano_model_root(model_path)
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
    AUDIO_TOKENIZER_SOURCE = resolve_nano_codec_source(model_path)

    print(
        json.dumps(
            {
                "event": "loading",
                "backend": BACKEND,
                "model": MODEL_PATH,
                "codec_source": AUDIO_TOKENIZER_SOURCE,
            },
        ),
        flush=True,
    )
    t0 = time.time()

    try:
        from mlx_audio.tts import load as nano_load
    except ImportError as e:
        print(
            json.dumps(
                {
                    "event": "error",
                    "backend": BACKEND,
                    "error": f"mlx-audio 未安装或导入失败: {e}. 请 pip install -r requirements.txt",
                },
            ),
            flush=True,
        )
        raise SystemExit(1) from e

    MODEL = nano_load(MODEL_PATH)

    elapsed = time.time() - t0
    print(
        json.dumps(
            {
                "event": "ready",
                "backend": BACKEND,
                "model": MODEL_PATH,
                "codec_source": AUDIO_TOKENIZER_SOURCE,
                "load_time_s": round(elapsed, 1),
            },
        ),
        flush=True,
    )

    LAST_REQUEST_TIME = time.time()
    server = HTTPServer(("127.0.0.1", port), TtsHandler)
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
    parser = argparse.ArgumentParser(description="Yiman Local TTS Server (MOSS-TTS-Nano)")
    parser.add_argument("--model", required=True, help="MOSS-TTS-Nano MLX 模型根目录")
    parser.add_argument("--port", type=int, default=54323, help="HTTP 端口")
    parser.add_argument("--timeout", type=int, default=180, help="空闲超时（秒）")
    args = parser.parse_args()
    run(args.model, args.port, args.timeout)


if __name__ == "__main__":
    main_cli()
