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

_REF_TEXT_SIDECARS = (".txt", ".transcript.txt")


def _patch_and_warm_tokenizer_cache(model_obj) -> None:
    """
    mlx-audio LongCat.generate() 每次都会 AutoTokenizer.from_pretrained(text_encoder_model)；
    对 hub id 会反复触网/校验，体感极慢。这里在进程启动后打补丁做「按 ID 单次加载 + 优先 HF 磁盘缓存」。
    """
    import transformers

    _orig = transformers.AutoTokenizer.from_pretrained
    _cache: dict[str, object] = {}

    def cache_key(pretrained_model_name_or_path: str | os.PathLike[str]) -> str:
        s = os.path.abspath(str(pretrained_model_name_or_path))
        return s if os.path.isdir(s) else str(pretrained_model_name_or_path)

    def _from_pretrained_cached(pretrained_model_name_or_path: str | os.PathLike[str], *args, **kwargs):  # type: ignore[no-untyped-def]
        k = cache_key(pretrained_model_name_or_path)
        if k not in _cache:
            kw = dict(kwargs)
            try:
                _cache[k] = _orig(pretrained_model_name_or_path, *args, **kw, local_files_only=True)
            except BaseException:
                _cache[k] = _orig(pretrained_model_name_or_path, *args, **kw)
        return _cache[k]

    transformers.AutoTokenizer.from_pretrained = _from_pretrained_cached  # type: ignore[assignment]

    text_enc = getattr(getattr(model_obj, "config", None), "text_encoder_model", None)
    preload_id = str(text_enc if text_enc is not None else "google/umt5-base")

    tw0 = time.time()
    _from_pretrained_cached(preload_id)
    elapsed = round(time.time() - tw0, 3)
    print(
        json.dumps(
            {
                "event": "longcat_tokenizer_warmup",
                "backend": BACKEND,
                "pretrained": preload_id,
                "elapsed_s": elapsed,
            }
        ),
        flush=True,
    )


def _read_utf8_sidecar(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as f:
            t = f.read().strip()
        return t or None
    except OSError:
        return None


def _resolve_ref_text(ref_path: str | None, body: dict) -> str | None:
    """mlx-audio 克隆需 ref_text（参考 wav 的逐字稿），与官方 inference --prompt_text 一致。"""
    rt = body.get("referenceText")
    if rt is None:
        rt = body.get("ref_text")
    if rt is not None:
        t = str(rt).strip()
        if t:
            return t
    if not ref_path:
        return None
    stem, _ = os.path.splitext(ref_path)
    for suf in _REF_TEXT_SIDECARS:
        sidecar = stem + suf
        if os.path.isfile(sidecar):
            t = _read_utf8_sidecar(sidecar)
            if t:
                print(
                    json.dumps(
                        {
                            "event": "longcat_ref_text_sidecar",
                            "sidecar": sidecar,
                            "chars": len(t),
                        }
                    ),
                    flush=True,
                )
                return t
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

            self.send_json(200, {"ok": True, "message": "ready", "backend": BACKEND, **vref.health_extra()})
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

        def _encode(ref_path: str, ref_text, _body):
            return vrc._encode_longcat(ref_path, ref_text)

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
            self._generate_longcat(text, body)
        except ValueError as e:
            send_json(self, 422, {"ok": False, "error": str(e)})
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
        ref_raw = (
            (body.get("referenceAudioPath") or body.get("ref_audio") or "")
            .strip()
        )
        ref_path = ref_raw if ref_raw and os.path.isfile(ref_raw) else None
        if ref_raw and not ref_path:
            print(
                json.dumps(
                    {
                        "event": "longcat_ref_file_missing",
                        "referenceAudioPath": ref_raw,
                        "exists": os.path.exists(ref_raw),
                    }
                ),
                flush=True,
            )

        ref_text = _resolve_ref_text(ref_path, body)
        seed = int(body.get("seed", 1024))
        split_text = bool(body.get("split_text", False))
        voice_ref_cache_hit = False
        voice_ref_from_disk = False
        cached_longcat = None

        if ref_path:
            import voice_reference_cache as vrc

            lookup = vrc.get_or_encode(
                BACKEND,
                ref_path,
                ref_text=ref_text,
                encoder=lambda: vrc._encode_longcat(ref_path, ref_text),
            )
            voice_ref_cache_hit = lookup.cache_hit
            voice_ref_from_disk = lookup.from_disk
            cached_longcat = lookup.entry.payload

        print(
            json.dumps(
                {
                    "event": "longcat_generate_start",
                    "text_chars": len(text),
                    "lang": lang,
                    "steps": steps,
                    "cfg_strength": cfg_strength,
                    "seed": seed,
                    "split_text": split_text,
                    "has_ref_audio": ref_path is not None,
                    "has_ref_text": bool(cached_longcat.ref_text if cached_longcat else ref_text),
                    "voice_ref_cache_hit": voice_ref_cache_hit,
                    "voice_ref_from_disk": voice_ref_from_disk,
                }
            ),
            flush=True,
        )

        def synthesize():
            if not ref_path:
                return next(
                    nonlocal_model.generate(
                        text,
                        lang_code=lang,
                        speed=speed,
                        steps=steps,
                        cfg_strength=cfg_strength,
                        seed=seed,
                        split_text=split_text,
                    )
                )
            assert cached_longcat is not None
            return next(
                nonlocal_model.generate(
                    text,
                    ref_audio=cached_longcat.ref_audio,
                    ref_text=cached_longcat.ref_text,
                    guidance_method="apg",
                    steps=steps,
                    cfg_strength=cfg_strength,
                    seed=seed,
                    split_text=split_text,
                )
            )

        synth_t0 = time.time()
        result = synthesize()
        synth_wall_s = round(time.time() - synth_t0, 3)
        LAST_REQUEST_TIME = time.time()

        proc_s = getattr(result, "processing_time_seconds", None)
        samples_ct = getattr(result, "samples", None)
        aud_dur = getattr(result, "audio_duration", None)
        sr_out = getattr(result, "sample_rate", 24000)
        peak_mem_gb = getattr(result, "peak_memory_usage", None)

        print(
            json.dumps(
                {
                    "event": "longcat_generate_done",
                    "wall_synthesis_s": synth_wall_s,
                    "mlx_processing_time_s": proc_s,
                    "samples": samples_ct,
                    "audio_duration_human": aud_dur,
                    "sample_rate": sr_out,
                    "peak_memory_gb": peak_mem_gb,
                }
            ),
            flush=True,
        )

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
    _patch_and_warm_tokenizer_cache(MODEL)

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
