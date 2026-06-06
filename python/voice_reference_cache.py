"""
本地 TTS 参考音色：编码一次、内存 LRU + 磁盘复用。
供 longcat / moss / moss_nano 常驻服务共用。
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

_REF_TEXT_SIDECARS = (".txt", ".transcript.txt")
_MAX_ENTRIES_PER_BACKEND = 32
_BACKENDS = ("longcat", "moss", "moss_nano")

# backend -> OrderedDict[cache_key, VoiceRefEntry]
_MEMORY: dict[str, OrderedDict[str, VoiceRefEntry]] = {
    b: OrderedDict() for b in _BACKENDS
}


def _default_cache_root() -> Path:
    env = os.environ.get("YIMAN_VOICE_REF_CACHE_DIR", "").strip()
    if env:
        return Path(env).expanduser()
    home = Path.home()
    if os.name == "darwin":
        return home / "Library" / "Application Support" / "Yiman" / "voice_ref_cache"
    return home / ".yiman" / "voice_ref_cache"


def cache_root() -> Path:
    root = _default_cache_root()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _file_fingerprint(ref_path: str) -> tuple[str, float, int]:
    abspath = os.path.abspath(ref_path)
    st = os.stat(abspath)
    return abspath, float(st.st_mtime), int(st.st_size)


def _text_suffix(ref_text: str | None) -> str:
    t = (ref_text or "").strip()
    if not t:
        return ""
    return hashlib.sha256(t.encode("utf-8")).hexdigest()[:16]


def make_cache_key(backend: str, ref_path: str, ref_text: str | None = None) -> str:
    abspath, mtime, size = _file_fingerprint(ref_path)
    suffix = _text_suffix(ref_text) if backend == "longcat" else ""
    parts = [backend, abspath, str(int(mtime)), str(size)]
    if suffix:
        parts.append(suffix)
    return ":".join(parts)


def _disk_id(cache_key: str) -> str:
    return hashlib.sha256(cache_key.encode("utf-8")).hexdigest()


def _disk_paths(backend: str, cache_key: str) -> tuple[Path, Path]:
    did = _disk_id(cache_key)
    base = cache_root() / backend / did
    return base.with_suffix(".npz"), base.with_suffix(".meta.json")


@dataclass
class LongcatVoicePayload:
    ref_audio: Any  # np.ndarray float32 1d
    ref_text: str


@dataclass
class MossVoicePayload:
    audio_codes: list  # list[mx.array]


@dataclass
class MossNanoVoicePayload:
    prompt_audio_codes: Any  # mx.array


@dataclass
class VoiceRefEntry:
    cache_key: str
    backend: str
    ref_path: str
    payload: LongcatVoicePayload | MossVoicePayload | MossNanoVoicePayload


@dataclass
class VoiceRefLookup:
    entry: VoiceRefEntry
    cache_hit: bool
    from_disk: bool


def resolve_ref_text_from_body(ref_path: str | None, body: dict) -> str | None:
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
            try:
                with open(sidecar, encoding="utf-8") as f:
                    t = f.read().strip()
                if t:
                    return t
            except OSError:
                pass
    return None


def _read_utf8_sidecar(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as f:
            t = f.read().strip()
        return t or None
    except OSError:
        return None


def _touch_lru(backend: str, cache_key: str, entry: VoiceRefEntry) -> None:
    store = _MEMORY[backend]
    if cache_key in store:
        store.move_to_end(cache_key)
    else:
        store[cache_key] = entry
        while len(store) > _MAX_ENTRIES_PER_BACKEND:
            evicted_key, _ = store.popitem(last=False)
            print(
                json.dumps(
                    {
                        "event": "voice_ref_cache_evict",
                        "backend": backend,
                        "cache_key_prefix": evicted_key[:80],
                    }
                ),
                flush=True,
            )


def invalidate_all(*, clear_disk: bool = False) -> None:
    for b in _BACKENDS:
        _MEMORY[b].clear()
    if clear_disk:
        root = cache_root()
        for b in _BACKENDS:
            d = root / b
            if d.is_dir():
                for child in d.iterdir():
                    try:
                        if child.is_file():
                            child.unlink()
                    except OSError:
                        pass


def stats() -> dict[str, int]:
    return {b: len(_MEMORY[b]) for b in _BACKENDS}


def _load_longcat_from_disk(npz_path: Path, meta_path: Path) -> LongcatVoicePayload | None:
    import numpy as np

    if not npz_path.is_file() or not meta_path.is_file():
        return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        data = np.load(npz_path)
        ref_audio = np.ascontiguousarray(data["ref_audio"], dtype=np.float32)
        ref_text = str(meta.get("ref_text") or "")
        return LongcatVoicePayload(ref_audio=ref_audio, ref_text=ref_text)
    except (OSError, json.JSONDecodeError, KeyError, ValueError):
        return None


def _save_longcat_to_disk(
    cache_key: str,
    backend: str,
    ref_path: str,
    payload: LongcatVoicePayload,
) -> None:
    import numpy as np

    npz_path, meta_path = _disk_paths(backend, cache_key)
    npz_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(npz_path, ref_audio=payload.ref_audio)
    meta_path.write_text(
        json.dumps(
            {
                "backend": backend,
                "ref_path": ref_path,
                "cache_key": cache_key,
                "ref_text": payload.ref_text,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def _load_mlx_codes_from_disk(npz_path: Path, meta_path: Path, *, list_payload: bool):
    import mlx.core as mx
    import numpy as np

    if not npz_path.is_file():
        return None
    try:
        data = np.load(npz_path)
        if list_payload:
            codes_list = []
            i = 0
            while f"codes_{i}" in data.files:
                arr = mx.array(data[f"codes_{i}"], dtype=mx.int32)
                codes_list.append(arr)
                i += 1
            if not codes_list and "codes" in data.files:
                codes_list = [mx.array(data["codes"], dtype=mx.int32)]
            return MossVoicePayload(audio_codes=codes_list) if list_payload else MossNanoVoicePayload(
                prompt_audio_codes=codes_list[0] if codes_list else mx.array([], dtype=mx.int32)
            )
    except (OSError, ValueError):
        return None
    return None


def _save_mlx_codes_to_disk(
    cache_key: str,
    backend: str,
    ref_path: str,
    *,
    moss_list: list | None = None,
    nano_codes: Any | None = None,
) -> None:
    import numpy as np

    npz_path, meta_path = _disk_paths(backend, cache_key)
    npz_path.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, Any] = {}
    if moss_list is not None:
        for i, c in enumerate(moss_list):
            payload[f"codes_{i}"] = np.asarray(c)
    elif nano_codes is not None:
        payload["codes"] = np.asarray(nano_codes)
    np.savez(npz_path, **payload)
    meta_path.write_text(
        json.dumps({"backend": backend, "ref_path": ref_path, "cache_key": cache_key}, ensure_ascii=False),
        encoding="utf-8",
    )


def _encode_longcat(ref_path: str, ref_text: str | None) -> LongcatVoicePayload:
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample

    rt = ref_text
    if not rt:
        stem, _ = os.path.splitext(ref_path)
        for suf in _REF_TEXT_SIDECARS:
            sidecar = stem + suf
            if os.path.isfile(sidecar):
                rt = _read_utf8_sidecar(sidecar)
                if rt:
                    break
    if not rt:
        stem = os.path.splitext(ref_path)[0]
        raise ValueError(
            "LongCat 语音克隆需要参考音频对应文稿（referenceText）。"
            f"请在样本同目录添加 {os.path.basename(stem)}.txt，或在请求中传入 referenceText。"
        )

    data, sr = sf.read(ref_path, dtype="float32", always_2d=False)
    if data.ndim > 1:
        data = np.mean(data, axis=1)
    target_sr = 24000
    if int(sr) != target_sr:
        n_new = max(1, int(round(len(data) * target_sr / float(sr))))
        data = resample(data, n_new).astype(np.float32)
    ref_audio = np.ascontiguousarray(data, dtype=np.float32)
    return LongcatVoicePayload(ref_audio=ref_audio, ref_text=rt)


def _encode_moss(processor: Any, ref_path: str) -> MossVoicePayload:
    codes = processor.encode_audios_from_path(ref_path)
    return MossVoicePayload(audio_codes=codes)


def _encode_moss_nano(model: Any, ref_path: str, codec_source: str | None) -> MossNanoVoicePayload:
    codes = model.encode_reference_audio(
        ref_path,
        num_quantizers=model.config.n_vq,
        device="cpu",
        source=codec_source,
    )
    return MossNanoVoicePayload(prompt_audio_codes=codes)


def _load_from_disk(backend: str, cache_key: str) -> VoiceRefEntry | None:
    npz_path, meta_path = _disk_paths(backend, cache_key)
    if backend == "longcat":
        payload = _load_longcat_from_disk(npz_path, meta_path)
        if payload is None:
            return None
    elif backend == "moss":
        payload = _load_mlx_codes_from_disk(npz_path, meta_path, list_payload=True)
        if payload is None:
            return None
    else:
        payload = _load_mlx_codes_from_disk(npz_path, meta_path, list_payload=False)
        if payload is None:
            return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        ref_path = str(meta.get("ref_path") or "")
    except OSError:
        ref_path = ""
    return VoiceRefEntry(cache_key=cache_key, backend=backend, ref_path=ref_path, payload=payload)


def _save_to_disk(entry: VoiceRefEntry) -> None:
    if isinstance(entry.payload, LongcatVoicePayload):
        _save_longcat_to_disk(entry.cache_key, entry.backend, entry.ref_path, entry.payload)
    elif isinstance(entry.payload, MossVoicePayload):
        _save_mlx_codes_to_disk(
            entry.cache_key,
            entry.backend,
            entry.ref_path,
            moss_list=entry.payload.audio_codes,
        )
    elif isinstance(entry.payload, MossNanoVoicePayload):
        _save_mlx_codes_to_disk(
            entry.cache_key,
            entry.backend,
            entry.ref_path,
            nano_codes=entry.payload.prompt_audio_codes,
        )


def get_or_encode(
    backend: str,
    ref_path: str,
    *,
    ref_text: str | None = None,
    encoder: Callable[[], LongcatVoicePayload | MossVoicePayload | MossNanoVoicePayload],
) -> VoiceRefLookup:
    if backend not in _BACKENDS:
        raise ValueError(f"unknown backend: {backend}")
    if not ref_path or not os.path.isfile(ref_path):
        raise ValueError(f"参考音频不存在或不可读: {ref_path}")

    cache_key = make_cache_key(backend, ref_path, ref_text)
    store = _MEMORY[backend]

    if cache_key in store:
        _touch_lru(backend, cache_key, store[cache_key])
        return VoiceRefLookup(entry=store[cache_key], cache_hit=True, from_disk=False)

    disk_entry = _load_from_disk(backend, cache_key)
    if disk_entry is not None:
        _touch_lru(backend, cache_key, disk_entry)
        print(
            json.dumps(
                {
                    "event": "voice_ref_encode_done",
                    "backend": backend,
                    "cache_hit": True,
                    "from_disk": True,
                    "cache_key_prefix": cache_key[:80],
                }
            ),
            flush=True,
        )
        return VoiceRefLookup(entry=disk_entry, cache_hit=True, from_disk=True)

    t0 = time.time()
    print(
        json.dumps(
            {
                "event": "voice_ref_encode_start",
                "backend": backend,
                "ref_path": ref_path,
            }
        ),
        flush=True,
    )
    payload = encoder()
    entry = VoiceRefEntry(
        cache_key=cache_key,
        backend=backend,
        ref_path=os.path.abspath(ref_path),
        payload=payload,
    )
    _save_to_disk(entry)
    _touch_lru(backend, cache_key, entry)
    frames = None
    if isinstance(payload, MossNanoVoicePayload):
        frames = int(getattr(payload.prompt_audio_codes, "shape", [0])[0])
    elif isinstance(payload, MossVoicePayload) and payload.audio_codes:
        frames = int(payload.audio_codes[0].shape[0])
    elif isinstance(payload, LongcatVoicePayload):
        frames = int(payload.ref_audio.shape[0])
    print(
        json.dumps(
            {
                "event": "voice_ref_encode_done",
                "backend": backend,
                "cache_hit": False,
                "from_disk": False,
                "wall_encode_s": round(time.time() - t0, 3),
                "frames": frames,
            }
        ),
        flush=True,
    )
    return VoiceRefLookup(entry=entry, cache_hit=False, from_disk=False)


def warm(
    backend: str,
    ref_path: str,
    *,
    ref_text: str | None = None,
    encoder: Callable[[], LongcatVoicePayload | MossVoicePayload | MossNanoVoicePayload],
) -> dict[str, Any]:
    lookup = get_or_encode(backend, ref_path, ref_text=ref_text, encoder=encoder)
    return {
        "ok": True,
        "cache_key": lookup.entry.cache_key,
        "cache_hit": lookup.cache_hit,
        "from_disk": lookup.from_disk,
        "backend": backend,
    }
