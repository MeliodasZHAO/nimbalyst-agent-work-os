/**
 * HelpContent - Centralized registry for UI help text
 *
 * This module provides a single source of truth for help content that appears
 * in walkthroughs, tooltips, and other help UI. By centralizing this content,
 * we ensure consistency and make it easy to update help text in one place.
 *
 * See nimbalyst-local/plans/help-content-inventory.md for the full inventory.
 */

import { KeyboardShortcuts } from '../../shared/KeyboardShortcuts';
import { getRegisteredPanels } from '../extensions/panels/PanelRegistry';
import { getRegisteredKeybindings } from '../extensions/commands/ExtensionCommandRegistry';

/**
 * Help content for a single UI element
 */
export interface HelpEntry {
  /** Short title for the feature */
  title: string;
  /** Longer description of what the feature does */
  body: string;
  /** Optional keyboard shortcut (from KeyboardShortcuts) */
  shortcut?: string;
}

/**
 * Central registry of help content, keyed by data-testid
 */
export const HelpContent: Record<string, HelpEntry> = {
  // ============================================================================
  // Files Mode - File Tree
  // ============================================================================

  'file-tree-filter-button': {
    title: '筛选文件树',
    body: '仅显示 Markdown 文件、未提交的 Git 变更，或本次会话中 AI 读写过的文件。',
  },
  'file-tree-quick-open-button': {
    title: '快速打开文件',
    body: '按文件名搜索项目中的任何文件，最近打开过的文件会排在最前面。',
    shortcut: KeyboardShortcuts.file.open,
  },
  'file-tree-new-file-button': {
    title: '新建文件',
    body: '在选中的文件夹中创建新文件。',
    shortcut: KeyboardShortcuts.file.newFile,
  },
  'file-tree-new-folder-button': {
    title: '新建文件夹',
    body: '在选中的文件夹中创建新文件夹。',
  },

  // ============================================================================
  // Files Mode - Unified Header
  // ============================================================================

  'ai-sessions-button': {
    title: '历史 AI 会话',
    body: '查看编辑过此文件的 AI 会话，可跳回之前的对话继续交流或回顾变更。',
  },
  'file-history-button': {
    title: '文档历史',
    body: '查看此文档的历史版本，可恢复或对比任意保存状态。',
    shortcut: KeyboardShortcuts.edit.viewHistory,
  },
  'toc-toggle-button': {
    title: '目录',
    body: '切换目录面板，快速跳转到文档中的任意标题。',
  },

  // ============================================================================
  // Files Mode - Diff Mode
  // ============================================================================

  'diff-keep-button': {
    title: '保留变更',
    body: '接受此区域的 AI 变更并更新文档。',
    shortcut: KeyboardShortcuts.edit.approve,
  },
  'diff-revert-button': {
    title: '撤销变更',
    body: '拒绝 AI 变更并恢复原始内容。',
    shortcut: KeyboardShortcuts.edit.reject,
  },
  'diff-keep-all-button': {
    title: '保留所有变更',
    body: '接受文档中所有待处理的 AI 变更。',
  },
  'diff-revert-all-button': {
    title: '撤销所有变更',
    body: '拒绝所有待处理的 AI 变更并恢复原始文档。',
  },

  // ============================================================================
  // Navigation
  // ============================================================================

  'nav-back-button': {
    title: '后退',
    body: '返回上一个文件或位置。',
    shortcut: KeyboardShortcuts.view.navigateBack,
  },
  'nav-forward-button': {
    title: '前进',
    body: '前进到导航历史中的下一个位置。',
    shortcut: KeyboardShortcuts.view.navigateForward,
  },

  // ============================================================================
  // View Modes
  // ============================================================================

  'files-mode-button': {
    title: '文件模式',
    body: '浏览和编辑项目文件，任何文档都可获得 AI 辅助。',
    shortcut: KeyboardShortcuts.view.filesMode,
  },
  'agent-mode-button': {
    title: 'Agent 模式',
    body: '全功能 AI 编程代理，具备项目级上下文、工具调用和多步任务能力。',
    shortcut: KeyboardShortcuts.view.agentMode,
  },

  // ============================================================================
  // Agent Mode - Session Views
  // ============================================================================

  'session-kanban-button': {
    title: '看板视图',
    body: '切换到按阶段组织的看板视图：待办、规划中、开发中、验证中和已完成。拖拽会话到不同列即可更新状态。',
    shortcut: KeyboardShortcuts.window.kanbanView,
  },

  'new-dropdown-button': {
    title: '新建',
    body: '创建新的智能体会话、隔离的 Git 工作树会话或终端。工作树会话在独立的代码副本中运行，互不干扰。',
  },

  'project-tab-add': {
    title: '添加项目',
    body: '打开本地文件夹作为新项目标签。最多可同时打开 8 个项目。',
  },

  'claude-usage-indicator': {
    title: 'Claude 用量',
    body: '当前 5 小时窗口的 Claude 套餐用量。点击查看详细额度与重置时间。',
  },

  'codex-usage-indicator': {
    title: 'Codex 用量',
    body: '当前 5 小时窗口的 Codex 套餐用量。点击查看详细额度与重置时间。',
  },

  // ============================================================================
  // Agent Mode - Layout Controls
  // ============================================================================

  'layout-controls': {
    title: '会话布局模式',
    body: `同时查看 AI 会话和编辑的文件：

**文件**：仅显示文件编辑器标签页。在 AI 会话中打开已编辑的文件后可用。

**分栏**：上下堆叠显示对话记录和编辑器，拖动分隔条调整比例。

**Agent**：仅显示对话记录。`,
  },

  // ============================================================================
  // Agent Mode - Session Management
  // ============================================================================

  'session-history-button': {
    title: '会话历史',
    body: '浏览历史 AI 会话，支持搜索、筛选和恢复之前的对话。',
    shortcut: KeyboardShortcuts.window.sessionManager,
  },
  'session-quick-open-button': {
    title: '快速打开会话',
    body: '按内容或标题搜索并跳转到任意 AI 会话，比滚动历史记录快得多。',
    shortcut: KeyboardShortcuts.window.sessionQuickOpen,
  },
  'session-quick-search-button': {
    title: '搜索会话',
    body: `按名称快速查找 AI 会话。输入 **@** 可按编辑过的文件搜索——找到所有修改过某个文件的会话。按 **Tab** 切换到提示词搜索，按你问过的内容查找会话。`,
    shortcut: KeyboardShortcuts.window.sessionQuickOpen,
  },
  'session-archive-button': {
    title: '归档会话',
    body: '归档此会话以保持列表整洁，已归档的会话随时可以恢复。',
  },

  'tracker-automation-section': {
    title: 'Tracker 自动化',
    body: `自动将 Git 提交关联到 Tracker 项目。启用后，Nimbalyst 会通过会话的 Tracker 项目以及解析提交信息中的 Issue 编号（如 **NIM-123**）来建立关联——包括在终端中手动提交的 commit。\n\n如需项目级定制，可在项目的 **CLAUDE.md** 中添加说明（例如"提交时始终引用 Tracker Issue 编号"或"不要自动关闭关键 Bug"）。`,
  },

  // ============================================================================
  // Agent Mode - AI Input
  // ============================================================================

  'agent-input': {
    title: 'AI 输入框',
    body: '输入消息或粘贴图片和文件，AI 拥有你项目的完整上下文。',
  },
  'plan-mode-toggle': {
    title: '规划模式 vs Agent 模式',
    body: '在规划模式和 Agent 模式之间切换。规划模式会在 AI 写代码前先创建结构化计划；Agent 模式则直接执行变更。',
  },
  'attach-files-input': {
    title: '附加文件和图片',
    body: '将文件拖拽或粘贴图片到对话中，也可以用 @ 引用项目中的文件。',
  },
  'agent-welcome': {
    title: '开始你的第一个会话',
    body: '创建一个 AI 编程会话。描述你想要构建的内容，Agent 会帮助你完成。',
  },

  // ============================================================================
  // Agent Mode - Files Edited Sidebar
  // ============================================================================

  'files-scope-dropdown': {
    title: '文件范围模式',
    body: '控制显示哪些文件。可查看本次会话的 AI 编辑、仅未提交的变更，或工作区内的所有文件。在工作流中，可按单个会话筛选或查看所有会话的汇总。',
  },

  // ============================================================================
  // Agent Mode - Git Operations
  // ============================================================================

  'git-commit-mode-toggle': {
    title: '提交模式',
    body: '选择如何提交变更。手动模式让你自己编写提交信息；智能模式使用 AI 分析变更并生成提交信息。',
  },
  'git-operations-commit-with-ai-button': {
    title: 'AI 辅助提交',
    body: '让 AI 分析你的变更，推荐要提交的文件并生成提交信息，供你编辑和确认。',
  },

  // ============================================================================
  // Agent Mode - Model & Context
  // ============================================================================

  'model-picker': {
    title: '选择 AI 模型',
    body: '选择要使用的 AI 模型，不同模型具有不同的能力和速度。',
  },
  'action-prompts-dropdown': {
    title: '动作提示词',
    body: '在 nimbalyst-local/ai-actions.md 中定义的可复用提示词。选择后会插入到草稿中，发送前可以调整。',
  },
  'context-indicator': {
    title: '上下文窗口',
    body: '显示 AI 上下文窗口的使用情况，包括文件、对话历史和工具。',
  },

  // ============================================================================
  // Agent Mode - Transcript Controls
  // ============================================================================

  'transcript-archive-button': {
    title: '归档会话',
    body: '归档此会话以保持列表整洁。',
  },
  'transcript-search-button': {
    title: '搜索对话记录',
    body: '在当前对话中搜索特定消息或内容。',
  },

  // ============================================================================
  // Agent Mode - Voice
  // ============================================================================

  'voice-mode-toggle': {
    title: '语音模式',
    body: '用语音与 AI 交流，AI 也会用语音回复。',
  },

  // ============================================================================
  // Project Window Gutter
  // ============================================================================

  'gutter-permissions-button': {
    title: 'Agent 权限',
    body: '配置 AI Agent 可以使用哪些工具，控制文件访问、命令执行等权限。',
  },
  'gutter-sync-button': {
    title: '会话同步',
    body: '查看此项目的同步状态并管理同步设置。',
  },
  'gutter-extension-dev-button': {
    title: '扩展开发模式',
    body: '打开扩展开发工具、日志和重新构建选项。',
  },
  'gutter-theme-button': {
    title: '主题',
    body: '在浅色和深色主题之间切换。',
  },
  'gutter-feedback-button': {
    title: '发送反馈',
    body: '向团队分享反馈或报告问题。',
  },
  'gutter-user-button': {
    title: '用户菜单',
    body: '打开用户菜单，访问用户设置、项目设置、团队设置和账户信息。',
  },
  'terminal-panel-button': {
    title: '终端',
    body: '切换终端面板以运行命令。',
    shortcut: KeyboardShortcuts.view.toggleTerminalPanel,
  },
  'tracker-mode-button': {
    title: 'Tracker',
    body: '切换到 Tracker 模式，以表格和看板布局进行项目管理。',
    shortcut: KeyboardShortcuts.view.trackerMode,
  },
  'collab-mode-button': {
    title: '共享文档',
    body: '浏览和编辑与团队实时共享的文档，支持协作编辑 Markdown、电子表格和图表。',
    shortcut: KeyboardShortcuts.view.collabMode,
  },

  // ============================================================================
  // Settings
  // ============================================================================

  'settings-project-tab': {
    title: '项目设置',
    body: '仅对当前项目生效的设置，存储在项目文件夹中。',
  },
  'settings-global-tab': {
    title: '全局设置',
    body: '对所有项目生效的设置。',
  },
  'settings-walkthroughs-toggle': {
    title: '功能引导',
    body: '显示新功能的引导提示，引导会在你使用应用时自动出现。',
  },
  'settings-walkthroughs-reset': {
    title: '重置引导',
    body: '重新显示所有功能引导，包括你已经看过的。',
  },

  // ============================================================================
  // Project Manager
  // ============================================================================

  'project-manager-open': {
    title: '打开项目',
    body: '从电脑中打开一个项目文件夹。',
    shortcut: KeyboardShortcuts.file.openFolder,
  },
  'project-manager-recent': {
    title: '最近项目',
    body: '最近打开过的项目，方便快速访问。',
  },
};

