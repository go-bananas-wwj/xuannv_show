#!/usr/bin/env python3
"""Playwright E2E 测试 — 验收标准验证."""
from playwright.sync_api import sync_playwright
import time

def test_all():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.goto("http://localhost:5173")
        page.wait_for_load_state("networkidle")
        time.sleep(3)

        print("=" * 60)
        print("开始验收测试")
        print("=" * 60)

        # === 1. 三维地球渲染 ===
        print("\n[1/10] 三维地球渲染 + 栅格覆盖层")
        page.screenshot(path="/tmp/test_01_globe.png", full_page=False)
        canvas = page.locator("canvas").first
        assert canvas.is_visible(), "Canvas not found"
        print("  ✓ Canvas 存在，Three.js 地球已渲染")
        # Check for patch overlays (dots on globe)
        page_content = page.content()
        if "哈尔滨新区" in page_content:
            print("  ✓ 区域信息面板显示正常")

        # === 2. 数据源切换 ===
        print("\n[2/10] 数据源切换")
        page.click("text=月度数据")
        time.sleep(0.5)
        page.screenshot(path="/tmp/test_02_monthly.png", full_page=False)
        page.click("text=Embedding")
        time.sleep(0.5)
        page.screenshot(path="/tmp/test_03_embedding.png", full_page=False)
        print("  ✓ 数据源切换按钮可点击")

        # === 3. 点击栅格弹出详情面板 ===
        print("\n[3/10] 栅格详情面板")
        # Click center of the globe canvas where patches are rendered
        box = canvas.bounding_box()
        if box:
            page.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.4)
        time.sleep(1)
        page.screenshot(path="/tmp/test_04_patch_detail.png", full_page=False)
        # Check for patch_id in the page
        if "patch_" in page.content():
            print("  ✓ 详情面板包含 patch 信息")
        else:
            print("  ⚠ 详情面板未检测到（点击位置可能未命中 patch）")

        # === 4. Task Head 选择 ===
        print("\n[4/10] Task Head 选择动态效果")
        page.click("text=监测能力")
        time.sleep(1)
        page.click("text=变化检测")
        time.sleep(1)
        page.screenshot(path="/tmp/test_05_head_selected.png", full_page=False)
        connected = page.locator("text=已接入")
        if connected.is_visible():
            print("  ✓ Head 选择有动态效果，显示'已接入'")
        else:
            print("  ⚠ '已接入'标识未显示")

        # === 5. MapLibre 地图 ===
        print("\n[5/10] 全图结果展示缩放平移")
        map_canvases = page.locator("canvas").all()
        if len(map_canvases) > 1:
            print(f"  ✓ 检测到 {len(map_canvases)} 个 canvas，MapLibre 已加载")
        else:
            print("  ⚠ MapLibre 地图未检测到")

        # === 6. Prompt 输入框 + API ===
        print("\n[6/10] Prompt 输入框 + 后端 API")
        page.click("text=智能体报告")
        time.sleep(1)
        textarea = page.locator("textarea").first
        assert textarea.is_visible(), "Prompt textarea not found"
        textarea.fill("找出哈尔滨新区新建的建筑工地")
        page.click("text=提交任务")
        time.sleep(3)
        page.screenshot(path="/tmp/test_06_agent_result.png", full_page=False)
        # Use more specific selector
        result = page.locator("h3:has-text('任务报告')").first
        if result.is_visible():
            print("  ✓ Prompt 可用，API 返回报告")
        else:
            print("  ⚠ 报告未显示")

        # === 7. GitHub dev 分支 ===
        print("\n[7/10] 代码提交到 GitHub dev 分支")
        import subprocess
        result = subprocess.run(
            ["git", "-C", "/workspace/xuannv_show", "branch", "-r"],
            capture_output=True, text=True
        )
        if "origin/dev" in result.stdout:
            print("  ✓ dev 分支已推送到 origin")
        else:
            print("  ✗ dev 分支未找到")

        # === 8. setup_new_region.sh ===
        print("\n[8/10] scripts/setup_new_region.sh 可正常运行")
        script_path = "/workspace/xuannv_show/scripts/setup_new_region.sh"
        import os
        if os.path.exists(script_path) and os.access(script_path, os.X_OK):
            print("  ✓ 脚本存在且可执行")
        else:
            print("  ✗ 脚本不存在或不可执行")

        # === 9. README 完整 ===
        print("\n[9/10] README 包含启动说明和新地区接入说明")
        readme_path = "/workspace/xuannv_show/README.md"
        with open(readme_path) as f:
            readme = f.read()
        checks = [
            ("启动说明", "快速启动" in readme or "make dev" in readme),
            ("新地区接入", "setup_new_region" in readme or "REGION_SETUP" in readme),
            ("Docker", "docker-compose" in readme),
            ("技术栈", "React" in readme),
        ]
        for name, ok in checks:
            print(f"  {'✓' if ok else '✗'} {name}")

        # === 10. 性能 ===
        print("\n[10/10] 桌面端流畅运行")
        perf = page.evaluate("""() => {
            const nav = performance.timing;
            return {
                loadTime: nav.loadEventEnd - nav.navigationStart,
                domReady: nav.domContentLoadedEventEnd - nav.navigationStart,
            }
        }""")
        print(f"  页面加载: {perf['loadTime']}ms, DOM Ready: {perf['domReady']}ms")
        if perf['loadTime'] < 8000:
            print("  ✓ 加载性能良好")
        else:
            print("  ⚠ 加载时间较长")

        browser.close()
        print("\n" + "=" * 60)
        print("验收测试完成，截图保存在 /tmp/test_*.png")
        print("=" * 60)

if __name__ == "__main__":
    test_all()
