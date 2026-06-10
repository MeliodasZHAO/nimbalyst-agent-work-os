import React, { useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { usePostHog } from 'posthog-js/react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { SettingsToggle } from '../SettingsToggle';
import { HelpTooltip } from '../../../help';
import {
  advancedSettingsAtom,
  setAdvancedSettingsAtom,
  resetWalkthroughsAtom,
  developerFeatureSettingsAtom,
  setDeveloperFeatureSettingsAtom,
  customPathDirsAtom,
  externalEditorSettingsAtom,
  setExternalEditorSettingsAtom,
  EXTERNAL_EDITOR_NAMES,
  DEVELOPER_FEATURES,
  areAllDeveloperFeaturesEnabled,
  enableAllDeveloperFeatures,
  disableAllDeveloperFeatures,
  type ReleaseChannel,
  type ExternalEditorType,
  type PreferredTerminalShell,
} from '../../../store/atoms/appSettings';
import {
  trackerAutomationAtom,
  setTrackerAutomationAtom,
} from '../../../store/atoms/trackerAutomationAtoms';
import {
  multiProjectModeAtom,
  openProjectsAtom,
  activeWorkspacePathAtom,
  restorePreviousProjectsAtom,
} from '../../../store/atoms/openProjects';

/** Reusable compact dropdown row */
function DropdownRow({
  value,
  onChange,
  name,
  description,
  options,
}: {
  value: string | number;
  onChange: (value: string) => void;
  name: string;
  description: string;
  options: { value: string | number; label: string }[];
}) {
  return (
    <div className="setting-item py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="setting-text flex flex-col gap-0 min-w-0">
          <span className="setting-name text-sm font-medium text-[var(--nim-text)]">{name}</span>
          <span className="setting-description text-xs leading-snug text-[var(--nim-text-muted)]">
            {description}
          </span>
        </div>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="setting-select shrink-0 py-1.5 px-2 pr-7 rounded-md text-sm bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%236b7280%22%20d%3D%22M3%204.5L6%207.5L9%204.5%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_8px_center] focus:border-[var(--nim-primary)]"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * AdvancedPanel - Self-contained settings panel for advanced options.
 *
 * All settings subscribe directly to Jotai atoms or load via IPC.
 * Developer mode is a global app setting.
 */
export function AdvancedPanel() {
  const posthog = usePostHog();
  // App-level advanced settings from Jotai atoms
  const [settings] = useAtom(advancedSettingsAtom);
  const [, updateSettings] = useAtom(setAdvancedSettingsAtom);
  const [, resetWalkthroughs] = useAtom(resetWalkthroughsAtom);

  // Current enhanced PATH (fetched from main process)
  const [enhancedPath, setEnhancedPath] = useState<string>('');
  const [showEnhancedPath, setShowEnhancedPath] = useState(false);
  const [availableTerminalShells, setAvailableTerminalShells] = useState<Array<{
    name: string;
    path: string;
    provider?: string;
    bootstrapMode?: 'zsh' | 'bash' | 'powershell' | 'none';
    cwdMode?: 'native' | 'wsl';
  }>>([]);

  // Developer feature settings from Jotai atoms
  const [developerSettings] = useAtom(developerFeatureSettingsAtom);
  const [, updateDeveloperSettings] = useAtom(setDeveloperFeatureSettingsAtom);
  const { developerMode, developerFeatures } = developerSettings;

  // Tracker automation settings
  const trackerAutomation = useAtomValue(trackerAutomationAtom);
  const setTrackerAutomation = useSetAtom(setTrackerAutomationAtom);

  // External editor settings from Jotai atoms
  const [externalEditorSettings] = useAtom(externalEditorSettingsAtom);
  const [, updateExternalEditorSettings] = useAtom(setExternalEditorSettingsAtom);
  const { editorType: externalEditorType, customPath: externalEditorCustomPath } = externalEditorSettings;

  // Handle developer mode change
  const handleDeveloperModeChange = async (enabled: boolean) => {
    updateDeveloperSettings({ developerMode: enabled });

    // Track mode change in PostHog
    if (posthog) {
      posthog.capture('developer_mode_changed', {
        developer_mode: enabled,
        source: 'settings',
        is_initial: false,
      });

      // Update person property
      posthog.people.set({ developer_mode: enabled });
    }
  };

  const {
    releaseChannel,
    analyticsEnabled,
    extensionDevToolsEnabled,
    walkthroughsEnabled,
    walkthroughsViewedCount,
    walkthroughsTotalCount,
    maxHeapSizeMB,
    customPathDirs,
    spellcheckEnabled,
    historyMaxAgeDays,
    historyMaxSnapshots,
    preferredTerminalShell,
  } = settings;
  const [showFeaturesMenu, setShowFeaturesMenu] = useState(false);

  // Fetch enhanced PATH when user clicks to show it
  useEffect(() => {
    if (showEnhancedPath && !enhancedPath) {
      window.electronAPI.environment.getEnhancedPath().then(setEnhancedPath);
    }
  }, [showEnhancedPath, enhancedPath]);

  // Refresh enhanced PATH when custom paths change
  useEffect(() => {
    if (showEnhancedPath) {
      window.electronAPI.environment.getEnhancedPath().then(setEnhancedPath);
    }
  }, [customPathDirs, showEnhancedPath]);

  useEffect(() => {
    if (process.platform !== 'win32') {
      return;
    }

    window.electronAPI.terminal.getAvailableShells()
      .then((shells) => setAvailableTerminalShells(shells ?? []))
      .catch((error) => {
        console.error('[AdvancedPanel] Failed to load terminal shells:', error);
        setAvailableTerminalShells([]);
      });
  }, []);

  const terminalShellOptions: Array<{ value: PreferredTerminalShell; label: string }> = [
    { value: 'auto', label: '自动 (推荐)' },
  ];
  const seenShellProviders = new Set<PreferredTerminalShell>();
  for (const shell of availableTerminalShells) {
    const provider = shell.provider as PreferredTerminalShell | undefined;
    if (!provider || provider === 'auto' || seenShellProviders.has(provider)) {
      continue;
    }
    seenShellProviders.add(provider);
    const label = shell.name === provider
      ? `${shell.name} (${shell.path})`
      : `${shell.name} [${provider}] (${shell.path})`;
    terminalShellOptions.push({ value: provider, label });
  }

  const handleModeClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setShowFeaturesMenu(prev => !prev);
    }
  };

  return (
    <div className="provider-panel flex flex-col">
      <div className="provider-panel-header mb-6 pb-4 border-b border-[var(--nim-border)]">
        <h3 className="provider-panel-title text-xl font-semibold leading-tight mb-2 text-[var(--nim-text)]">
          高级设置
        </h3>
        <p className="provider-panel-description text-sm leading-relaxed text-[var(--nim-text-muted)]">
          AI 功能的高级配置选项。
        </p>
      </div>

      {/* Application Mode - Always shown at the top */}
      <div className="provider-panel-section">
          <h4 className="provider-panel-section-title" onClick={handleModeClick}>应用模式</h4>
          <p className="provider-panel-hint">
            为此项目选择简化体验或完整开发者功能。
          </p>

          <div className="mode-selection flex flex-row gap-4 mt-3">
            <label
              className={`mode-option flex flex-1 items-start p-0 rounded-xl cursor-pointer transition-all relative border-2 ${
                !developerMode
                  ? 'selected bg-nim-hover border-nim-primary shadow-[0_0_0_3px_rgba(88,166,255,0.15)]'
                  : 'bg-nim-secondary border-nim'
              }`}
              onClick={() => handleDeveloperModeChange(false)}
            >
              <input
                type="radio"
                name="mode"
                checked={!developerMode}
                onChange={() => handleDeveloperModeChange(false)}
                className="absolute top-3 right-3 m-0 cursor-pointer w-[18px] h-[18px] accent-[var(--nim-primary)]"
              />
              <div className="p-4 w-full flex flex-col items-center text-center">
                <div className="flex flex-col items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-nim-primary text-[32px]">
                    edit_note
                  </span>
                  <span className="text-base font-semibold text-nim">标准模式</span>
                </div>
                <p className="m-0 text-[13px] leading-snug text-nim-muted">
                  专注于写作、编辑和 AI 辅助的简化界面
                </p>
              </div>
            </label>

            <label
              className={`mode-option flex flex-1 items-start p-0 rounded-xl cursor-pointer transition-all relative border-2 ${
                developerMode
                  ? 'selected bg-nim-hover border-nim-primary shadow-[0_0_0_3px_rgba(88,166,255,0.15)]'
                  : 'bg-nim-secondary border-nim'
              }`}
              onClick={() => handleDeveloperModeChange(true)}
            >
              <input
                type="radio"
                name="mode"
                checked={developerMode}
                onChange={() => handleDeveloperModeChange(true)}
                className="absolute top-3 right-3 m-0 cursor-pointer w-[18px] h-[18px] accent-[var(--nim-primary)]"
              />
              <div className="p-4 w-full flex flex-col items-center text-center">
                <div className="flex flex-col items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-nim-primary text-[32px]">
                    terminal
                  </span>
                  <span className="text-base font-semibold text-nim">开发者模式</span>
                </div>
                <p className="m-0 text-[13px] leading-snug text-nim-muted">
                  完整的开发环境，包含 Git Worktree、终端访问和开发专属功能
                </p>
              </div>
            </label>
          </div>
        </div>

      {/* Secret Features Menu - Cmd+Click on "Application Mode" title to show */}
      {showFeaturesMenu && (
        <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
          <h4 className="provider-panel-section-title text-base font-semibold mb-3 text-[var(--nim-text)]">
            功能可用性
          </h4>
          <p className="text-sm leading-relaxed text-[var(--nim-text-muted)] mb-4">
            查看基于当前模式设置可用的功能。
          </p>

          {/* Developer Features */}
          <div className="mt-4 p-3 bg-nim-secondary rounded-md border border-nim">
            {/* "All Developer Features" master toggle */}
            <div className="setting-item mb-3 pb-3 border-b border-nim">
              <label className="setting-label">
                <input
                  type="checkbox"
                  checked={areAllDeveloperFeaturesEnabled(developerFeatures)}
                  onChange={(e) => {
                    const newFeatures = e.target.checked ? enableAllDeveloperFeatures() : disableAllDeveloperFeatures();
                    updateDeveloperSettings({ developerFeatures: newFeatures });
                  }}
                  disabled={!developerMode}
                  className="setting-checkbox"
                />
                <div className="setting-text">
                  <span className="setting-name">所有开发者功能</span>
                  <span className="setting-description">
                    一次性启用或禁用所有开发者功能
                  </span>
                </div>
              </label>
            </div>

            {/* Individual developer feature toggles */}
            {DEVELOPER_FEATURES.map((feature) => {
              const isAvailable = developerMode && developerFeatures[feature.tag];
              return (
                <div key={feature.tag} className="setting-item py-2">
                  <label className="setting-label">
                    <input
                      type="checkbox"
                      checked={developerFeatures[feature.tag]}
                      onChange={(e) => {
                        updateDeveloperSettings({
                          developerFeatures: {
                            ...developerFeatures,
                            [feature.tag]: e.target.checked,
                          },
                        });
                      }}
                      disabled={!developerMode}
                      className="setting-checkbox"
                    />
                    <div className="setting-text">
                      <span className="setting-name flex items-center gap-2">
                        {feature.icon && (
                          <span className="material-symbols-outlined text-sm">{feature.icon}</span>
                        )}
                        {feature.name}
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            isAvailable
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {isAvailable ? '可用' : '隐藏'}                        </span>
                      </span>
                      <span className="setting-description">{feature.description}</span>
                    </div>
                  </label>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-[var(--nim-text-faint)] mt-3">
            开发者模式: {developerMode ? '开启' : '关闭'}
          </p>
        </div>
      )}

      {/* ── Release Channel ── */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-base font-semibold mb-3 text-[var(--nim-text)]">发布渠道</h4>
        <p className="text-sm leading-relaxed text-[var(--nim-text-muted)] mb-4">
          选择 Nimbalyst 拉取自动更新的发布流。Alpha 和 Beta 功能在各自功能的设置页面中单独配置。
        </p>

        <div className="setting-item py-3">
          <div className="setting-text flex flex-col gap-0.5">
            <span className="setting-name text-sm font-medium text-[var(--nim-text)]">更新渠道</span>
            <span className="setting-description text-xs leading-relaxed text-[var(--nim-text-muted)]">
              <strong>稳定版:</strong> 正式发布版本（推荐大多数用户使用）。<br/>
              <strong>Alpha:</strong> 频繁发布的粗糙开发版本。更新之间可能存在 Bug 和破坏性变更。
            </span>
          </div>
          <select
            value={releaseChannel}
            onChange={(e) => {
              const newChannel = e.target.value as ReleaseChannel;
              updateSettings({ releaseChannel: newChannel });
              posthog?.capture('release_channel_changed', {
                channel: newChannel,
              });
            }}
            className="setting-select mt-2 w-full py-2 px-3 pr-9 rounded-md text-sm bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%236b7280%22%20d%3D%22M3%204.5L6%207.5L9%204.5%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center] focus:border-[var(--nim-primary)]"
          >
            <option value="stable">稳定版</option>
            <option value="alpha">Alpha (开发者版本)</option>
          </select>
        </div>

        {releaseChannel === 'alpha' && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded border border-[var(--nim-warning)]/30 bg-[var(--nim-warning)]/10">
            <MaterialSymbol icon="warning" size={16} className="text-[var(--nim-warning)] shrink-0 mt-0.5" />
            <p className="m-0 text-[13px] text-[var(--nim-text)] leading-snug">
              Alpha 渠道发布的是粗糙的开发者版本，可能不稳定或包含未完成的工作。如果遇到问题，请切换回稳定版。
            </p>
          </div>
        )}
      </div>

      {/* ── General ── */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-base font-semibold mb-2 text-[var(--nim-text)]">通用</h4>

        <MultiProjectModeToggle />

        <RestorePreviousProjectsToggle />

        <SettingsToggle
          checked={analyticsEnabled}
          onChange={(checked) => updateSettings({ analyticsEnabled: checked })}
          name="发送匿名使用数据"
          description="帮助改善 Nimbalyst，发送匿名使用数据。不收集提示词或个人信息。"
        />

        <SettingsToggle
          checked={spellcheckEnabled}
          onChange={(checked) => updateSettings({ spellcheckEnabled: checked })}
          name="拼写检查"
          description="在编辑器和文本输入框中启用系统拼写检查。"
        />

        <SettingsToggle
          checked={walkthroughsEnabled}
          onChange={(checked) => updateSettings({ walkthroughsEnabled: checked })}
          name="显示功能引导"
          description={`新功能和技巧的引导教程。${walkthroughsTotalCount > 0 ? ` (${walkthroughsViewedCount}/${walkthroughsTotalCount} 已查看)` : ''}`}
        />

        {walkthroughsViewedCount > 0 && (
          <div className="py-1 pl-7">
            <button onClick={() => resetWalkthroughs()} className="nim-btn-secondary text-xs">
              重置所有引导
            </button>
          </div>
        )}
      </div>

      {/* ── Tracker Automation ── */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0" data-testid="tracker-automation-section">
        <HelpTooltip testId="tracker-automation-section">
          <h4 className="provider-panel-section-title text-base font-semibold mb-2 text-[var(--nim-text)] inline-block">追踪器自动化</h4>
        </HelpTooltip>

        <SettingsToggle
          checked={trackerAutomation.enabled}
          onChange={(checked) => setTrackerAutomation({ enabled: checked })}
          name="关联提交到追踪器项目"
          description="通过会话关系和 Issue Key 解析（例如提交信息中的 NIM-123）将 Git 提交关联到追踪器项目。"
        />

        {trackerAutomation.enabled && (
          <SettingsToggle
            checked={trackerAutomation.autoCloseOnCommit}
            onChange={(checked) => setTrackerAutomation({ autoCloseOnCommit: checked })}
            name="在 Fixes/Closes/Resolves 时关闭项目"
            description="当提交信息使用关闭关键词时，自动将追踪器项目状态设为完成。"
          />
        )}
      </div>

      {/* ── Tools & Environment ── */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-base font-semibold mb-2 text-[var(--nim-text)]">工具与环境</h4>

        <DropdownRow
          value={externalEditorType}
          onChange={(val) => updateExternalEditorSettings({ editorType: val as ExternalEditorType })}
          name="外部编辑器"
          description="'在...中打开'右键菜单选项使用的编辑器。"
          options={[
            { value: 'none', label: '无' },
            { value: 'vscode', label: 'VS Code' },
            { value: 'cursor', label: 'Cursor' },
            { value: 'webstorm', label: 'WebStorm' },
            { value: 'sublime', label: 'Sublime Text' },
            { value: 'vim', label: 'Vim (Terminal)' },
            { value: 'nvim', label: 'Neovim (Terminal)' },
            { value: 'custom', label: '自定义...' },
          ]}
        />

        {externalEditorType === 'custom' && (
          <div className="py-2 pl-7">
            <input
              type="text"
              value={externalEditorCustomPath || ''}
              onChange={(e) => updateExternalEditorSettings({ customPath: e.target.value })}
              placeholder={process.platform === 'win32' ? 'C:\\Program Files\\Editor\\editor.exe' : '/usr/local/bin/myeditor'}
              className="w-full py-1.5 px-3 rounded-md text-sm bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] outline-none focus:border-[var(--nim-primary)] font-mono"
            />
          </div>
        )}

        <SettingsToggle
          checked={extensionDevToolsEnabled}
          onChange={(checked) => updateSettings({ extensionDevToolsEnabled: checked })}
          name="扩展开发工具"
          description="启用用于构建、安装和热重载扩展的 MCP 工具。"
        />

        <DropdownRow
          value={maxHeapSizeMB}
          onChange={(val) => updateSettings({ maxHeapSizeMB: parseInt(val, 10) })}
          name="最大堆内存"
          description="V8 内存限制。如遇内存不足崩溃请增大。需要重启。"
          options={[
            { value: 2048, label: '2 GB' },
            { value: 4096, label: '4 GB (默认)' },
            { value: 6144, label: '6 GB' },
            { value: 8192, label: '8 GB' },
            { value: 12288, label: '12 GB' },
            { value: 16384, label: '16 GB' },
          ]}
        />

        {process.platform === 'win32' && (
          <>
            <DropdownRow
              value={preferredTerminalShell}
              onChange={(val) => updateSettings({ preferredTerminalShell: val as PreferredTerminalShell })}
              name="首选终端 Shell"
              description="选择新终端应使用的 Windows Shell。自动模式遵循内置优先级。"
              options={terminalShellOptions}
            />

            <div className="setting-item py-2">
              <div className="setting-text flex flex-col gap-0 mb-2">
                <span className="setting-name text-sm font-medium text-[var(--nim-text)]">检测到的终端 Shell</span>
                <span className="setting-description text-xs leading-snug text-[var(--nim-text-muted)]">
                  当前 Windows Shell 发现结果，用于终端选择和恢复。
                </span>
              </div>

              <div className="select-text p-2 rounded-md text-xs bg-[var(--nim-bg-tertiary)] border border-[var(--nim-border)] text-[var(--nim-text-muted)] font-mono">
                {availableTerminalShells.length === 0 ? (
                  <div>未检测到支持的终端 Shell。</div>
                ) : (
                  availableTerminalShells.map((shell) => (
                    <div key={`${shell.provider || shell.name}-${shell.path}`} className="py-0.5 break-all">
                      {`${shell.provider || shell.name} | ${shell.path} | bootstrap=${shell.bootstrapMode || 'none'} | cwd=${shell.cwdMode || 'native'}`}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        <DropdownRow
          value={historyMaxAgeDays}
          onChange={(val) => updateSettings({ historyMaxAgeDays: parseInt(val, 10) })}
          name="历史保留时间"
          description="文件历史快照在自动清理前的最长保留天数。"
          options={[
            { value: 7, label: '7 天' },
            { value: 14, label: '14 天' },
            { value: 30, label: '30 天 (默认)' },
            { value: 60, label: '60 天' },
            { value: 90, label: '90 天' },
            { value: 180, label: '180 天' },
            { value: 365, label: '1 年' },
          ]}
        />

        <DropdownRow
          value={historyMaxSnapshots}
          onChange={(val) => updateSettings({ historyMaxSnapshots: parseInt(val, 10) })}
          name="每个文件最大快照数"
          description="超出此限制的最旧快照将被删除。"
          options={[
            { value: 50, label: '50' },
            { value: 100, label: '100' },
            { value: 250, label: '250 (默认)' },
            { value: 500, label: '500' },
            { value: 1000, label: '1,000' },
          ]}
        />

        {/* Custom PATH */}
        <div className="setting-item py-2">
          <div className="setting-text flex flex-col gap-0 mb-2">
            <span className="setting-name text-sm font-medium text-[var(--nim-text)]">自定义 PATH 目录</span>
            <span className="setting-description text-xs leading-snug text-[var(--nim-text-muted)]">
              MCP 服务器安装、CLI 工具检测和代理 SDK 操作的附加目录。
            </span>
          </div>
          <textarea
            value={customPathDirs}
            onChange={(e) => updateSettings({ customPathDirs: e.target.value })}
            placeholder={process.platform === 'win32'
              ? 'C:\\MyTools;C:\\Programs\\bin'
              : '/opt/mytools/bin:/usr/local/custom/bin'}
            rows={2}
            className="w-full py-1.5 px-3 rounded-md text-sm bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] outline-none focus:border-[var(--nim-primary)] font-mono resize-none"
          />
          <div className="mt-1">
            <button
              onClick={() => setShowEnhancedPath(!showEnhancedPath)}
              className="text-xs text-[var(--nim-link)] hover:text-[var(--nim-link-hover)] cursor-pointer"
            >
              {showEnhancedPath ? '隐藏当前 PATH' : '显示当前 PATH'}
            </button>

            {showEnhancedPath && enhancedPath && (
              <div className="mt-2">
                <div
                  className="p-2 rounded-md text-xs bg-[var(--nim-bg-tertiary)] border border-[var(--nim-border)] text-[var(--nim-text-muted)] font-mono overflow-x-auto"
                  style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    wordBreak: 'break-all',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {enhancedPath.split(process.platform === 'win32' ? ';' : ':').map((p, index) => (
                    <div key={index} className="py-0.5">
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

/**
 * Toggle for the multi-project rail. When the user disables it with
 * inactive warm projects in the rail, those projects' main-process
 * services are released and the rail collapses to just the active
 * project so state stays consistent.
 */
function MultiProjectModeToggle() {
  const [enabled, setEnabled] = useAtom(multiProjectModeAtom);
  const [openProjects, setOpenProjects] = useAtom(openProjectsAtom);
  const activePath = useAtomValue(activeWorkspacePathAtom);

  const handleChange = async (next: boolean) => {
    if (!next && openProjects.length > 1) {
      const proceed = window.confirm(
        `${openProjects.length} projects are open in the rail. Disable multi-project mode? The other projects will be closed (their unsaved work stays on disk).`
      );
      if (!proceed) return;

      // Release services for every non-active path before collapsing the
      // rail. The main process refcounts services across windows, so this
      // only frees them when no other window references the path.
      const inactivePaths = openProjects
        .filter((p) => p.path !== activePath)
        .map((p) => p.path);
      await Promise.all(
        inactivePaths.map((path) =>
          window.electronAPI?.invoke?.('workspace:unregister-additional', { workspacePath: path })
            .catch((err: unknown) => {
              console.error('[AdvancedPanel] unregister-additional failed for', path, err);
            })
        )
      );

      const remaining = openProjects.filter((p) => p.path === activePath);
      setOpenProjects(remaining);
    }
    setEnabled(next);
  };

  return (
    <SettingsToggle
      checked={enabled}
      onChange={handleChange}
      name="多项目模式"
      description="在单个窗口中通过项目栏打开多个项目。关闭后，每个项目在各自的窗口中打开。"
    />
  );
}

/**
 * Toggle for re-opening last session's rail projects on launch. Default
 * off so a normal launch from the project picker opens just the picked
 * project; warm rail projects must be added explicitly via the rail's
 * `+` button.
 */
function RestorePreviousProjectsToggle() {
  const [enabled, setEnabled] = useAtom(restorePreviousProjectsAtom);
  const isMultiProject = useAtomValue(multiProjectModeAtom);

  return (
    <SettingsToggle
      checked={enabled}
      onChange={setEnabled}
      name="启动时恢复上次的项目"
      description={
        isMultiProject
          ? '开启后，项目栏会恢复上次关闭时打开的所有项目。关闭后，只打开你从启动界面选择的项目。'
          : '仅在多项目模式启用时生效。'
      }
    />
  );
}
