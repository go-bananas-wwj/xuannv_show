#!/bin/bash
# 一键初始化新地区展示数据
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REGION=""
PATCHES_DIR=""
EMBEDDINGS_DIR=""
BOUNDS=""
OUTPUT_DIR=""
GRID_PATH=""
RAW_DIR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --patches-dir) PATCHES_DIR="$2"; shift 2 ;;
    --embeddings-dir) EMBEDDINGS_DIR="$2"; shift 2 ;;
    --bounds) BOUNDS="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --grid) GRID_PATH="$2"; shift 2 ;;
    --raw-dir) RAW_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$REGION" || -z "$OUTPUT_DIR" ]]; then
  echo "Usage: $0 --region <name> --output-dir <path> [options]"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"

echo "========================================"
echo "Setting up region: $REGION"
echo "Output: $OUTPUT_DIR"
echo "========================================"

if [[ -n "$GRID_PATH" && -n "$RAW_DIR" ]]; then
  echo "[1/3] Generating patches metadata..."
  python3 "$SCRIPT_DIR/generate_patch_meta.py" \
    --region "$REGION" \
    --grid "$GRID_PATH" \
    --raw-dir "$RAW_DIR" \
    --output-dir "$OUTPUT_DIR"
else
  echo "[1/3] Skipping patches metadata"
fi

if [[ -n "$EMBEDDINGS_DIR" ]]; then
  echo "[2/3] Generating embedding preview tiles..."
  python3 "$SCRIPT_DIR/generate_embedding_tiles.py" \
    --embeddings-dir "$EMBEDDINGS_DIR" \
    --output-dir "$OUTPUT_DIR/embeddings/v2" \
    --max-patches 500
else
  echo "[2/3] Skipping embedding tiles"
fi

CONFIG_PATH="$OUTPUT_DIR/config.json"
echo "[3/3] Generating frontend config..."
cat > "$CONFIG_PATH" <<EOF
{
  "region": "$REGION",
  "name": "$REGION",
  "bounds": [${BOUNDS:-"0,0,0,0"}],
  "patches": "./data/$REGION/patches_meta.json",
  "embeddings": "./data/$REGION/embeddings/",
  "available_heads": ["change_detection", "multiclass_cd", "fewshot"],
  "time_range": ["2023-01", "2025-10"],
  "sources": ["S2", "S1", "Landsat", "S2-HR", "S1-HR"]
}
EOF

echo "========================================"
echo "Setup complete for region: $REGION"
echo "Config: $CONFIG_PATH"
echo "========================================"
