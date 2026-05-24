#!/usr/bin/env python3
"""静态资源上传脚本 — 将本地版本化静态文件推送到 ModelScope 数据集.

Usage:
    export MODELSCOPE_TOKEN=your_token_here
    conda run -n xuannv python scripts/upload_static_assets.py \
        --version v5.2.1 \
        --region harbin \
        --dataset WeijieWu/xuannv_embdding

环境变量:
    MODELSCOPE_TOKEN — ModelScope API Token（必需，也可通过 --token 传入）
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from _paths import PROJECT_ROOT, static_assets_dir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload static assets to ModelScope dataset")
    parser.add_argument("--version", required=True, help="Asset version, e.g. v5.2.1")
    parser.add_argument("--region", default="harbin", help="Region identifier")
    parser.add_argument("--dataset", default="WeijieWu/xuannv_embdding", help="Target ModelScope dataset")
    parser.add_argument("--token", default=os.environ.get("MODELSCOPE_TOKEN", ""), help="ModelScope API token")
    parser.add_argument("--base-dir", default=str(PROJECT_ROOT / "static_assets"), help="Local base directory")
    parser.add_argument("--dry-run", action="store_true", help="Validate manifest without uploading")
    parser.add_argument("--max-workers", type=int, default=8, help="Upload concurrency")
    return parser.parse_args()


def validate_manifest(manifest_path: Path) -> dict:
    """验证 manifest.json 的完整性."""
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    with open(manifest_path) as f:
        manifest = json.load(f)

    base_dir = manifest_path.parent
    errors = []
    warnings_list = []
    total_size = 0
    checked = 0

    for entry in manifest.get("files", []):
        rel_path = entry["path"]
        expected_size = entry["size"]
        file_path = base_dir / rel_path

        if not file_path.exists():
            errors.append(f"MISSING: {rel_path}")
            continue

        actual_size = file_path.stat().st_size
        if actual_size != expected_size:
            warnings_list.append(f"SIZE_MISMATCH: {rel_path} (manifest={expected_size}, actual={actual_size})")

        total_size += actual_size
        checked += 1

    result = {
        "valid": len(errors) == 0,
        "checked": checked,
        "errors": errors,
        "warnings": warnings_list,
        "total_size_mb": total_size / 1024 / 1024,
    }
    return result, manifest


def upload_folder(api, repo_id: str, folder_path: Path, path_in_repo: str, token: str, max_workers: int) -> bool:
    """Upload a folder to ModelScope dataset."""
    try:
        result = api.upload_folder(
            repo_id=repo_id,
            folder_path=str(folder_path),
            path_in_repo=path_in_repo,
            repo_type="dataset",
            token=token,
            commit_message=f"Upload static assets {path_in_repo}",
            commit_description=f"Generated at {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}",
            max_workers=max_workers,
        )
        print(f"[upload] Upload result: {result}")
        return True
    except Exception as e:
        print(f"[upload] Upload failed: {e}")
        return False


def main() -> int:
    args = parse_args()

    if not args.token and not args.dry_run:
        print("[upload] ERROR: ModelScope token is required.")
        print("  Set MODELSCOPE_TOKEN env var or pass --token")
        return 1

    base_dir = Path(args.base_dir) / args.version / args.region
    manifest_path = base_dir / "manifest.json"

    print(f"[upload] Base dir: {base_dir}")
    print(f"[upload] Dataset: {args.dataset}")
    print(f"[upload] Version: {args.version}, Region: {args.region}")

    # ── 验证 manifest ──
    print("\n[upload] Validating manifest.json ...")
    try:
        validation, manifest = validate_manifest(manifest_path)
    except FileNotFoundError as e:
        print(f"[upload] ERROR: {e}")
        return 1

    print(f"[upload] Checked files: {validation['checked']}")
    print(f"[upload] Total size: {validation['total_size_mb']:.1f} MB")
    if validation["warnings"]:
        print(f"[upload] Warnings: {len(validation['warnings'])}")
        for w in validation["warnings"][:5]:
            print(f"  - {w}")
        if len(validation["warnings"]) > 5:
            print(f"  ... and {len(validation['warnings']) - 5} more")
    if validation["errors"]:
        print(f"[upload] ERRORS: {len(validation['errors'])}")
        for e in validation["errors"][:10]:
            print(f"  - {e}")
        if len(validation["errors"]) > 10:
            print(f"  ... and {len(validation['errors']) - 10} more")
        return 1

    print("[upload] Manifest validation PASSED")

    if args.dry_run:
        print("[upload] Dry run mode — skipping actual upload")
        return 0

    # ── 上传 ──
    print("\n[upload] Initializing ModelScope API ...")
    try:
        from modelscope.hub.api import HubApi
    except ImportError as e:
        print(f"[upload] ERROR: modelscope not installed: {e}")
        return 1

    api = HubApi()
    try:
        api.login(args.token)
        print("[upload] Login OK")
    except Exception as e:
        print(f"[upload] Login failed: {e}")
        return 1

    path_in_repo = f"static_assets/{args.version}/{args.region}"
    print(f"[upload] Uploading to {args.dataset}/{path_in_repo} ...")
    print(f"[upload] This may take a while for {validation['checked']} files ({validation['total_size_mb']:.1f} MB)")

    t0 = time.time()
    success = upload_folder(
        api, args.dataset, base_dir, path_in_repo, args.token, args.max_workers
    )
    elapsed = time.time() - t0

    if success:
        print(f"\n[upload] SUCCESS in {elapsed:.1f}s")
        print(f"[upload] Files: {validation['checked']}")
        print(f"[upload] Size: {validation['total_size_mb']:.1f} MB")
        print(f"[upload] URL: https://modelscope.cn/datasets/{args.dataset}/files")
        return 0
    else:
        print(f"\n[upload] FAILED after {elapsed:.1f}s")
        return 1


if __name__ == "__main__":
    sys.exit(main())
