#!/usr/bin/env python3
"""
MOSS-TTS（mlx-speech）HTTP 常驻服务；与 moss_local.py generation 流程一致。
依赖见同目录 requirements.txt
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from types import SimpleNamespace

MOSS_STATE: tuple | None = None
LAST_REQUEST_TIME = time.time()
IDLE_TIMEOUT = 180
MODEL_PATH = None
BACKEND = "moss"


def resolve_mlx_weights_dir(model_root: str) -> str:
    int8 = os.path.join(model_root, "mlx-int8")
    return int8 if os.path.isdir(int8) else model_root


def resolve_moss_codec_weight_candidates(model_root: str, main_weights: str) -> list[str]:
    """与 mlx_speech MossLocalAdapter 一致：codec 常为独立子目录，不能与主模型共用同一 mlx-int8。"""
    seen: set[str] = set()
    ordered: list[str] = []

    def add(p: str) -> None:
        if p and p not in seen and os.path.isdir(p):
            seen.add(p)
            ordered.append(p)

    env_codec = os.environ.get("YIMAN_MOSS_CODEC_DIR", "").strip()
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
            self._generate_moss(text, body)
        except Exception as e:
            send_json(self, 500, {"ok": False, "error": str(e)})

    def _generate_moss(self, text: str, body: dict):
        global LAST_REQUEST_TIME, MOSS_STATE
        import tempfile

        from mlx_speech.audio import normalize_peak, trim_leading_silence, write_wav
        from mlx_speech.generation import MossTTSLocalGenerationConfig, synthesize_moss_tts_local_conversations

        if MOSS_STATE is None:
            send_json(self, 503, {"ok": False, "error": "MOSS model not loaded"})
            return

        loaded_model, loaded_codec, processor = MOSS_STATE

        args = SimpleNamespace(
            text=text,
            mode="generation",
            reference_audio=None,
            instruction=None,
            quality=None,
            sound_event=None,
            ambient_sound=None,
            language=None,
            expected_tokens=None,
            auto_estimate_expected_tokens=False,
            max_new_tokens=int(body.get("max_new_tokens", 4096)),
            no_max_new_tokens=bool(body.get("no_max_new_tokens", False)),
            safety_max_new_tokens=int(body.get("safety_max_new_tokens", 4096)),
            n_vq=body.get("n_vq"),
            trim_leading_silence=bool(body.get("trim_leading_silence", False)),
            normalize_peak=float(body.get("normalize_peak", 0.0)),
            text_temperature=float(body.get("text_temperature", 1.5)),
            text_top_k=int(body.get("text_top_k", 50)),
            text_top_p=float(body.get("text_top_p", 1.0)),
            text_repetition_penalty=float(body.get("text_repetition_penalty", 1.0)),
            audio_temperature=float(body.get("audio_temperature", 1.7)),
            audio_top_k=int(body.get("audio_top_k", 25)),
            audio_top_p=float(body.get("audio_top_p", 0.8)),
            audio_repetition_penalty=float(body.get("audio_repetition_penalty", 1.0)),
            greedy=bool(body.get("greedy", False)),
            no_kv_cache=bool(body.get("no_kv_cache", False)),
        )

        use_kv_cache = False if args.no_kv_cache else True
        generation_config = MossTTSLocalGenerationConfig(
            max_new_tokens=None if args.no_max_new_tokens else args.max_new_tokens,
            safety_max_new_tokens=args.safety_max_new_tokens,
            n_vq_for_inference=args.n_vq,
            text_temperature=args.text_temperature,
            text_top_k=args.text_top_k,
            text_top_p=args.text_top_p,
            text_repetition_penalty=args.text_repetition_penalty,
            audio_temperature=args.audio_temperature,
            audio_top_k=args.audio_top_k,
            audio_top_p=args.audio_top_p,
            audio_repetition_penalty=args.audio_repetition_penalty,
            do_sample=False if args.greedy else None,
            use_kv_cache=use_kv_cache,
        )

        user_kwargs = {
            "text": args.text,
            "instruction": args.instruction,
            "tokens": None,
            "quality": args.quality,
            "sound_event": args.sound_event,
            "ambient_sound": args.ambient_sound,
            "language": args.language,
        }
        conversations = [[processor.build_user_message(**user_kwargs)]]

        result = synthesize_moss_tts_local_conversations(
            loaded_model.model,
            processor,
            loaded_codec.model,
            conversations=conversations,
            mode="generation",
            config=generation_config,
        )
        synthesis = result.outputs[0]
        waveform = synthesis.waveform

        if args.trim_leading_silence:
            waveform = trim_leading_silence(waveform, sample_rate=synthesis.sample_rate)
        if args.normalize_peak > 0:
            waveform = normalize_peak(waveform, target_peak=args.normalize_peak)

        LAST_REQUEST_TIME = time.time()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        read_path = tmp_path
        try:
            written = write_wav(Path(tmp_path), waveform, sample_rate=synthesis.sample_rate)
            read_path = str(written) if written is not None else tmp_path
            with open(read_path, "rb") as rf:
                audio_bytes = rf.read()
        finally:
            for p in {tmp_path, read_path}:
                try:
                    if p and os.path.isfile(p):
                        os.unlink(p)
                except OSError:
                    pass

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
    global MOSS_STATE, MODEL_PATH, IDLE_TIMEOUT, LAST_REQUEST_TIME

    MODEL_PATH = model_path
    IDLE_TIMEOUT = timeout_sec

    print(
        json.dumps(
            {"event": "loading", "backend": BACKEND, "model": MODEL_PATH},
        ),
        flush=True,
    )
    t0 = time.time()

    try:
        from mlx_speech.models.moss_audio_tokenizer import load_moss_audio_tokenizer_model
        from mlx_speech.models.moss_local import MossTTSLocalProcessor, load_moss_tts_local_model
    except ImportError as e:
        print(
            json.dumps(
                {
                    "event": "error",
                    "backend": "moss",
                    "error": f"mlx-speech 未安装或导入失败: {e}. 请 pip install -r requirements.txt",
                },
            ),
            flush=True,
        )
        sys.exit(1)

    weights_main = resolve_mlx_weights_dir(MODEL_PATH)
    loaded_model = load_moss_tts_local_model(weights_main)

    codec_candidates = resolve_moss_codec_weight_candidates(MODEL_PATH, weights_main)
    last_codec_exc: BaseException | None = None
    loaded_codec = None
    codec_dir_used: str | None = None
    for cdir in codec_candidates:
        try:
            loaded_codec = load_moss_audio_tokenizer_model(cdir, strict=True)
            codec_dir_used = cdir
            break
        except BaseException as e:
            last_codec_exc = e
            continue

    if loaded_codec is None or codec_dir_used is None:
        print(
            json.dumps(
                {
                    "event": "error",
                    "backend": "moss",
                    "error": (
                        "无法加载 MOSS Audio Tokenizer（codec）。"
                        f" 最后错误: {last_codec_exc!s}。"
                        " 已将主模型目录下的 moss_audio_tokenizer / MOSS-Audio-Tokenizer / audio_tokenizer 及主 mlx-int8 依次尝试。"
                        " 若 tokenizer 单独下载，请放在上述子目录之一，或设置环境变量 YIMAN_MOSS_CODEC_DIR。"
                        f" 候选目录: {codec_candidates}"
                    ),
                },
            ),
            flush=True,
        )
        sys.exit(1)

    processor = MossTTSLocalProcessor.from_path(
        loaded_model.model_dir,
        audio_tokenizer=loaded_codec.model,
    )
    MOSS_STATE = (loaded_model, loaded_codec, processor)

    elapsed = time.time() - t0
    print(
        json.dumps(
            {
                "event": "ready",
                "backend": BACKEND,
                "model": MODEL_PATH,
                "main_weights": weights_main,
                "codec_weights": codec_dir_used,
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
    parser = argparse.ArgumentParser(description="Yiman Local TTS Server (MOSS-TTS)")
    parser.add_argument("--model", required=True, help="模型根目录（可为含 mlx-int8 的上级目录）")
    parser.add_argument("--port", type=int, default=54322, help="HTTP 端口")
    parser.add_argument("--timeout", type=int, default=180, help="空闲超时（秒）")
    args = parser.parse_args()
    run(args.model, args.port, args.timeout)


if __name__ == "__main__":
    main_cli()
