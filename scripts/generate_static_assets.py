#!/usr/bin/env python3
"""静态资源统一生成入口 — 一键生成某版本某地区的全部静态文件.

Usage:
    conda run -n xuannv python scripts/generate_static_assets.py \
        --version v5.2.1 \
        --region harbin \
        --embeddings-dir /workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025 \
        --patches-meta data/harbin/patches_meta.json

生成内容（按顺序）：
    1. 全域 PCA-RGB mosaic (embeddings/global/)
    2. 语义预设 mosaic (embeddings/semantic/)
    3. 语义概率 mosaic (embeddings/semantic/ 概率热力图版)
    4. Embedding v2 tiles (embeddings/v2/)
    5. 数据源 mosaic (mosaic/s2, s1, landsat)
    6. Patch matrix (matrix/)
    7. 分类 seg tiles (seg_tiles/)
    8. 缩略图 (embeddings/thumbnails/, mosaic/thumbnails/)
    9. manifest.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

from _paths import PROJECT_ROOT, get_embeddings_dir, static_assets_dir

# ── 默认参数 ──
DEFAULT_MONTHS = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10"]
SOURCES = ["s2", "s1", "landsat"]
SEMANTIC_PRESETS = ["water", "building", "forest", "cropland", "bare"]
HEAD_IDS = ["worldcover", "dynamic_world", "jrc_water", "building_extraction"]
SEG_TILE_MONTHS = ["2025-04", "2025-06", "2025-08", "2025-09", "2025-10"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate all static assets for a version/region")
    parser.add_argument("--version", required=True, help="Asset version, e.g. v5.2.1")
    parser.add_argument("--region", default="harbin", help="Region identifier")
    parser.add_argument("--embeddings-dir", default=str(get_embeddings_dir()), help="Path to monthly embeddings")
    parser.add_argument("--patches-meta", default=str(PROJECT_ROOT / "data" / "harbin" / "patches_meta.json"), help="Path to patches_meta.json")
    parser.add_argument("--output-base", default=str(PROJECT_ROOT / "static_assets"), help="Base output directory")
    parser.add_argument("--skip-existing", action="store_true", help="Skip steps whose outputs already exist")
    parser.add_argument("--only-manifest", action="store_true", help="Only regenerate manifest.json")
    parser.add_argument("--thumbnail-max-size", type=int, default=1280, help="Max thumbnail dimension")
    parser.add_argument("--thumbnail-quality", type=int, default=85, help="JPEG quality for thumbnails")
    return parser.parse_args()


def run_script(cmd: list[str], desc: str) -> bool:
    """Run a subprocess script and return success status."""
    print(f"\n{'='*60}")
    print(f"[generate_static_assets] {desc}")
    print(f"  Command: {' '.join(cmd)}")
    print(f"{'='*60}")
    t0 = time.time()
    try:
        result = subprocess.run(cmd, check=True, cwd=str(PROJECT_ROOT))
        elapsed = time.time() - t0
        print(f"[generate_static_assets] {desc} OK in {elapsed:.1f}s")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[generate_static_assets] {desc} FAILED: {e}")
        return False


def ensure_thumbnails_for_dir(src_dir: Path, dst_dir: Path, max_size: int, quality: int) -> dict:
    """为目录下的所有图片生成缩略图，返回统计信息."""
    dst_dir.mkdir(parents=True, exist_ok=True)
    stats = {"generated": 0, "skipped": 0, "errors": 0}
    image_exts = {".png", ".jpg", ".jpeg"}

    for src_path in sorted(src_dir.iterdir()):
        if not src_path.is_file() or src_path.suffix.lower() not in image_exts:
            continue
        dst_path = dst_dir / f"{src_path.stem}.jpg"
        if dst_path.exists():
            stats["skipped"] += 1
            continue
        try:
            with Image.open(src_path) as im:
                im = im.convert("RGB")
                w, h = im.size
                if max(w, h) > max_size:
                    ratio = max_size / max(w, h)
                    new_size = (int(w * ratio), int(h * ratio))
                    im = im.resize(new_size, Image.Resampling.LANCZOS)
                im.save(dst_path, "JPEG", quality=quality, optimize=True)
                stats["generated"] += 1
        except Exception as e:
            print(f"    Thumbnail error for {src_path}: {e}")
            stats["errors"] += 1

    return stats


def generate_thumbnails(base_dir: Path, max_size: int, quality: int) -> dict:
    """生成所有必要的缩略图."""
    results = {}

    # embeddings/global -> embeddings/thumbnails/global
    global_dir = base_dir / "data" / "embeddings" / "global"
    thumb_global = base_dir / "data" / "embeddings" / "thumbnails" / "global"
    if global_dir.exists():
        results["embeddings_global"] = ensure_thumbnails_for_dir(global_dir, thumb_global, max_size, quality)

    # embeddings/semantic/* -> embeddings/thumbnails/semantic/*
    semantic_dir = base_dir / "data" / "embeddings" / "semantic"
    thumb_semantic = base_dir / "data" / "embeddings" / "thumbnails" / "semantic"
    if semantic_dir.exists():
        for preset_dir in sorted(semantic_dir.iterdir()):
            if preset_dir.is_dir():
                results[f"semantic_{preset_dir.name}"] = ensure_thumbnails_for_dir(
                    preset_dir, thumb_semantic / preset_dir.name, max_size, quality
                )

    # embeddings/v2 -> embeddings/thumbnails/v2
    v2_dir = base_dir / "data" / "embeddings" / "v2"
    thumb_v2 = base_dir / "data" / "embeddings" / "thumbnails" / "v2"
    if v2_dir.exists():
        results["embeddings_v2"] = ensure_thumbnails_for_dir(v2_dir, thumb_v2, max_size, quality)

    # mosaic/* -> mosaic/thumbnails/*
    mosaic_dir = base_dir / "data" / "mosaic"
    thumb_mosaic = base_dir / "data" / "mosaic" / "thumbnails"
    if mosaic_dir.exists():
        for source_dir in sorted(mosaic_dir.iterdir()):
            if source_dir.is_dir() and source_dir.name != "thumbnails":
                results[f"mosaic_{source_dir.name}"] = ensure_thumbnails_for_dir(
                    source_dir, thumb_mosaic / source_dir.name, max_size, quality
                )

    return results


def sha256_file(path: Path) -> str:
    """计算文件 SHA256（前 8MB 采样）."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        # 读取前 8MB 作为采样
        h.update(f.read(8 * 1024 * 1024))
    return h.hexdigest()[:16]


