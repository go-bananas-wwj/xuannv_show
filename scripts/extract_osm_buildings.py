#!/usr/bin/env python3
"""从 OpenStreetMap 提取建筑物数据并栅格化为各 patch 的 GT TIFF.

策略: 一次性下载整个区域的 OSM buildings，然后按 patch 裁剪栅格化。

Usage:
    cd /workspace/xuannv_show
    conda run -n xuannv python scripts/extract_osm_buildings.py \
        --region harbin \
        --patches-meta data/harbin/patches_meta.json \
        --output-dir /workspace/raw/harbin_scenes/osm_buildings
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio import features
from rasterio.transform import from_bounds
from tqdm import tqdm


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract OSM buildings as patch GT TIFFs")
    parser.add_argument("--region", required=True, help="Region identifier")
    parser.add_argument("--patches-meta", required=True, help="Path to patches_meta.json")
    parser.add_argument("--output-dir", required=True, help="Output directory for OSM building TIFFs")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing files")
    return parser.parse_args()


def download_osm_buildings(bounds_wgs84: tuple[float, float, float, float]) -> dict:
    """从 Overpass API 下载指定 bbox 内的 OSM buildings.
    
    Returns raw Overpass JSON response.
    """
    import requests

    min_lon, min_lat, max_lon, max_lat = bounds_wgs84
    # south, west, north, east
    query = f"""[out:json];way[building]({min_lat},{min_lon},{max_lat},{max_lon});(._;>;);out body;"""

    resp = requests.post(
        "https://overpass-api.de/api/interpreter",
        data={"data": query},
        headers={"User-Agent": "xuannv-osm-extract/1.0"},
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()


def overpass_to_geodataframe(data: dict) -> "geopandas.GeoDataFrame | None":
    """将 Overpass JSON 转换为 GeoDataFrame (Polygon)."""
    import geopandas as gpd
    from shapely.geometry import Polygon

    nodes = {}
    ways = []
    for element in data.get("elements", []):
        if element["type"] == "node":
            nodes[element["id"]] = (element["lon"], element["lat"])
        elif element["type"] == "way":
            ways.append(element)

    if not ways:
        return None

    polygons = []
    for way in ways:
        node_ids = way.get("nodes", [])
        coords = [nodes.get(nid) for nid in node_ids if nid in nodes]
        if len(coords) >= 3:
            # Close polygon if needed
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            try:
                poly = Polygon(coords)
                if poly.is_valid and poly.area > 0:
                    polygons.append(poly)
            except Exception:
                pass

    if not polygons:
        return None

    gdf = gpd.GeoDataFrame(geometry=polygons, crs="EPSG:4326")
    return gdf


def rasterize_buildings_for_patch(
    patch: dict,
    buildings_gdf: "geopandas.GeoDataFrame",
    output_dir: Path,
    overwrite: bool = False,
) -> bool:
    """为单个 patch 栅格化建筑物并保存为 TIFF."""
    patch_id = patch["patch_id"]
    patch_out_dir = output_dir / patch_id
    patch_out_dir.mkdir(parents=True, exist_ok=True)
    out_path = patch_out_dir / "static.tif"

    if out_path.exists() and not overwrite:
        return True

    crs = patch.get("crs", "EPSG:32652")
    bounds_utm = patch.get("bounds")
    if not bounds_utm or len(bounds_utm) != 4:
        print(f"[{patch_id}] Invalid bounds")
        return False

    try:
        # 转换 buildings 到 patch 的 CRS
        patch_gdf = buildings_gdf.to_crs(crs)

        # 裁剪到 patch bounds
        min_x, min_y, max_x, max_y = bounds_utm
        patch_gdf = patch_gdf.cx[min_x:max_x, min_y:max_y]

        height, width = 256, 256
        transform = from_bounds(min_x, min_y, max_x, max_y, width, height)

        if patch_gdf.empty:
            burned = np.zeros((height, width), dtype=np.uint8)
        else:
            shapes = ((geom, 1) for geom in patch_gdf.geometry if geom.is_valid)
            burned = features.rasterize(
                shapes=shapes,
                out_shape=(height, width),
                transform=transform,
                fill=0,
                default_value=1,
                dtype=np.uint8,
            )

        with rasterio.open(
            out_path,
            "w",
            driver="GTiff",
            height=height,
            width=width,
            count=1,
            dtype=burned.dtype,
            crs=crs,
            transform=transform,
            compress="lzw",
        ) as dst:
            dst.write(burned, 1)

        return True
    except Exception as e:
        print(f"[{patch_id}] Rasterization failed: {e}")
        _create_empty_tiff(out_path, bounds_utm, crs)
        return True


def _create_empty_tiff(out_path: Path, bounds: list, crs: str) -> None:
    """创建全 0 的占位 TIFF."""
    min_x, min_y, max_x, max_y = bounds
    height, width = 256, 256
    transform = from_bounds(min_x, min_y, max_x, max_y, width, height)
    empty = np.zeros((height, width), dtype=np.uint8)
    with rasterio.open(
        out_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype=empty.dtype,
        crs=crs,
        transform=transform,
        compress="lzw",
    ) as dst:
        dst.write(empty, 1)


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(args.patches_meta) as f:
        patches = json.load(f)

    # 计算整体 bbox
    all_bounds = [p["bounds_wgs84"] for p in patches if p.get("bounds_wgs84")]
    if not all_bounds:
        print("No bounds found in patches_meta.json")
        return

    min_lon = min(b[0] for b in all_bounds)
    min_lat = min(b[1] for b in all_bounds)
    max_lon = max(b[2] for b in all_bounds)
    max_lat = max(b[3] for b in all_bounds)
    region_bbox = (min_lon, min_lat, max_lon, max_lat)
    print(f"Region bbox (WGS84): {region_bbox}")

    # 一次性下载整个区域的 OSM buildings
    print("Downloading OSM buildings from Overpass API...")
    try:
        overpass_data = download_osm_buildings(region_bbox)
        buildings_gdf = overpass_to_geodataframe(overpass_data)
        if buildings_gdf is None:
            print("No buildings found in the region.")
            return
        print(f"Downloaded {len(buildings_gdf)} building polygons")
    except Exception as e:
        print(f"OSM download failed: {e}")
        return

    # 逐个 patch 栅格化
    print(f"Rasterizing for {len(patches)} patches...")
    success = 0
    failed = 0
    for patch in tqdm(patches):
        if rasterize_buildings_for_patch(patch, buildings_gdf, output_dir, args.overwrite):
            success += 1
        else:
            failed += 1

    print(f"\nDone. Success: {success}, Failed: {failed}")
    print(f"Output directory: {output_dir}")


if __name__ == "__main__":
    main()
