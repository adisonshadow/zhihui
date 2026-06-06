#!/usr/bin/env python3
"""
Yiman 本地音效常驻服务入口。
python/env/bin/python sfx_main.py --backend sfx_moss --model <dir> --port 54324
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback

from moss_sound_effect_server import run as run_moss_sfx

_DEFAULT_PORTS = {"sfx_moss": 54324}


def main() -> None:
    parser = argparse.ArgumentParser(description="Yiman local SFX resident server")
    parser.add_argument("--backend", choices=("sfx_moss",), required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    port = args.port if args.port is not None else _DEFAULT_PORTS[args.backend]
    if args.backend == "sfx_moss":
        run_moss_sfx(args.model, port, args.timeout)


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
                    "backend": "sfx_moss",
                    "error": str(e),
                    "traceback": tb[-12000:],
                },
            ),
            flush=True,
        )
        print(tb, file=sys.stderr, flush=True)
        sys.exit(1)
