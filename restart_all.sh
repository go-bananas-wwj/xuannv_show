#!/bin/bash
# 一键重启前后端服务脚本
set -e

PROJECT_DIR="/workspace/xuannv_show"
FRONTEND_LOG="$PROJECT_DIR/frontend.log"
BACKEND_LOG="$PROJECT_DIR/backend.log"

echo "=========================================="
echo "  玄女展示平台 — 一键重启脚本"
echo "=========================================="

# ── 1. 停止现有服务 ──
echo "[1/4] 停止现有服务..."

# 停止前端 (Vite / npm run dev)
FRONTEND_PIDS=$(ps aux | grep -E "vite|npm run dev" | grep -v grep | awk '{print $2}')
if [ -n "$FRONTEND_PIDS" ]; then
    echo "  停止前端进程: $FRONTEND_PIDS"
    kill -9 $FRONTEND_PIDS 2>/dev/null || true
else
    echo "  前端未运行"
fi

# 停止后端 (Uvicorn)
BACKEND_PIDS=$(ps aux | grep -E "uvicorn app.main:app|python.*8000" | grep -v grep | awk '{print $2}')
if [ -n "$BACKEND_PIDS" ]; then
    echo "  停止后端进程: $BACKEND_PIDS"
    kill -9 $BACKEND_PIDS 2>/dev/null || true
else
    echo "  后端未运行"
fi

# 等待端口释放
sleep 2

# ── 2. 启动前端 ──
echo "[2/4] 启动前端 (Vite Dev Server on 0.0.0.0:5173)..."
cd "$PROJECT_DIR/frontend"
nohup npm run dev -- --host 0.0.0.0 > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "  前端 PID: $FRONTEND_PID"

# ── 3. 启动后端 ──
echo "[3/4] 启动后端 (Uvicorn on 0.0.0.0:8000)..."
cd "$PROJECT_DIR/backend"
nohup /opt/conda/envs/aef-qwen/bin/uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --app-dir "$PROJECT_DIR/backend" \
    > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "  后端 PID: $BACKEND_PID"

# ── 4. 等待并验证 ──
echo "[4/4] 等待服务就绪..."
sleep 8

FRONTEND_OK=false
BACKEND_OK=false

for i in {1..10}; do
    if ! $FRONTEND_OK && curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ | grep -q "200"; then
        FRONTEND_OK=true
        echo "  ✅ 前端就绪 (http://localhost:5173)"
    fi
    if ! $BACKEND_OK && curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/heads | grep -q "200"; then
        BACKEND_OK=true
        echo "  ✅ 后端就绪 (http://localhost:8000)"
    fi
    if $FRONTEND_OK && $BACKEND_OK; then
        break
    fi
    sleep 2
done

if ! $FRONTEND_OK; then
    echo "  ❌ 前端启动失败，查看日志: $FRONTEND_LOG"
    exit 1
fi

if ! $BACKEND_OK; then
    echo "  ❌ 后端启动失败，查看日志: $BACKEND_LOG"
    exit 1
fi

# ── 5. SAM3 状态 ──
echo ""
echo "[SAM3] 测试嵌入服务..."
if curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:8000/api/annotate/sam/embed \
    -H "Content-Type: application/json" \
    -d '{"patch_id":"patch_000000","month":"2025-04"}' | grep -q "200"; then
    echo "  ✅ SAM3 嵌入服务正常"
else
    echo "  ⚠️ SAM3 嵌入服务可能需要首次预热（模型加载约 10-20 秒）"
fi

echo ""
echo "=========================================="
echo "  所有服务已启动"
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:8000"
echo "  日志: $FRONTEND_LOG"
echo "        $BACKEND_LOG"
echo "=========================================="
