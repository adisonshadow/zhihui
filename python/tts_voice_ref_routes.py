"""TTS 常驻 HTTP：参考音色预热 / 缓存失效（三 backend 共用）。"""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler

import voice_reference_cache as vrc


def health_extra() -> dict:
    return {"voice_cache_entries": vrc.stats()}


def handle_post(path: str, handler: BaseHTTPRequestHandler, body: dict, backend: str, encode_fn) -> bool:
    """返回 True 表示已处理该 path。"""
    if path == "/invalidate-voice-cache":
        clear_disk = bool(body.get("clearDisk", False))
        vrc.invalidate_all(clear_disk=clear_disk)
        handler.send_json(200, {"ok": True, "message": "voice reference cache cleared"})
        return True

    if path == "/warm-voice-reference":
        ref_raw = (
            (body.get("referenceAudioPath") or body.get("ref_audio") or "")
            .strip()
        )
        if not ref_raw:
            handler.send_json(400, {"ok": False, "error": "referenceAudioPath is required"})
            return True
        if not __import__("os").path.isfile(ref_raw):
            handler.send_json(422, {"ok": False, "error": f"参考音频不存在: {ref_raw}"})
            return True
        ref_text = vrc.resolve_ref_text_from_body(ref_raw, body)
        try:
            result = vrc.warm(
                backend,
                ref_raw,
                ref_text=ref_text,
                encoder=lambda: encode_fn(ref_raw, ref_text, body),
            )
            handler.send_json(200, result)
        except ValueError as e:
            handler.send_json(422, {"ok": False, "error": str(e)})
        except Exception as e:
            handler.send_json(500, {"ok": False, "error": str(e)})
        return True

    return False
