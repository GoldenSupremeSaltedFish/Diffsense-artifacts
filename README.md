# DiffSense Plugin Artifacts

这个仓库包含 **DiffSense VSCode 插件的产物**，包含所有运行时依赖，可用于独立调试和测试。

## 🚀 快速开始

### 直接调试产物
```bash
git clone https://github.com/GoldenSupremeSaltedFish/Diffsense-artifacts.git
cd Diffsense-artifacts
code .
# 按 F5 开始调试预构建的产物
```

## 📁 产物结构

```
├── dist/                    # 编译后的 TypeScript 代码
├── ui/                     # 前端 UI 构建产物
├── analyzers/              # 语言分析器（包含依赖）
│   ├── *.jar              # Java 分析器
│   ├── node-analyzer/     # Node.js 分析器
│   └── golang-analyzer/   # Golang 分析器
├── runtime-config.json     # 构建元数据
├── package.json           # 插件元数据
├── tsconfig.json          # TypeScript 配置
└── icon.png              # 插件图标
```

## 🔧 说明

此产物仓库包含：
- ✅ 编译后的代码（可直接运行）
- ✅ 所有分析器的 JAR 包和 JS 文件
- ✅ 前端构建产物
- ✅ 运行时配置文件
- ❌ 不包含 VSIX 包（请到主仓库下载）

产物结构与插件源码保持一致，但只包含运行时必需的文件。

## 📊 构建信息

查看 `runtime-config.json` 获取详细的构建元数据。

---

🔗 **源代码**: [DiffSense](https://github.com/GoldenSupremeSaltedFish/DiffSense)
