#!/bin/bash
# 一键启动前后端服务 + 看门狗
set -e

echo "=== 玄女底座展示平台 — 服务启动脚本 ==="

# 清理旧进程
echo "[1/3] 清理旧进程..."
pkill -9 -f "uvicorn app.main:app" 2>/dev/null || true
pkill -9 -f "node.*vite.*--host" 2>/dev/null || true
pkill -9 -f "npm run dev.*--host" 2>/dev/null || true
pkill -9 -f "watchdog.py" 2>/dev/null || true
sleep 2

# 启动看门狗（它会自动拉起前后端）
echo "[2/3] 启动看门狗..."
cd /workspace/xuannv_show
conda run -n xuannv nohup python scripts/watchdog.py > /tmp/xuannv_watchdog.log 2>&1 &
sleep 1

# 验证看门狗
echo "[3/3] 验证状态..."
sleep 6
python3 -c "
import socket, sys
def check(port, name):
    try:
        s = socket.create_connection(('127.0.0.1', port), timeout=3)
        s.close()
        print(f'  ✅ {name} (:{port})')
        return True
    except:
        print(f'  ❌ {name} (:{port})')
        return False

ok = True
ok &= check(5173, '前端 Vite')
ok &= check(8000, '后端 FastAPI')
if ok:
    print('\n🎉 所有服务已就绪!')
    print('   前端: http://localhost:5173')
    print('   后端: http://localhost:8000')
else:
    print('\n⚠️ 部分服务未就绪，查看日志:')
    print('   /tmp/xuannv_watchdog.log')
    sys.exit(1)
"
