"""解析 MOSS-SoundEffect 本地 MLX 权重目录。"""
from __future__ import annotations

import json
from pathlib import Path

_SFX_SUBDIR_NAMES = (
    "mlx-4bit",
    "mlx-int8",
    "mlx",
    "MOSS-SoundEffect-MLX-4bit",
    "MOSS-SoundEffect",
    "openmoss-sound-effect-mlx",
)


def dir_has_mlx_sfx_weights(path: Path) -> bool:
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
    if not path.is_dir() or not (path / "config.json").is_file():
        return False
    if dir_has_mlx_sfx_weights(path):
        return False
    if (path / "pytorch_model.bin").is_file():
        return True
    try:
        cfg = json.loads((path / "config.json").read_text(encoding="utf-8"))
        mt = str(cfg.get("model_type", "")).lower()
        if mt and "moss" not in mt and "delay" not in mt:
            return True
    except (OSError, json.JSONDecodeError):
        pass
    return False


def resolve_mlx_sfx_model_dir(model_root: str | Path) -> Path | None:
    root = Path(model_root).expanduser().resolve()
    if not root.is_dir():
        return None
    if dir_has_mlx_sfx_weights(root):
        return root
    for name in _SFX_SUBDIR_NAMES:
        cand = root / name
        if dir_has_mlx_sfx_weights(cand):
            return cand
    try:
        for child in sorted(root.iterdir()):
            if child.is_dir() and dir_has_mlx_sfx_weights(child):
                return child
    except OSError:
        pass
    return None


def diagnose_sfx_model_root(model_root: str | Path) -> dict:
    root = Path(model_root).expanduser().resolve()
    resolved = resolve_mlx_sfx_model_dir(root)
    if resolved is not None:
        return {"ok": True, "resolved": str(resolved), "root": str(root)}
    if dir_looks_hf_only(root):
        return {
            "ok": False,
            "kind": "hf_only",
            "root": str(root),
            "message": (
                "检测到非 MLX 权重（如 pytorch_model.bin）。"
                "请下载 mlx-community/MOSS-SoundEffect-MLX-4bit 并指向含 safetensors 的目录。"
            ),
        }
    return {
        "ok": False,
        "kind": "not_found",
        "root": str(root),
        "message": (
            "未找到含 config.json 与 *.safetensors 的 MLX 权重。"
            "请指向 ModelScope：mlx-community/MOSS-SoundEffect-MLX-4bit（或其中 mlx-4bit 子目录）。"
        ),
    }
