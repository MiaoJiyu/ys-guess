#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================================"
echo "  提瓦特 · 元素猜谜 - 局域网启动"
echo "============================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[异常] 未检测到 Node.js。"
  echo "[处理] 请安装 Node.js 20 或更高版本：https://nodejs.org/zh-cn/download"
  exit 1
fi

MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$MAJOR" -lt 20 ]; then
  echo "[异常] 当前 Node.js 版本过低：$(node -v)"
  echo "[处理] 请升级到 Node.js 20 或更高版本：https://nodejs.org/zh-cn/download"
  exit 1
fi

echo "[环境检测] Node.js $(node -v) 已就绪。"
echo "[启动] 正在启动局域网服务，请保留本终端。"
echo "[日志] logs/lan-server.log"
echo
exec node server.js "$@"
