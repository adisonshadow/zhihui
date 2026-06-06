#!/usr/bin/env python3
"""
Yiman 本地 TTS 常驻服务总入口。
由 AI 模型服务以嵌入式解释器启动：python/env/bin/python main.py --backend longcat|moss|moss_nano ...
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback

from longcat_audio_dit_server import run as run_longcat
from moss_tts_server import run as run_moss
from moss_tts_nano_server import run as run_moss_nano

_DEFAULT_PORTS = {"longcat": 54321, "moss": 54322, "moss_nano": 54323}


def main() -> None:
    parser = argparse.ArgumentParser(description="Yiman local TTS resident server")
    parser.add_argument("--backend", choices=("longcat", "moss", "moss_nano"), required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--python-path", default=None, help="兼容参数，忽略")
    args = parser.parse_args()
    port = args.port if args.port is not None else _DEFAULT_PORTS[args.backend]
    if args.backend == "longcat":
        run_longcat(args.model, port, args.timeout)
    elif args.backend == "moss":
        run_moss(args.model, port, args.timeout)
    else:
        run_moss_nano(args.model, port, args.timeout)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException as e:
        tb = traceback.format_exc()
        print(
            json.dumps(
                {
                    "event": "error",
                    "backend": "unknown",
                    "error": str(e),
                    "traceback": tb[-12000:],
                },
            ),
            flush=True,
        )
        print(tb, file=sys.stderr, flush=True)
        sys.exit(1)
