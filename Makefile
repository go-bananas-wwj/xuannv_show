.PHONY: dev build deploy setup clean

# Development: start backend and frontend dev servers
dev:
	@echo "Starting backend..."
	@cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
	@sleep 2
	@echo "Starting frontend..."
	@cd frontend && npm run dev

# Production build
build:
	@echo "Building frontend..."
	@cd frontend && npm run build

# Docker deployment
deploy:
	@docker-compose up --build -d

# Setup data for default region (harbin)
setup:
	@echo "Setting up Harbin region data..."
	@if [ -f "data/harbin/patches_meta.json" ]; then \
		echo "  ✓ patches_meta.json already exists, skipping generation"; \
	else \
		if [ -f "/workspace/index/harbin/grid/harbin_grid.geojson" ]; then \
			python3 scripts/generate_patch_meta.py \
				--region harbin \
				--grid /workspace/index/harbin/grid/harbin_grid.geojson \
				--raw-dir /workspace/raw/harbin_scenes \
				--output-dir data/harbin; \
		else \
			echo "  ⚠ Grid file not found at /workspace/index/harbin/grid/harbin_grid.geojson"; \
			echo "  ⚠ Please provide --grid manually or place patches_meta.json in data/harbin/"; \
		fi; \
	fi
	@echo "Setup complete."

# Clean build artifacts
clean:
	@rm -rf frontend/dist
	@rm -rf frontend/node_modules/.vite
	@docker-compose down -v
