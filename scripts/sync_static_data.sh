#!/bin/bash
# 将离线生成的数据同步到 frontend/public/ 目录，供网页端静态加载
# Usage: ./scripts/sync_static_data.sh

set -e

echo "[sync_static_data] 同步离线数据到 frontend/public/data/"

# patches_meta.json
mkdir -p frontend/public/data
cp data/harbin/patches_meta.json frontend/public/data/patches_meta.json
echo "  ✓ patches_meta.json"

# embedding previews
if [ -d "data/harbin/embeddings/v2" ]; then
  mkdir -p frontend/public/data/embeddings/v2
  cp data/harbin/embeddings/v2/*.png frontend/public/data/embeddings/v2/
  count=$(ls frontend/public/data/embeddings/v2/*.png 2>/dev/null | wc -l)
  echo "  ✓ embedding previews: $count 张"
else
  echo "  ⚠ data/harbin/embeddings/v2/ 不存在，跳过"
fi

echo "[sync_static_data] 完成"
