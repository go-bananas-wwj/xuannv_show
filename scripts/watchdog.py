#!/usr/bin/env python3
"""
玄女底座展示平台 — 看门狗脚本
实时监控前后端服务状态，自动重启挂掉的服务。

用法:
    # 前台运行（调试用）
    python scripts/watchdog.py

    # 后台常驻运行
    nohup python scripts/watchdog.py > /tmp/xuannv_watchdog.log 2>&1 &
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError

# ── 配置 ──
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHECK_INTERVAL = 30          # 检查间隔（秒）
BACKEND_URL = "http://localhost:8000/health"
FRONTEND_URL = "http://localhost:5173"
BACKEND_LOG = "/tmp/xuannv_backend.log"
FRONTEND_LOG = "/tmp/xuannv_frontend.log"
WATCHDOG_LOG = "/tmp/xuannv_watchdog.log"

# 环境
CONDA_ENV = "xuannv"
CONDA_BIN = f"/opt/conda/envs/{CONDA_ENV}/bin"
NODE_BIN = CONDA_BIN  # npm / node 也在 conda env 中


def log(msg: str) -> None:
    """带时间戳的日志输出。"""
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(WATCHDOG_LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def is_backend_alive() -> bool:
    """检查后端 /health 接口。"""
    try:
        with urlopen(BACKEND_URL, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return data.get("status") == "ok"
    except Exception:
        return False


def is_frontend_alive() -> bool:
    """检查前端 dev server 端口。"""
    try:
        with urlopen(FRONTEND_URL, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


def find_pids(pattern: str) -> list[int]:
    """根据命令行模式查找进程 PID。"""
    try:
        output = subprocess.check_output(
            ["pgrep", "-f", pattern],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return [int(p) for p in output.strip().split("\n") if p.strip()]
    except subprocess.CalledProcessError:
        return []


def kill_service(pattern: str, name: str) -> None:
    """优雅地终止匹配进程。"""
    pids = find_pids(pattern)
    if not pids:
        return
    log(f"  {name}: 发现 {len(pids)} 个残留进程，正在终止...")
    for pid in pids:
        try:
            os.kill(pid, 15)  # SIGTERM
        except ProcessLookupError:
            pass
    time.sleep(2)
    # 强制杀死还在的
    for pid in find_pids(pattern):
        try:
            os.kill(pid, 9)  # SIGKILL
        except ProcessLookupError:
            pass


def start_backend() -> None:
    """启动后端 uvicorn 服务。"""
    backend_dir = PROJECT_ROOT / "backend"
    env = os.environ.copy()
    env["PATH"] = f"{CONDA_BIN}:{env.get('PATH', '')}"

    log("  Backend: 正在启动 uvicorn...")
    with open(BACKEND_LOG, "w", encoding="utf-8") as out:
        subprocess.Popen(
            [
                f"{CONDA_BIN}/python3.11",
                f"{CONDA_BIN}/uvicorn",
                "app.main:app",
                "--host", "0.0.0.0",
                "--port", "8000",
            ],
            cwd=str(backend_dir),
            stdout=out,
            stderr=subprocess.STDOUT,
            env=env,
        )
    # 等待启动完成（最长 120 秒）
    for i in range(120):
        time.sleep(1)
        if is_backend_alive():
            log("  Backend: 启动成功 ✓")
            return
    log("  Backend: 启动超时 ✗")


def start_frontend() -> None:
    """启动前端 Vite dev server。"""
    frontend_dir = PROJECT_ROOT / "frontend"
    env = os.environ.copy()
    env["PATH"] = f"{NODE_BIN}:{env.get('PATH', '')}"

    log("  Frontend: 正在启动 vite dev server...")
    with open(FRONTEND_LOG, "w", encoding="utf-8") as out:
        subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=str(frontend_dir),
            stdout=out,
            stderr=subprocess.STDOUT,
            env=env,
        )
    # 等待启动完成（最长 30 秒）
    for i in range(30):
        time.sleep(1)
        if is_frontend_alive():
            log("  Frontend: 启动成功 ✓")
            return
    log("  Frontend: 启动超时 ✗")


def main() -> None:
    log("=" * 50)
    log("玄女底座看门狗启动")
    log(f"检查间隔: {CHECK_INTERVAL}s | 后端: {BACKEND_URL} | 前端: {FRONTEND_URL}")
    log("=" * 50)

    # 首次启动：如果服务不在运行，立即拉起
    if not is_backend_alive():
        log("【首次】后端未运行，立即启动...")
        kill_service("uvicorn app.main:app", "Backend")
        start_backend()
    else:
        log("【首次】后端运行正常 ✓")

    if not is_frontend_alive():
        log("【首次】前端未运行，立即启动...")
        kill_service("vite", "Frontend")
        start_frontend()
    else:
        log("【首次】前端运行正常 ✓")

    # 主循环
    while True:
        time.sleep(CHECK_INTERVAL)

        backend_ok = is_backend_alive()
        frontend_ok = is_frontend_alive()

        if backend_ok and frontend_ok:
            # 每 10 次正常检查输出一次心跳，避免日志刷屏
            continue

        log("-" * 40)
        if not backend_ok:
            log("【告警】后端无响应，正在重启...")
            kill_service("uvicorn app.main:app", "Backend")
            start_backend()
        else:
            log("  Backend: 正常 ✓")

        if not frontend_ok:
            log("【告警】前端无响应，正在重启...")
            kill_service("vite", "Frontend")
            start_frontend()
        else:
            log("  Frontend: 正常 ✓")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("看门狗收到中断信号，退出。")
        sys.exit(0)
