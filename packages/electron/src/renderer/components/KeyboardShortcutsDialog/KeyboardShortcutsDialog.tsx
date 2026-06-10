import React, { useState, useEffect } from 'react';
import { KeyboardShortcuts, getShortcutDisplay } from '../../../shared/KeyboardShortcuts';
import {
  getRegisteredKeybindings,
  subscribeToCommandRegistry,
  type RegisteredKeybinding,
} from '../../extensions/commands/ExtensionCommandRegistry';
import { getExtensionLoader } from '@nimbalyst/runtime';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    label: string;
    shortcut: string;
  }>;
}

type TabId = 'general' | 'editor' | 'extensions';

const IS_MAC = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

/**
 * Convert a manifest key string like "ctrl+shift+g" to the display format
 * compatible with getShortcutDisplay (e.g., "Ctrl+Shift+G").
 */
function formatManifestKey(key: string): string {
  return key
    .split('+')
    .map(part => {
      const lower = part.toLowerCase();
      if (lower === 'ctrl') return 'Ctrl';
      if (lower === 'cmd') return 'Cmd';
      if (lower === 'shift') return 'Shift';
      if (lower === 'alt') return 'Alt';
      if (lower === 'option') return 'Option';
      // Single character keys get uppercased, multi-char stay as-is
      return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('+');
}

/**
 * Build extension shortcut groups from registered keybindings,
 * grouped by extension name.
 */
function buildExtensionShortcutGroups(keybindings: RegisteredKeybinding[]): ShortcutGroup[] {
  if (keybindings.length === 0) return [];

  // Group by extension ID
  const byExtension = new Map<string, RegisteredKeybinding[]>();
  for (const kb of keybindings) {
    const list = byExtension.get(kb.extensionId) ?? [];
    list.push(kb);
    byExtension.set(kb.extensionId, list);
  }

  // Resolve extension names
  const loader = getExtensionLoader();
  const groups: ShortcutGroup[] = [];

  for (const [extensionId, kbs] of byExtension) {
    const ext = loader.getExtension(extensionId);
    const title = ext?.manifest.name ?? extensionId;

    groups.push({
      title,
      shortcuts: kbs.map(kb => ({
        label: kb.commandTitle,
        shortcut: formatManifestKey(kb.key),
      })),
    });
  }

  return groups;
}

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [extensionGroups, setExtensionGroups] = useState<ShortcutGroup[]>([]);

  // Handle Escape key to close dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Subscribe to extension keybinding changes
  useEffect(() => {
    function sync() {
      setExtensionGroups(buildExtensionShortcutGroups(getRegisteredKeybindings()));
    }
    sync();
    const unsubscribe = subscribeToCommandRegistry(sync);
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  // All general shortcuts are defined in: packages/electron/src/shared/KeyboardShortcuts.ts
  const generalShortcuts: ShortcutGroup[] = [
    {
      title: '文件',
      shortcuts: [
        { label: '新建文件 / 新建会话', shortcut: KeyboardShortcuts.file.newFile },
        { label: '新建会话（任意模式）', shortcut: KeyboardShortcuts.file.newSessionGlobal },
        { label: '打开文件', shortcut: KeyboardShortcuts.file.open },
        { label: '打开文件夹', shortcut: KeyboardShortcuts.file.openFolder },
        { label: '保存', shortcut: KeyboardShortcuts.file.save },
        { label: '关闭标签', shortcut: KeyboardShortcuts.file.closeTab },
        { label: '重新打开已关闭的标签', shortcut: KeyboardShortcuts.file.reopenClosedTab },
        { label: '关闭项目', shortcut: KeyboardShortcuts.file.closeProject },
        { label: '退出', shortcut: KeyboardShortcuts.file.quit },
      ],
    },
    {
      title: '编辑',
      shortcuts: [
        { label: '撤销', shortcut: KeyboardShortcuts.edit.undo },
        { label: '重做', shortcut: KeyboardShortcuts.edit.redo },
        { label: '剪切', shortcut: KeyboardShortcuts.edit.cut },
        { label: '复制', shortcut: KeyboardShortcuts.edit.copy },
        { label: '粘贴', shortcut: KeyboardShortcuts.edit.paste },
        { label: '粘贴为纯文本', shortcut: KeyboardShortcuts.edit.pasteAsText },
        { label: '全选', shortcut: KeyboardShortcuts.edit.selectAll },
        { label: '查找', shortcut: KeyboardShortcuts.edit.find },
        { label: '查找下一个', shortcut: KeyboardShortcuts.edit.findNext },
        { label: '查找上一个', shortcut: KeyboardShortcuts.edit.findPrevious },
        { label: '查看本地历史', shortcut: KeyboardShortcuts.edit.viewHistory },
        { label: '批准当前操作', shortcut: KeyboardShortcuts.edit.approve },
        { label: '拒绝当前操作', shortcut: KeyboardShortcuts.edit.reject },
        { label: '切换计划模式（Claude Code）', shortcut: 'Shift+Tab' },
      ],
    },
    {
      title: '视图',
      shortcuts: [
        { label: '文件模式', shortcut: KeyboardShortcuts.view.filesMode },
        { label: 'Agent 模式', shortcut: KeyboardShortcuts.view.agentMode },
        { label: '会话看板视图', shortcut: KeyboardShortcuts.window.kanbanView },
        { label: '切换 AI 聊天面板', shortcut: KeyboardShortcuts.view.toggleAIChat },
        { label: '切换底部面板', shortcut: KeyboardShortcuts.view.toggleBottomPanel },
        { label: '切换终端面板', shortcut: KeyboardShortcuts.view.toggleTerminalPanel },
        { label: '看板模式', shortcut: KeyboardShortcuts.view.trackerMode },
        { label: '共享文档', shortcut: KeyboardShortcuts.view.collabMode },
        { label: '切换侧边栏', shortcut: KeyboardShortcuts.view.toggleSidebar },
        { label: '后退', shortcut: KeyboardShortcuts.view.navigateBack },
        { label: '前进', shortcut: KeyboardShortcuts.view.navigateForward },
        { label: '下一个标签', shortcut: KeyboardShortcuts.view.nextTab },
        { label: '上一个标签', shortcut: KeyboardShortcuts.view.prevTab },
        { label: '实际大小', shortcut: KeyboardShortcuts.view.actualSize },
        { label: '放大', shortcut: KeyboardShortcuts.view.zoomIn },
        { label: '缩小', shortcut: KeyboardShortcuts.view.zoomOut },
        { label: '切换全屏', shortcut: KeyboardShortcuts.view.toggleFullScreen },
      ],
    },
    {
      title: '窗口',
      shortcuts: [
        { label: '项目管理器', shortcut: KeyboardShortcuts.window.workspaceManager },
        { label: '切换项目', shortcut: KeyboardShortcuts.window.projectQuickOpen },
        { label: '会话快速打开', shortcut: KeyboardShortcuts.window.sessionQuickOpen },
        { label: '提示词快速打开', shortcut: KeyboardShortcuts.window.promptQuickOpen },
        { label: '内容搜索', shortcut: KeyboardShortcuts.window.contentSearch },
        { label: '新建 Worktree', shortcut: KeyboardShortcuts.window.newWorktree },
        { label: '设置', shortcut: KeyboardShortcuts.window.aiModels },
        { label: '最小化', shortcut: KeyboardShortcuts.window.minimize },
      ],
    },
  ];

  // Editor shortcuts are defined in: packages/runtime/src/editor/plugins/ShortcutsPlugin/shortcuts.ts
  const editorShortcuts: ShortcutGroup[] = [
    {
      title: '文字格式',
      shortcuts: [
        { label: '加粗', shortcut: IS_MAC ? '⌘+B' : 'Ctrl+B' },
        { label: '斜体', shortcut: IS_MAC ? '⌘+I' : 'Ctrl+I' },
        { label: '下划线', shortcut: IS_MAC ? '⌘+U' : 'Ctrl+U' },
        { label: '删除线', shortcut: IS_MAC ? '⌘+Shift+X' : 'Ctrl+Shift+X' },
        { label: '插入链接', shortcut: IS_MAC ? '⌘+K' : 'Ctrl+K' },
        { label: '清除格式', shortcut: IS_MAC ? '⌘+\\' : 'Ctrl+\\' },
      ],
    },
    {
      title: '段落格式',
      shortcuts: [
        { label: '正文', shortcut: IS_MAC ? '⌘+Opt+0' : 'Ctrl+Alt+0' },
        { label: '标题 1', shortcut: IS_MAC ? '⌘+Opt+1' : 'Ctrl+Alt+1' },
        { label: '标题 2', shortcut: IS_MAC ? '⌘+Opt+2' : 'Ctrl+Alt+2' },
        { label: '标题 3', shortcut: IS_MAC ? '⌘+Opt+3' : 'Ctrl+Alt+3' },
        { label: '有序列表', shortcut: IS_MAC ? '⌘+Shift+7' : 'Ctrl+Shift+7' },
        { label: '无序列表', shortcut: IS_MAC ? '⌘+Shift+8' : 'Ctrl+Shift+8' },
        { label: '任务列表', shortcut: IS_MAC ? '⌘+Shift+9' : 'Ctrl+Shift+9' },
        { label: '代码块', shortcut: IS_MAC ? '⌘+Opt+C' : 'Ctrl+Alt+C' },
        { label: '引用', shortcut: IS_MAC ? '⌃+Shift+Q' : 'Ctrl+Shift+Q' },
      ],
    },
    {
      title: '文字对齐',
      shortcuts: [
        { label: '左对齐', shortcut: IS_MAC ? '⌘+Shift+L' : 'Ctrl+Shift+L' },
        { label: '居中对齐', shortcut: IS_MAC ? '⌘+Shift+E' : 'Ctrl+Shift+E' },
        { label: '右对齐', shortcut: IS_MAC ? '⌘+Shift+R' : 'Ctrl+Shift+R' },
        { label: '两端对齐', shortcut: IS_MAC ? '⌘+Shift+J' : 'Ctrl+Shift+J' },
        { label: '增加缩进', shortcut: IS_MAC ? '⌘+]' : 'Ctrl+]' },
        { label: '减少缩进', shortcut: IS_MAC ? '⌘+[' : 'Ctrl+[' },
      ],
    },
    {
      title: '大小写与字号',
      shortcuts: [
        { label: '小写', shortcut: IS_MAC ? '⌃+Shift+1' : 'Ctrl+Shift+1' },
        { label: '大写', shortcut: IS_MAC ? '⌃+Shift+2' : 'Ctrl+Shift+2' },
        { label: '首字母大写', shortcut: IS_MAC ? '⌃+Shift+3' : 'Ctrl+Shift+3' },
        { label: '增大字号', shortcut: IS_MAC ? '⌘+Shift+.' : 'Ctrl+Shift+.' },
        { label: '减小字号', shortcut: IS_MAC ? '⌘+Shift+,' : 'Ctrl+Shift+,' },
        { label: '下标', shortcut: IS_MAC ? '⌘+,' : 'Ctrl+,' },
        { label: '上标', shortcut: IS_MAC ? '⌘+.' : 'Ctrl+.' },
      ],
    },
  ];

  const shortcutGroups = activeTab === 'general'
    ? generalShortcuts
    : activeTab === 'editor'
    ? editorShortcuts
    : extensionGroups;

  return (
    <div
      className="keyboard-shortcuts-dialog-overlay nim-overlay"
      onClick={onClose}
    >
      <div
        className="keyboard-shortcuts-dialog flex flex-col w-[90vw] max-w-[900px] h-[85vh] rounded-lg border border-[var(--nim-border)] bg-[var(--nim-bg)] shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-shortcuts-dialog-header flex items-center justify-between px-6 py-5 border-b border-[var(--nim-border)]">
          <h2 className="m-0 text-xl font-semibold text-[var(--nim-text)]">
            快捷键
          </h2>
          <button
            className="keyboard-shortcuts-dialog-close flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none text-[32px] leading-none text-[var(--nim-text-muted)] cursor-pointer rounded transition-all duration-200 hover:bg-[var(--nim-bg-hover)] hover:text-[var(--nim-text)]"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 px-6 pt-4 border-b border-[var(--nim-border)]">
          {(['general', 'editor', 'extensions'] as TabId[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeTab === tab
                  ? 'bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] border-b-2 border-[var(--nim-primary)]'
                  : 'text-[var(--nim-text-muted)] hover:text-[var(--nim-text)] hover:bg-[var(--nim-bg-hover)]'
              }`}
            >
              {tab === 'general' ? '通用' : tab === 'editor' ? '编辑器格式' : '扩展'}
            </button>
          ))}
        </div>

        <div className="keyboard-shortcuts-dialog-content overflow-y-auto flex-1 p-6 grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-8 max-[900px]:grid-cols-1 max-[600px]:p-5 max-[600px]:gap-6">
          {shortcutGroups.length === 0 && activeTab === 'extensions' ? (
            <div className="text-[var(--nim-text-muted)] text-sm">
              尚未注册扩展快捷键。扩展可以通过其 manifest.json 注册快捷键。
            </div>
          ) : (
            shortcutGroups.map((group) => (
              <div key={group.title} className="keyboard-shortcuts-group flex flex-col gap-3">
                <h3 className="keyboard-shortcuts-group-title m-0 text-sm font-semibold text-[var(--nim-text-muted)] uppercase tracking-[0.5px]">
                  {group.title}
                </h3>
                <div className="keyboard-shortcuts-list flex flex-col gap-1">
                  {group.shortcuts.map((item) => (
                    <div
                      key={item.label}
                      className="keyboard-shortcut-item flex items-center justify-between py-1.5 gap-4"
                    >
                      <span className="keyboard-shortcut-label text-[var(--nim-text)] text-sm flex-1">
                        {item.label}
                      </span>
                      <kbd className="keyboard-shortcut-key bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] rounded px-2.5 py-1 font-sans text-[13px] font-medium text-[var(--nim-text)] whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)] min-w-[60px] text-center">
                        {getShortcutDisplay(item.shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-3 border-t border-[var(--nim-border)] text-[var(--nim-text-muted)] text-xs">
          按 <kbd className="bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] rounded px-1.5 py-0.5 mx-1">Esc</kbd> 关闭
        </div>
      </div>
    </div>
  );
}
