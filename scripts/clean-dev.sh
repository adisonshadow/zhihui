#!/bin/bash
# 清理开发缓存后重新启动，用于排查白屏等问题
cd "$(dirname "$0")/.."
echo "清理 node_modules/.vite dist dist-electron..."
rm -rf node_modules/.vite dist dist-electron 2>/dev/null || true
echo "执行 yarn dev..."
yarn dev
