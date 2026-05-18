# 贡献指南

感谢你对本项目的关注！我们欢迎所有形式的贡献，包括但不限于功能建议、Bug 修复、文档改进和代码提交。

## 如何贡献

### 1. Fork 仓库

点击右上角 "Fork" 按钮，将仓库复制到你的个人账户下。

### 2. 克隆你的 Fork

```bash
git clone https://github.com/<你的用户名>/xuannv_show.git
cd xuannv_show
```

### 3. 创建功能分支

```bash
git checkout -b feat/你的功能名称
# 或
git checkout -b fix/修复的问题描述
```

### 4. 开发与测试

- 遵循现有的代码风格
- 确保你的改动不会破坏现有功能
- 如有必要，补充或更新相关文档

### 5. 提交更改

```bash
git add .
git commit -m "feat: 简短描述你的改动"
git push origin feat/你的功能名称
```

提交信息建议使用以下前缀：
- `feat:` — 新功能
- `fix:` — Bug 修复
- `docs:` — 文档更新
- `refactor:` — 代码重构
- `style:` — 格式调整（不影响代码逻辑）
- `chore:` — 构建/工具链改动

### 6. 发起 Pull Request

在 GitHub 上向原仓库发起 Pull Request，描述清楚改动的目的和范围。维护者会在收到后进行 Code Review。

## 开发环境

```bash
# 创建 Conda 环境
conda env create -f environment.yml
conda activate xuannv-show

# 安装前端依赖
cd frontend && npm install

# 启动开发服务器
make dev
```

## 报告问题

如果你发现了 Bug 或有功能建议，请通过 [Issues](https://github.com/<组织名>/xuannv_show/issues) 提交，并尽可能提供以下信息：
- 问题描述
- 复现步骤
- 期望行为 vs 实际行为
- 环境信息（操作系统、Node/Python 版本等）

## 行为准则

- 尊重所有参与者
- 保持友善和专业的沟通
- 欢迎新手提问，耐心解答
