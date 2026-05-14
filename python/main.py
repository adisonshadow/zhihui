#!/usr/bin/env python3
"""
Yiman 本地 TTS 常驻服务总入口。
由 AI 模型服务以嵌入式解释器启动：python/env/bin/python main.py --backend longcat|moss ...
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback

from longcat_audio_dit_server import run as run_longcat
from moss_tts_server import run as run_moss


def main() -> None:
    parser = argparse.ArgumentParser(description="Yiman local TTS resident server")
    parser.add_argument("--backend", choices=("longcat", "moss"), required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--python-path", default=None, help="兼容参数，忽略")
    args = parser.parse_args()
    port = args.port if args.port is not None else (54321 if args.backend == "longcat" else 54322)
    if args.backend == "longcat":
        run_longcat(args.model, port, args.timeout)
    else:
        run_moss(args.model, port, args.timeout)


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
