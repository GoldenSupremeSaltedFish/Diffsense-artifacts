# DiffSense 子仓库自动 VSIX 打包方案

## 📦 方案概述

这个仓库（Diffsense-artifacts）是一个**产物仓库**，专门用于存放从主仓库构建而来的可执行文件和资源。我们在这里实现了自动 VSIX 打包功能。

## 🔄 工作流程

### 1. 主仓库 → 子仓库
- 主仓库构建源码，生成产物
- 产物自动推送到子仓库（Diffsense-artifacts）

### 2. 子仓库自动打包
- 当子仓库收到新的产物推送时
- GitHub Actions 自动触发 VSIX 打包流程
- 生成可安装的 VSCode 插件包

## 🚀 自动化功能

### 触发条件
- ✅ 推送到 `main` 分支
- ✅ 提交 Pull Request  
- ✅ 手动触发（`workflow_dispatch`）

### 打包流程
1. **环境准备**: 安装 Node.js 18 和依赖
2. **产物检查**: 验证 `dist` 目录是否存在
3. **VSIX 打包**: 使用 `vsce package` 命令
4. **文件上传**: 将 VSIX 作为 Artifacts 上传
5. **自动发布**: 在 main 分支推送时自动创建 Release

## 📋 使用方法

### 获取 VSIX 包

#### 方法 1: 从 Artifacts 下载
1. 访问 [Actions 页面](../../actions)
2. 点击最新的 "Package VSIX" 工作流
3. 在 Artifacts 区域下载 `diffsense-vsix-xxx`

#### 方法 2: 从 Releases 下载
1. 访问 [Releases 页面](../../releases)
2. 下载最新版本的 `.vsix` 文件

### 安装插件

```bash
# 命令行安装
code --install-extension diffsense-x.x.x.vsix

# 或在 VSCode 中
# 1. Ctrl+Shift+P 打开命令面板
# 2. 输入 "Extensions: Install from VSIX"
# 3. 选择下载的 .vsix 文件
```

## 🛠️ 配置文件说明

### `.github/workflows/package-vsix.yml`
自动化工作流配置，包含：
- Node.js 环境设置
- 依赖安装
- VSIX 打包
- 文件上传和发布

### `package.json`
VSCode 插件元数据，包含：
- 插件基本信息
- 依赖配置
- 构建脚本

## 🔧 优势

1. **主仓库解耦**: 主仓库专注源码开发，子仓库专注产物分发
2. **自动化流程**: 无需手动打包，推送即自动生成 VSIX
3. **多获取方式**: 既有 Artifacts 也有 Releases，满足不同需求
4. **调试友好**: 子仓库产物可直接用于调试和测试

## 📝 注意事项

- 子仓库**不存储** `node_modules`，CI 时自动安装
- 确保 `dist` 目录包含完整的构建产物
- VSIX 包版本号来自 `package.json` 的 `version` 字段
- Release 标签使用 GitHub run number 保证唯一性

---

🎯 **这种方案实现了产物仓库的"自给自足"，让 VSIX 分发更加便捷和自动化！** 