/**
 * Navigation Introduction Walkthroughs
 *
 * Two context-aware walkthroughs that introduce users to the OTHER mode:
 * - In Files mode: introduces Agent Mode
 * - In Agent mode: introduces Files Mode
 */

import type { WalkthroughDefinition } from '../types';

/**
 * Shown in Files mode to introduce Agent Mode.
 */
export const agentModeIntro: WalkthroughDefinition = {
  id: 'agent-mode-intro',
  name: 'Agent Mode Introduction',
  version: 1,
  trigger: {
    screen: 'files',
    delay: 500,
    priority: 5,
  },
  steps: [
    {
      id: 'agent-mode',
      target: {
        testId: 'agent-mode-button',
      },
      title: 'Agent 模式',
      body: '专注的 AI 编程代理管理界面。管理多个运行中的 AI Agent 会话，追踪执行进度，控制提交，并用看板组织它们。选择你的 Agent，给出指令，AI Agent 会编写代码、执行命令并修改整个项目。',
      placement: 'right',
      shortcut: 'Cmd+2',
    },
  ],
};

/**
 * Shown in Agent mode to introduce Files Mode.
 */
export const filesModeIntro: WalkthroughDefinition = {
  id: 'files-mode-intro',
  name: 'Files Mode Introduction',
  version: 1,
  trigger: {
    screen: 'agent',
    delay: 500,
    priority: 5,
  },
  steps: [
    {
      id: 'files-mode',
      target: {
        testId: 'files-mode-button',
      },
      title: '文件模式',
      body: '浏览和编辑项目文件。打开 Markdown 文档、代码文件等，这里同样可以使用 AI 助手侧边栏。',
      placement: 'right',
      shortcut: 'Cmd+1',
    },
  ],
};
