# Nimbalyst Agent Work OS

基于 [Nimbalyst](https://github.com/Nimbalyst/nimbalyst) 的 AI 驱动工作站，集成 Agent Work OS 工作流、中文界面和多平台打包支持。

## 这是什么

Nimbalyst 是一个本地优先的可视化工作空间，让你通过可视化界面与 Codex、Claude Code 等 AI 编程智能体协作。你可以在 Markdown、代码、表格、设计稿、Excalidraw 等编辑器中直接与智能体互动，管理多个并行会话，追踪任务和计划。

本仓库在上游 Nimbalyst 的基础上增加了：

- **Agent Work OS** — 基于 Work Packet 的结构化任务管理工作流，支持 8 个 Gate 阶段（能力评估 - 规格 - 计划 - 执行 - 审查 - 验证 - 文档 - 交付），自动选择最合适的 AI 智能体
- **中文界面（i18n）** — 使用 react-i18next 实现的多语言支持，导航、设置、智能体模式等核心界面已汉化
- **中文快速入门引导** — 首次使用时自动触发的 7 步交互式引导
- **Windows 打包脚本** — 一键构建 Windows 安装包或免安装目录
- **Android 伴侣应用** — 在手机上查看和回复 AI 会话、审批计划、管理权限
- **移动端权限策略** — 桌面端配置的权限策略通过加密同步传递到 Android 端

## 核心功能

- **可视化编辑器** — Markdown、Mockup、Mermaid、Excalidraw、CSV、数据模型、Monaco 代码编辑器
- **会话管理** — 并行运行多个智能体会话，看板视图，搜索和恢复历史会话
- **任务追踪** — 计划、Bug、待办等自定义看板，智能体和人都可以编辑
- **Git 集成** — 状态管理、AI 辅助提交、Worktree 隔离
- **扩展系统** — 可插拔的编辑器架构，支持自定义编辑器和可视化界面
- **多智能体支持** — Claude Code、Codex、Opencode（alpha）、Copilot（alpha）

## 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | >= 22 |
| npm | >= 10（需要 workspaces 支持） |
| Git | >= 2.20 |
| 操作系统 | Windows 10+ / macOS 10.15+ / Linux |

Android 构建还需要：JDK 17+、Android SDK（API 34+）、Gradle。

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/MeliodasZHAO/nimbalyst-agent-work-os.git
cd nimbalyst-agent-work-os

# 2. 切换到开发分支
git checkout feat/agent-work-os-and-i18n

# 3. 安装依赖
npm install

# 4. 启动开发模式
cd packages/electron
npm run dev
```

启动后会打开 Nimbalyst 桌面应用，首次使用会触发中文快速入门引导。

### 代码改动如何生效

**如果你在用 dev server（`npm run dev`）**：改动会自动热重载，保存文件后几秒内就能看到效果。渲染进程（UI）改动立即生效，主进程改动需要按 `Ctrl+R` 刷新或重启 dev server。

**如果你在用桌面快捷方式（打包版）**：代码改动不会生效。你需要重新构建：

```bash
# Windows 免安装目录（最快，适合测试）
npm run agent-work-os:desktop:win-dir

# 构建完成后运行
packages/electron/release/win-unpacked/Nimbalyst.exe
```

**建议**：日常开发用 `npm run dev`，测试打包行为时才用 `build:win:dir-local`。dev server 支持热重载，效率高很多。

## 打包构建

所有打包命令在仓库根目录执行。

### Windows

```bash
# 安装包（.exe 安装程序）
npm run agent-work-os:desktop:win

# 免安装目录（直接运行 exe，适合测试）
npm run agent-work-os:desktop:win-dir

# ARM64 版本
npm run agent-work-os:desktop:win:arm64
```

产物路径：`packages/electron/release/`
免安装 exe：`packages/electron/release/win-unpacked/Nimbalyst.exe`

### macOS

```bash
# 本地构建（不签名不公证，开发测试用）
cd packages/electron
npm run build:mac:local
```

产物路径：`packages/electron/release/`

### Linux

```bash
cd packages/electron
npm run build:linux
```

### Android 伴侣应用

```bash
# 构建 debug APK
npm run agent-work-os:android:debug

# 安装到已连接的设备
npm run agent-work-os:android:install

# 构建 release APK（无签名）
npm run agent-work-os:android:release
```

签名发布版本：

```bash
# 初始化本地签名材料（生成 keystore，写入 local.properties）
npm run agent-work-os:android:release-signing:init

# 验证签名配置
npm run agent-work-os:android:release-signing:verify

# 构建签名 release APK
npm run agent-work-os:android:release
```

签名文件在 `packages/android/keystores/`，不要提交到 git。

## Work Packet 工作流

Work Packet 是 Agent Work OS 的核心概念 — 一个结构化的 AI 任务包，经历 8 个 Gate 阶段确保质量。

**快速体验：**

1. 将 `UserDocs/examples/work-packet.yaml` 复制到你的工作区 `.nimbalyst/trackers/work-packet.yaml`
2. 重启 Nimbalyst
3. 在文档中输入 `#work-packet` 创建任务包
4. 在设置 - Agent Work OS 中配置智能体路由和权限

详细文档见 [Agent Work OS Quickstart](./UserDocs/agent-work-os-quickstart.md) 和 [Agent Work OS Workflow](./UserDocs/agent-work-os-workflow.md)。

## 项目结构

```
packages/
  electron/       # 桌面应用（Electron + React + Vite）
  runtime/        # 跨平台运行时（AI 服务、同步、Lexical 编辑器）
  ios/            # iOS 原生应用（SwiftUI）
  android/        # Android 伴侣应用（Kotlin + Room）
  core/           # 共享工具库
  collabv3/       # 协作服务器（Cloudflare Workers）
  extension-sdk/  # 扩展开发套件
  extensions/     # 内置扩展

UserDocs/         # 用户文档和示例
design/           # 设计文档和实现方案
```

## i18n 汉化进度

使用 react-i18next，翻译文件在 `packages/electron/src/renderer/locales/{zh-CN,en}/`。

已完成：
- 导航栏（NavigationGutter）
- 设置侧边栏（SettingsSidebar）
- 项目信任提示（ProjectTrustToast）
- 智能体模式（AgentMode、SessionHistory、GitOperationsPanel 等 10 个组件）
- 文件操作菜单、编辑器头栏、Slash 命令等

待完成：
- 全局设置面板（Claude、OpenAI、LM Studio、MCP、通知、数据库等）
- 对话框和弹窗
- 更多编辑器内文案

## 上游仓库

本仓库基于 [Nimbalyst/nimbalyst](https://github.com/Nimbalyst/nimbalyst)（MIT 协议）fork 而来。上游版本：v0.64.4。

## 许可证

MIT License — 见 [LICENSE](./LICENSE)。
