#!/bin/bash
# 将离线生成的数据同步到 frontend/public/ 目录，供网页端静态加载
# Usage: ./scripts/sync_static_data.sh [region]
#   region: 地区标识，默认 harbin

set -e

REGION="${1:-harbin}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")"

echo "[sync_static_data] 同步 $REGION 离线数据到 frontend/public/data/"

# patches_meta.json
mkdir -p frontend/public/data
if [ -f "data/$REGION/patches_meta.json" ]; then
  cp "data/$REGION/patches_meta.json" frontend/public/data/patches_meta.json
  echo "  ✓ patches_meta.json"
else
  echo "  ⚠ data/$REGION/patches_meta.json 不存在，跳过"
fi

# embedding previews
if [ -d "data/$REGION/embeddings/v2" ]; then
  mkdir -p frontend/public/data/embeddings/v2
  cp "data/$REGION/embeddings/v2/*.png" frontend/public/data/embeddings/v2/ 2>/dev/null || true
  count=$(ls frontend/public/data/embeddings/v2/*.png 2>/dev/null | wc -l)
  echo "  ✓ embedding previews: $count 张"
else
  echo "  ⚠ data/$REGION/embeddings/v2/ 不存在，跳过"
fi

echo "[sync_static_data] 完成"
