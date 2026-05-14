#!/usr/bin/env python3
"""
LongCat-AudioDiT（mlx-audio）HTTP 常驻服务。
依赖见同目录 requirements.txt
"""
from __future__ import annotations

import argparse
import json
import os
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

MODEL = None
LAST_REQUEST_TIME = time.time()
IDLE_TIMEOUT = 180
MODEL_PATH = None
BACKEND = "longcat"


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
            self.send_json(200, {"ok": True, "message": "ready", "backend": BACKEND})
        else:
            send_json(self, 404, {"ok": False, "error": "Not Found"})

    def send_json(self, status, data):
        send_json(self, status, data)

    def do_POST(self):
        global LAST_REQUEST_TIME
        if self.path != "/generate":
            send_json(self, 404, {"ok": False, "error": "Not Found"})
            return

        LAST_REQUEST_TIME = time.time()
        content_len = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_len))
        text = body.get("text", "").strip()
        if not text:
            send_json(self, 400, {"ok": False, "error": "text is required"})
            return

        try:
            self._generate_longcat(text, body)
        except Exception as e:
            send_json(self, 500, {"ok": False, "error": str(e)})

    def _generate_longcat(self, text: str, body: dict):
        global LAST_REQUEST_TIME
        import tempfile

        import soundfile as sf

        nonlocal_model = globals().get("MODEL")
        if nonlocal_model is None:
            send_json(self, 503, {"ok": False, "error": "model not loaded"})
            return

        lang = "zh" if any("\u4e00" <= c <= "\u9fff" for c in text) else "en"
        speed = float(body.get("speed", 1.0))
        steps = int(body.get("steps", 16))
        cfg_strength = float(body.get("cfg_strength", 4.0))

        result = next(
            nonlocal_model.generate(
                text,
                lang_code=lang,
                speed=speed,
                steps=steps,
                cfg_strength=cfg_strength,
            )
        )
        LAST_REQUEST_TIME = time.time()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            sf.write(f.name, result.audio, 24000)
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
                print(json.dumps({"event": "idle_timeout", "elapsed": elapsed, "backend": BACKEND}), flush=True)
                server.shutdown()
                break

    t = threading.Thread(target=check, daemon=True)
    t.start()


def run(model_path: str, port: int, timeout_sec: int) -> None:
    """由 main.py 调用；亦可单独调试：python longcat_audio_dit_server.py --model …"""
    global MODEL, MODEL_PATH, IDLE_TIMEOUT, LAST_REQUEST_TIME

    MODEL_PATH = model_path
    IDLE_TIMEOUT = timeout_sec

    print(
        json.dumps(
            {"event": "loading", "backend": BACKEND, "model": MODEL_PATH},
        ),
        flush=True,
    )
    t0 = time.time()

    from mlx_audio.tts.utils import load as lc_load

    MODEL = lc_load(MODEL_PATH)

    elapsed = time.time() - t0
    print(
        json.dumps(
            {
                "event": "ready",
                "backend": BACKEND,
                "model": MODEL_PATH,
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
    parser = argparse.ArgumentParser(description="Yiman Local TTS Server (LongCat-AudioDiT)")
    parser.add_argument("--model", required=True, help="LongCat 模型根目录")
    parser.add_argument("--port", type=int, default=54321, help="HTTP 端口")
    parser.add_argument("--timeout", type=int, default=180, help="空闲超时（秒）")
    args = parser.parse_args()
    run(args.model, args.port, args.timeout)


if __name__ == "__main__":
    main_cli()
