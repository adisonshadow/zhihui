"""解析 MOSS-TTS-Nano 本地权重目录（ModelScope 根目录 / mlx-community 子目录）。"""
from __future__ import annotations

import json
import os
from pathlib import Path

_NANO_SUBDIR_NAMES = (
    "mlx-int8",
    "mlx",
    "MOSS-TTS-Nano-100M",
    "MOSS-TTS-Nano",
    "openmoss/MOSS-TTS-Nano",
)


def dir_has_mlx_nano_weights(path: Path) -> bool:
    if not path.is_dir():
        return False
    if not (path / "config.json").is_file():
        return False
    if (path / "model.safetensors").is_file():
        return True
    if (path / "model.safetensors.index.json").is_file():
        return True
    return any(p.suffix == ".safetensors" for p in path.iterdir() if p.is_file())


def dir_looks_hf_only(path: Path) -> bool:
    """有 config 但无 MLX safetensors，多为 ModelScope/HF 原始权重。"""
    if not path.is_dir() or not (path / "config.json").is_file():
        return False
    if dir_has_mlx_nano_weights(path):
        return False
    if (path / "pytorch_model.bin").is_file():
        return True
    if (path / "model.safetensors.index.json").is_file() and not any(
        p.name.startswith("model-") and p.suffix == ".safetensors" for p in path.iterdir()
    ):
        # HF 分片常 model-00001-of-00002.safetensors；MLX 社区包也可能分片，故再结合 model_type
        try:
            cfg = json.loads((path / "config.json").read_text(encoding="utf-8"))
            mt = str(cfg.get("model_type", "")).lower()
            if mt and mt != "moss_tts_nano":
                return True
        except (OSError, json.JSONDecodeError):
            pass
    try:
        cfg = json.loads((path / "config.json").read_text(encoding="utf-8"))
        return str(cfg.get("model_type", "")).lower() not in ("", "moss_tts_nano")
    except (OSError, json.JSONDecodeError):
        return False


def resolve_mlx_nano_model_dir(model_root: str | Path) -> Path | None:
    root = Path(model_root).expanduser().resolve()
    if not root.is_dir():
        return None
    if dir_has_mlx_nano_weights(root):
        return root
    for name in _NANO_SUBDIR_NAMES:
        cand = root / name
        if dir_has_mlx_nano_weights(cand):
            return cand
    try:
        for child in sorted(root.iterdir()):
            if child.is_dir() and dir_has_mlx_nano_weights(child):
                return child
    except OSError:
        pass
    return None


def diagnose_nano_model_root(model_root: str | Path) -> dict:
    root = Path(model_root).expanduser().resolve()
    resolved = resolve_mlx_nano_model_dir(root)
    if resolved is not None:
        return {
            "ok": True,
            "resolved": str(resolved),
            "root": str(root),
        }
    if dir_looks_hf_only(root):
        return {
            "ok": False,
            "kind": "hf_only",
            "root": str(root),
            "message": (
                "检测到 HuggingFace / ModelScope 原始权重（非 MLX）。"
                "请任选其一：① 从 Hugging Face 下载 mlx-community/MOSS-TTS-Nano-100M；"
                "② 用 mlx-lm 转换：python -m mlx_lm.convert --hf-path <本目录> --mlx-path <输出MLX目录>"
            ),
        }
    return {
        "ok": False,
        "kind": "not_found",
        "root": str(root),
        "message": (
            "未找到含 config.json 与 *.safetensors 的 MLX 权重目录。"
            "请指向 mlx-community/MOSS-TTS-Nano-100M 解压目录，或 ModelScope 下载包内已转换的 mlx 子目录。"
        ),
    }