/**
 * Get help content for a UI element by its data-testid.
 * Checks the static registry first, then falls back to extension panel tooltips.
 */
export function getHelpContent(testId: string): HelpEntry | undefined {
  if (testId in HelpContent) {
    return HelpContent[testId];
  }
  return getExtensionPanelHelpContent(testId);
}

/**
 * Check if help content exists for a given testId
 */
export function hasHelpContent(testId: string): boolean {
  if (testId in HelpContent) return true;
  return getExtensionPanelHelpContent(testId) !== undefined;
}

/**
 * Dynamically look up help content from extension panel tooltips.
 * Extension gutter buttons use the testId pattern:
 *   "extension-bottom-panel-{panelId}"
 *   "extension-panel-{panelId}"
 *
 * The tooltip field in the panel manifest contribution populates this.
 */
function getExtensionPanelHelpContent(testId: string): HelpEntry | undefined {
  // Match gutter button testId patterns for extension panels
  const panelIdFromTestId = testId.startsWith('extension-bottom-panel-')
    ? testId.slice('extension-bottom-panel-'.length)
    : testId.startsWith('extension-panel-')
    ? testId.slice('extension-panel-'.length)
    : null;

  if (!panelIdFromTestId) return undefined;

  const panels = getRegisteredPanels();
  const panel = panels.find(p => p.id === panelIdFromTestId);
  if (!panel?.tooltip) return undefined;

  // Find the keybinding bound to this panel's toggle command
  const keybindings = getRegisteredKeybindings();
  const kb = keybindings.find(k => k.commandId === `${panel.id}.toggle`);

  return {
    title: panel.title,
    body: panel.tooltip,
    shortcut: kb?.key,
  };
}
