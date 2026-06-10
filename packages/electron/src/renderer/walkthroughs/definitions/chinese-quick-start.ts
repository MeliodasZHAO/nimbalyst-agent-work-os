/**
 * 中文快速入门引导
 *
 * 首次使用时自动触发，引导用户了解应用布局、添加项目、
 * 各模式功能、AI 服务配置、Agent Work OS、登录同步和手机互通。
 */

import type { WalkthroughDefinition } from '../types';

export const chineseQuickStart: WalkthroughDefinition = {
  id: 'chinese-quick-start',
  name: 'Chinese Quick Start Guide',
  version: 2,
  trigger: {
    screen: 'agent',
    delay: 2000,
    priority: 100,
  },
  steps: [
    {
      id: 'welcome-layout',
      target: {
        testId: 'navigation-gutter',
      },
      title: '欢迎使用 Nimbalyst',
      body: '这是你的 **Agent Work OS** — AI 驱动的工作站。\n\n- **左侧竖栏**：导航区，切换文件/智能体/看板模式\n- **中间区域**：内容和 AI 对话\n- **右侧面板**：会话编辑、提交管理\n\n接下来带你快速了解核心功能。',
      placement: 'right',
      wide: true,
    },
    {
      id: 'add-project',
      target: {
        testId: 'project-rail',
      },
      title: '添加和切换项目',
      body: '点击最左边的项目栏管理你的工作区。\n\n- 点击底部 **+** 号打开文件夹\n- 每个项目有独立的 AI 会话、权限和设置\n- 右键项目图标可以关闭或管理',
      placement: 'right',
      wide: true,
    },
    {
      id: 'files-mode',
      target: {
        testId: 'files-mode-button',
      },
      title: '文件模式',
      body: '浏览和编辑项目文件。支持 **Markdown、代码、表格、设计稿** 等多种编辑器。\n\n左侧文件树可以右键新建文件或文件夹。',
      placement: 'right',
      shortcut: 'Cmd+1',
    },
    {
      id: 'agent-mode',
      target: {
        testId: 'agent-mode-button',
      },
      title: '智能体模式',
      body: '**核心功能区**。与 AI 智能体对话，它可以读写文件、执行命令、修改整个项目。\n\n- 支持 **Claude Agent** 和 **OpenAI Codex**\n- 用 **/ 命令** 触发工作流\n- 每个会话有独立的 Worktree 隔离',
      placement: 'right',
      wide: true,
      shortcut: 'Cmd+2',
    },
    {
      id: 'work-packet',
      target: {
        testId: 'tracker-mode-button',
      },
      title: 'Work Packet 任务管理',
      body: '**Agent Work OS 的核心工作流**。用看板管理 AI 任务：\n\n- 在文档中输入 **#work-packet** 创建任务包\n- 经历 8 个 Gate：能力评估 → 规格 → 计划 → 执行 → 审查 → 验证 → 文档 → 交付\n- 自动选择最合适的 AI（Claude/Codex/混合）\n\n需要先把 `work-packet.yaml` 复制到 `.nimbalyst/trackers/` 目录。',
      placement: 'right',
      wide: true,
      shortcut: 'Cmd+3',
    },
    {
      id: 'configure-providers',
      target: {
        testId: 'settings-button',
      },
      title: '配置 AI 服务和 Agent Work OS',
      body: '进入 **设置** 配置你的系统：\n\n- **Claude Agent**：OAuth 登录或 API Key（智能体服务商 → Claude 智能体）\n- **OpenAI Codex**：API Key（智能体服务商 → OpenAI Codex）\n- **Agent Work OS**：智能体路由、推理等级、协作模式\n- **语言**：切换中/英文界面',
      placement: 'right',
      wide: true,
    },
    {
      id: 'login-sync',
      target: {
        testId: 'user-button',
      },
      title: '登录与同步',
      body: '点击用户头像进入 **同步设置**：\n\n- 使用邮箱登录 Nimbalyst 账号\n- 登录后可跨设备同步会话和项目\n- 支持团队协作功能',
      placement: 'right',
      wide: true,
    },
    {
      id: 'mobile-sync',
      target: {
        testId: 'user-button',
      },
      title: '手机与桌面互通',
      body: '在「同步设置」中找到 **设备配对**：\n\n- 桌面端生成 **QR 码**，手机扫描配对\n- 手机上可以查看和回复 AI 会话、审批计划\n- 建议开启「保持唤醒」避免休眠断开\n- 在 Agent Work OS 设置中配置移动端权限策略\n\niOS 应用可在 App Store 搜索 Nimbalyst 下载。\nAndroid 可用 `npm run agent-work-os:android:debug` 本地构建。',
      placement: 'right',
      wide: true,
    },
  ],
};
