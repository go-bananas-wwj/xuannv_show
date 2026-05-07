# === 玄女底座展示平台 — 后端服务 Dockerfile ===
# 构建命令（在项目根目录执行）:
#   docker build -f backend/Dockerfile -t xuannv-backend .
#
# 运行命令（需挂载外部依赖和数据卷）:
#   docker run -d \
#     -v /path/to/xuannv:/workspace/xuannv:ro \
#     -v /path/to/data:/workspace/raw:ro \
#     -v /path/to/outputs:/workspace/outputs:ro \
#     -p 8000:8000 \
#     xuannv-backend

FROM python:3.11-slim

# 安装系统依赖（GDAL / 字体 / 编译工具）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    libfreetype6-dev \
    libpng-dev \
    libjpeg-dev \
    fonts-dejavu \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制并安装依赖（利用 Docker 缓存层）
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/app/ ./app/
COPY backend/scripts/ ./scripts/
COPY backend/sam3/ ./sam3/
COPY data/ ./data/

# 设置环境变量
ENV PYTHONPATH=/app:/app/sam3:/workspace/xuannv
ENV PORT=8000

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