def build_manifest(base_dir: Path, version: str, region: str) -> dict:
    """扫描目录结构并生成 manifest.json."""
    print("\n[generate_static_assets] Building manifest.json ...")
    manifest = {
        "version": version,
        "region": region,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "files": [],
    }

    data_dir = base_dir / "data"
    videos_dir = base_dir / "videos"

    for root_dir, label in [(data_dir, "data"), (videos_dir, "videos")]:
        if not root_dir.exists():
            continue
        for path in sorted(root_dir.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(base_dir).as_posix()
            size = path.stat().st_size
            manifest["files"].append({
                "path": rel,
                "size": size,
                "sha256_sample": sha256_file(path),
            })

    manifest["summary"] = {
        "total_files": len(manifest["files"]),
        "total_size_bytes": sum(f["size"] for f in manifest["files"]),
    }

    return manifest


def main() -> int:
    args = parse_args()
    version = args.version
    region = args.region
    base_dir = Path(args.output_base) / version / region
    base_dir.mkdir(parents=True, exist_ok=True)

    print(f"[generate_static_assets] Output: {base_dir}")
    print(f"[generate_static_assets] Version: {version}, Region: {region}")

    if args.only_manifest:
        manifest = build_manifest(base_dir, version, region)
        manifest_path = base_dir / "manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        print(f"[generate_static_assets] Manifest saved: {manifest_path}")
        print(f"[generate_static_assets] Total files: {manifest['summary']['total_files']}")
        print(f"[generate_static_assets] Total size: {manifest['summary']['total_size_bytes'] / 1024 / 1024:.1f} MB")
        return 0

    # ── 1. 全域 PCA-RGB mosaic ──
    global_out = base_dir / "data" / "embeddings" / "global"
    if not args.skip_existing or not any(global_out.glob("*.png")):
        run_script([
            sys.executable, str(PROJECT_ROOT / "scripts" / "generate_global_embedding_mosaic.py"),
            "--embeddings-dir", args.embeddings_dir,
            "--patches-meta", args.patches_meta,
            "--output-dir", str(global_out),
            "--tile-size", "256",
            "--months", ",".join(DEFAULT_MONTHS),
        ], "Global PCA-RGB Mosaic")
    else:
        print("[generate_static_assets] Skipping global mosaic (exists)")

    # ── 2. 语义预设 mosaic ──
    semantic_out = base_dir / "data" / "embeddings" / "semantic"
    if not args.skip_existing or not any(semantic_out.glob("*/*.png")):
        for month in DEFAULT_MONTHS:
            run_script([
                sys.executable, str(PROJECT_ROOT / "scripts" / "generate_global_semantic_mosaics.py"),
                "--embeddings-dir", args.embeddings_dir,
                "--patches-meta", args.patches_meta,
                "--output-dir", str(semantic_out),
                "--tile-size", "256",
                "--month", month,
            ], f"Semantic Mosaic ({month})")
    else:
        print("[generate_static_assets] Skipping semantic mosaic (exists)")

    # ── 3. 语义概率 mosaic ──
    if not args.skip_existing or not any(semantic_out.glob("*/*.png")):
        for month in DEFAULT_MONTHS:
            run_script([
                sys.executable, str(PROJECT_ROOT / "scripts" / "generate_semantic_prob_mosaics.py"),
                "--embeddings-dir", args.embeddings_dir,
                "--patches-meta", args.patches_meta,
                "--output-dir", str(semantic_out),
                "--month", month,
                "--tile-size", "256",
            ], f"Semantic Prob Mosaic ({month})")
    else:
        print("[generate_static_assets] Skipping semantic prob mosaic (exists)")

    # ── 4. Embedding v2 tiles ──
    v2_out = base_dir / "data" / "embeddings" / "v2"
    emb_maps_dir = Path(args.embeddings_dir).parent / "embedding_maps"  # heuristic
    if emb_maps_dir.exists() and (not args.skip_existing or not any(v2_out.glob("*.png"))):
        run_script([
            sys.executable, str(PROJECT_ROOT / "scripts" / "generate_embedding_tiles.py"),
            "--embeddings-dir", str(emb_maps_dir),
            "--output-dir", str(v2_out),
        ], "Embedding V2 Tiles")
    else:
        print("[generate_static_assets] Skipping embedding v2 tiles (not found or exists)")

    # ── 5. 数据源 mosaic ──
    mosaic_out = base_dir / "data" / "mosaic"
    if not args.skip_existing or not any(mosaic_out.glob("*/*.jpg")):
        # precompute_mosaic.py 写死 OUTPUT_DIR = static_assets_dir() / "data" / "mosaic"
        # 需要临时设置环境变量让脚本输出到目标目录
        env = os.environ.copy()
        env["STATIC_ASSETS_OVERRIDE"] = str(base_dir)
        run_script([
            sys.executable, str(PROJECT_ROOT / "scripts" / "precompute_mosaic.py"),
        ], "Data Source Mosaic")
    else:
        print("[generate_static_assets] Skipping data source mosaic (exists)")

    # ── 6. Patch matrix ──
    matrix_out = base_dir / "data" / "matrix"
    if not args.skip_existing or not any(matrix_out.glob("*.jpg")):
        run_script([
            sys.executable, str(PROJECT_ROOT / "scripts" / "precompute_matrix_fast.py"),
        ], "Patch Matrix")
    else:
        print("[generate_static_assets] Skipping matrix (exists)")

    # ── 7. Seg tiles ──
    seg_out = base_dir / "data" / "seg_tiles"
    if not args.skip_existing or not any(seg_out.glob("*/*/*.png")):
        run_script([
            sys.executable, str(PROJECT_ROOT / "scripts" / "precompute_seg_tiles.py"),
        ], "Seg Tiles")
    else:
        print("[generate_static_assets] Skipping seg tiles (exists)")

    # ── 8. 缩略图 ──
    print("\n[generate_static_assets] Generating thumbnails ...")
    thumb_stats = generate_thumbnails(base_dir, args.thumbnail_max_size, args.thumbnail_quality)
    for key, stats in thumb_stats.items():
        print(f"  {key}: generated={stats['generated']}, skipped={stats['skipped']}, errors={stats['errors']}")

    # ── 9. manifest.json ──
    manifest = build_manifest(base_dir, version, region)
    manifest_path = base_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"[generate_static_assets] Manifest saved: {manifest_path}")
    print(f"[generate_static_assets] Total files: {manifest['summary']['total_files']}")
    print(f"[generate_static_assets] Total size: {manifest['summary']['total_size_bytes'] / 1024 / 1024:.1f} MB")

    print("\n[generate_static_assets] All done!")
    print(f"  Next step: python scripts/upload_static_assets.py --version {version} --region {region}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
