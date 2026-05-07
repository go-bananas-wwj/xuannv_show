#!/usr/bin/env python3
"""前后端服务看门狗 — 自动检测并重启挂掉的服务."""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

# ── 配置 ──
PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
BACKEND_DIR = PROJECT_ROOT / "backend"
CONDA_ENV = "xuannv"
FRONTEND_PORT = 5173
BACKEND_PORT = 8000
FRONTEND_LOG = Path("/tmp/xuannv_watchdog_frontend.log")
BACKEND_LOG = Path("/tmp/xuannv_watchdog_backend.log")
WATCHDOG_LOG = Path("/tmp/xuannv_watchdog.log")
CHECK_INTERVAL = 10  # 秒
HEALTH_TIMEOUT = 5   # 秒


def log(msg: str) -> None:
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(WATCHDOG_LOG, "a") as f:
        f.write(line + "\n")


def is_process_running(cmd_keyword: str) -> bool:
    """检查包含关键字的进程是否在运行."""
    try:
        result = subprocess.run(
            ["pgrep", "-f", cmd_keyword],
            capture_output=True,
            text=True,
            timeout=3,
        )
        return result.returncode == 0 and bool(result.stdout.strip())
    except Exception:
        return False


def is_port_listening(port: int) -> bool:
    """检查端口是否正在被监听."""
    try:
        import socket
        with socket.create_connection(("127.0.0.1", port), timeout=HEALTH_TIMEOUT):
            return True
    except Exception:
        return False


def is_backend_healthy() -> bool:
    """通过 HTTP 请求检查后端健康状态."""
    try:
        import urllib.request
        with urllib.request.urlopen(
            f"http://127.0.0.1:{BACKEND_PORT}/api/patches",
            timeout=HEALTH_TIMEOUT,
        ) as resp:
            return resp.status == 200
    except Exception:
        return False


def kill_processes(cmd_keyword: str) -> None:
    """杀掉包含关键字的进程."""
    try:
        subprocess.run(
            ["pkill", "-9", "-f", cmd_keyword],
            capture_output=True,
            timeout=5,
        )
        time.sleep(1)
    except Exception as e:
        log(f"kill_processes({cmd_keyword}) warning: {e}")


def kill_port_process(port: int) -> None:
    """通过端口查找并杀掉占用进程（备选方案）."""
    try:
        # 尝试用 fuser 杀端口占用
        subprocess.run(
            ["fuser", "-k", f"{port}/tcp"],
            capture_output=True,
            timeout=5,
        )
        time.sleep(1)
    except Exception:
        pass
    try:
        # 备选：lsof + kill
        result = subprocess.run(
            ["lsof", "-t", f"-i:{port}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            for pid in result.stdout.strip().splitlines():
                if pid:
                    subprocess.run(["kill", "-9", pid], capture_output=True, timeout=3)
            time.sleep(1)
    except Exception:
        pass


def start_frontend() -> None:
    """启动前端 Vite 开发服务器."""
    log("[frontend] 启动中...")
    kill_processes(r"node.*vite.*--host")
    kill_processes(r"npm run dev.*--host")
    cmd = (
        f"cd {FRONTEND_DIR} && "
        f"conda run -n {CONDA_ENV} nohup npm run dev -- --host 0.0.0.0 "
        f"> {FRONTEND_LOG} 2>&1 &"
    )
    subprocess.Popen(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)
    log("[frontend] 启动命令已下发")


def start_backend() -> None:
    """启动后端 Uvicorn 服务.
    
    注意：不使用 --reload 模式，因为：
    1. lifespan 中的 SAM3 预热需要 20~30s，--reload 的 multiprocessing 模式会导致
       子进程在预热期间无法监听端口，看门狗误判为异常而反复重启
    2. 生产/稳定运行环境不需要代码热重载
    """
    log("[backend] 启动中...")
    kill_processes(r"uvicorn app\.main:app")
    kill_port_process(BACKEND_PORT)
    kill_processes(r"python.*multiprocessing.*spawn_main")
    cmd = (
        f"cd {BACKEND_DIR} && "
        f"PYTHONPATH={BACKEND_DIR}:{BACKEND_DIR}/sam3 "
        f"conda run -n {CONDA_ENV} nohup uvicorn app.main:app --host 0.0.0.0 --port {BACKEND_PORT} "
        f"> {BACKEND_LOG} 2>&1 &"
    )
    subprocess.Popen(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # SAM3 预热需要 20~30s，给足时间
    time.sleep(30)
    log("[backend] 启动命令已下发（等待 SAM3 预热）")


def check_and_recover() -> None:
    """检查服务状态，如有异常则恢复."""
    # ── 前端 ──
    frontend_proc_ok = is_process_running(r"node.*vite.*--host")
    frontend_port_ok = is_port_listening(FRONTEND_PORT)
    if not frontend_proc_ok or not frontend_port_ok:
        log(
            f"[frontend] 异常检测: process={frontend_proc_ok}, port={frontend_port_ok} -> 重启"
        )
        start_frontend()
    else:
        log("[frontend] 正常")

    # ── 后端 ──
    backend_proc_ok = is_process_running(r"uvicorn app\.main:app")
    backend_port_ok = is_port_listening(BACKEND_PORT)
    backend_http_ok = is_backend_healthy()
    if not backend_proc_ok or not backend_port_ok or not backend_http_ok:
        log(
            f"[backend] 异常检测: process={backend_proc_ok}, port={backend_port_ok}, http={backend_http_ok} -> 重启"
        )
        start_backend()
    else:
        log("[backend] 正常")


def main() -> None:
    log("=" * 50)
    log("看门狗启动")
    log(f"项目根目录: {PROJECT_ROOT}")
    log(f"Conda 环境: {CONDA_ENV}")
    log(f"检查间隔: {CHECK_INTERVAL}s")
    log("=" * 50)

    # 首次启动时，如果服务不存在则启动
    check_and_recover()

    while True:
        time.sleep(CHECK_INTERVAL)
        try:
            check_and_recover()
        except Exception as e:
            log(f"[watchdog] 检查异常: {e}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("看门狗收到 Ctrl+C，退出")
        sys.exit(0)
