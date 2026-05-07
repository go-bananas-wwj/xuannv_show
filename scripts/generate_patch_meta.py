#!/usr/bin/env python3
"""扫描栅格目录，生成 patches_meta.json.

Usage:
    python scripts/generate_patch_meta.py \
        --region <region> \
        --grid /path/to/grid.geojson \
        --raw-dir /path/to/raw_scenes \
        --output-dir data/<region>
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pyproj


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate patches metadata JSON")
    parser.add_argument("--region", required=True, help="Region identifier")
    parser.add_argument("--grid", required=True, help="Path to grid GeoJSON")
    parser.add_argument("--raw-dir", required=True, help="Path to raw data directory")
    parser.add_argument("--output-dir", required=True, help="Output directory")
    return parser.parse_args()


def convert_utm_to_wgs84(bounds: list[float], crs: str) -> list[float]:
    """将 UTM bounds 转为 WGS84 [min_lon, min_lat, max_lon, max_lat]."""
    try:
        epsg = crs.replace("EPSG:", "")
        transformer = pyproj.Transformer.from_crs(
            f"EPSG:{epsg}", "EPSG:4326", always_xy=True
        )
        min_lon, min_lat = transformer.transform(bounds[0], bounds[1])
        max_lon, max_lat = transformer.transform(bounds[2], bounds[3])
        return [round(min_lon, 6), round(min_lat, 6), round(max_lon, 6), round(max_lat, 6)]
    except Exception:
        return []


def scan_sources(raw_dir: Path, patch_id: str) -> dict[str, int]:
    """扫描 raw_dir 下各传感器目录中 patch_id 子目录的帧数."""
    sources: dict[str, int] = {}
    if not raw_dir.exists():
        return sources
    for src_dir in sorted(raw_dir.iterdir()):
        if not src_dir.is_dir():
            continue
        patch_src_dir = src_dir / patch_id
        if patch_src_dir.is_dir():
            n_tif = len(list(patch_src_dir.glob("*.tif")))
            n_tiff = len(list(patch_src_dir.glob("*.tiff")))
            n_png = len(list(patch_src_dir.glob("*.png")))
            count = n_tif + n_tiff + n_png
            if count > 0:
                sources[src_dir.name] = count
    return sources


def main() -> None:
    args = parse_args()
    grid_path = Path(args.grid)
    raw_dir = Path(args.raw_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[generate_patch_meta] Loading grid from {grid_path}")
    with open(grid_path) as f:
        grid = json.load(f)

    patches: list[dict[str, Any]] = []
    for feat in grid.get("features", []):
        props = feat.get("properties", {})
        pid = props.get("patch_id")
        if not pid:
            continue

        bounds = props.get("bounds", [])
        crs = props.get("crs", "EPSG:32652")
        ix = props.get("ix", 0)
        iy = props.get("iy", 0)

        sources = scan_sources(raw_dir, pid)

        patch_meta: dict[str, Any] = {
            "patch_id": pid,
            "ix": ix,
            "iy": iy,
            "bounds": bounds,
            "bounds_wgs84": convert_utm_to_wgs84(bounds, crs) if bounds else [],
            "crs": crs,
            "sources": sources,
            "time_range": ["2023-01", "2025-10"],
        }
        patches.append(patch_meta)

    output_path = output_dir / "patches_meta.json"
    with open(output_path, "w") as f:
        json.dump(patches, f, indent=2, ensure_ascii=False)

    print(f"[generate_patch_meta] Generated {len(patches)} patches -> {output_path}")


if __name__ == "__main__":
    main()
