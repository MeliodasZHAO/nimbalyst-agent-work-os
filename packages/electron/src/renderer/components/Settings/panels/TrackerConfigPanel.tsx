import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAtomValue } from 'jotai';
import {
  MaterialSymbol,
  globalRegistry,
  parseTrackerYAML,
  type TrackerDataModel,
  type TrackerSyncMode,
} from '@nimbalyst/runtime';
import { trackerItemCountByTypeAtom } from '@nimbalyst/runtime/plugins/TrackerPlugin';
import { trackerSyncConfigChangeAtom } from '../../../store/atoms/trackerSync';
import { AlphaBadge, SETTINGS_ALPHA_TOOLTIP } from '../../common/AlphaBadge';
import { useDialog } from '../../../contexts/DialogContext';
import {
  buildTrackerUpgradeConfirmOptions,
  canUpgradeTrackerMode,
  getTrackerStorageCopy,
  requiresTrackerUpgradeConfirmation,
} from './trackerConfigUpgrade';

// ============================================================================
// Types
// ============================================================================

interface TrackerConfigPanelProps {
  workspacePath?: string;
}

interface TrackerTypeConfig {
  model: TrackerDataModel;
  syncMode: TrackerSyncMode;
}

const ISSUE_KEY_PREFIX_REGEX = /^[A-Z]{2,5}$/;

// ============================================================================
// Sub-components
// ============================================================================

/** Small component so each row subscribes to its own count atom */
function TrackerTypeCount({ type }: { type: string }) {
  const count = useAtomValue(trackerItemCountByTypeAtom(type));
  return <>{count}</>;
}

/** Find the YAML file in .nimbalyst/trackers whose parsed `type` matches and delete it. */
async function deleteCustomTrackerYAML(workspacePath: string, type: string): Promise<boolean> {
  const api = (window as any).electronAPI;
  const trackersDir = `${workspacePath}/.nimbalyst/trackers`;
  let files: Array<{ type: string; name: string }> = [];
  try {
    files = await api.getFolderContents(trackersDir);
  } catch {
    return false;
  }
  const yamlFiles = files.filter(
    (f) => f.type === 'file' && (f.name.endsWith('.yaml') || f.name.endsWith('.yml'))
  );
  for (const file of yamlFiles) {
    const filePath = `${trackersDir}/${file.name}`;
    try {
      const result = await api.readFileContent(filePath);
      if (!result?.success || !result.content) continue;
      const model = parseTrackerYAML(result.content);
      if (model.type === type) {
        await api.deleteFile(filePath);
        return true;
      }
    } catch {
      // Skip unparseable files
    }
  }
  return false;
}

/**
 * Trash button that subscribes to the count atom so it can block deletion when items exist.
 * Rendered only for non-builtin tracker types.
 */
function DeleteTrackerTypeButton({
  model,
  workspacePath,
}: {
  model: TrackerDataModel;
  workspacePath?: string;
}) {
  const count = useAtomValue(trackerItemCountByTypeAtom(model.type));

  const handleClick = useCallback(async () => {
    if (!workspacePath) return;
    if (count > 0) {
      window.alert(
        `无法删除 "${model.displayNamePlural}"：还有 ${count} 个此类型的项目。请先删除这些项目。`
      );
      return;
    }
    if (!window.confirm(`删除看板类型 "${model.displayNamePlural}"？此操作无法撤销。`)) {
      return;
    }
    const fileDeleted = await deleteCustomTrackerYAML(workspacePath, model.type);
    if (!fileDeleted) {
      window.alert(
        `在 .nimbalyst/trackers/ 中找不到 "${model.displayNamePlural}" 的源 YAML 文件。看板类型未被删除。`
      );
      return;
    }
    globalRegistry.unregister(model.type);
  }, [count, model.displayNamePlural, model.type, workspacePath]);

  return (
    <button
      onClick={handleClick}
      className="p-1 rounded text-[var(--nim-text-muted)] hover:text-[#ef4444] hover:bg-[var(--nim-bg-tertiary)] cursor-pointer"
      title={`Delete tracker type "${model.displayNamePlural}"`}
      data-testid={`delete-tracker-type-${model.type}`}
    >
      <MaterialSymbol icon="delete" size={14} />
    </button>
  );
}

function SyncModeToggle({ mode, onChange }: {
  mode: TrackerSyncMode;
  onChange: (mode: TrackerSyncMode) => void;
}) {
  const options: { value: TrackerSyncMode; label: string }[] = [
    { value: 'local', label: '本地' },
    { value: 'shared', label: '共享' },
    { value: 'hybrid', label: '混合' },
  ];

  return (
    <div className="flex bg-[var(--nim-bg)] border border-[var(--nim-bg-tertiary)] rounded-md overflow-hidden">
      {options.map((opt) => {
        const isActive = mode === opt.value;
        let activeClass = '';
        if (isActive) {
          if (opt.value === 'local') activeClass = 'bg-[var(--nim-bg-tertiary)] text-[var(--nim-text-muted)]';
          else if (opt.value === 'shared') activeClass = 'bg-[rgba(96,165,250,0.2)] text-[var(--nim-primary)]';
          else activeClass = 'bg-[rgba(167,139,250,0.2)] text-[#a78bfa]';
        }

        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-[11px] font-medium cursor-pointer border-none whitespace-nowrap transition-all duration-150 ${
              isActive
                ? activeClass
                : 'bg-transparent text-[var(--nim-text-disabled)]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SyncBadge({ mode }: { mode: TrackerSyncMode }) {
  if (mode === 'shared') {
    return (
      <span className="inline-flex items-center gap-1 px-[7px] py-[2px] rounded-[10px] text-[10px] font-semibold bg-[rgba(96,165,250,0.15)] text-[var(--nim-primary)]">
        <MaterialSymbol icon="share" size={8} />
        共享
      </span>
    );
  }
  if (mode === 'hybrid') {
    return (
      <span className="inline-flex items-center gap-1 px-[7px] py-[2px] rounded-[10px] text-[10px] font-semibold bg-[rgba(167,139,250,0.15)] text-[#a78bfa]">
        混合
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-[7px] py-[2px] rounded-[10px] text-[10px] font-semibold bg-[rgba(180,180,180,0.1)] text-[var(--nim-text-faint)]">
      本地
    </span>
  );
}

function TrackerIcon({ color, icon }: { color: string; icon: string }) {
  return (
    <div
      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
      style={{ background: `${color}20` }}
    >
      <MaterialSymbol icon={icon} size={16} style={{ color }} fill />
    </div>
  );
}

function TrackerStorageInfoBanner() {
  return (
    <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
      <div className="flex items-start gap-2.5 p-3 bg-[rgba(96,165,250,0.08)] border border-[rgba(96,165,250,0.2)] rounded-lg">
        <MaterialSymbol icon="storage" size={14} className="text-[var(--nim-primary)] shrink-0 mt-0.5" />
        <div className="text-[12px] text-[var(--nim-text-muted)] leading-relaxed">
          {getTrackerStorageCopy()}
        </div>
      </div>
    </div>
  );
}

function getSyncMetaText(mode: TrackerSyncMode): string {
  switch (mode) {
    case 'shared': return '对所有团队成员可见';
    case 'local': return '仅你自己可见';
    case 'hybrid': return '每个项目可单独选择共享或本地';
  }
}

// ============================================================================
// Issue Key Prefix Input
// ============================================================================

function IssueKeyPrefixInput({ value, onChange }: {
  value: string;
  onChange: (prefix: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleBlur = useCallback(() => {
    const upper = draft.toUpperCase();
    if (!ISSUE_KEY_PREFIX_REGEX.test(upper)) {
      setError('必须为 2-5 个大写字母');
      return;
    }
    setError('');
    if (upper !== value) {
      onChange(upper);
    }
  }, [draft, value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  return (
    <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
      <h4 className="provider-panel-section-title text-[15px] font-semibold mb-2 text-[var(--nim-text)]">
        Issue 编号前缀
      </h4>
      <p className="text-[13px] leading-relaxed text-[var(--nim-text-muted)] mb-3">
        新建看板项目将使用此前缀（例如 <code className="text-[11px] text-[var(--nim-code-text)] bg-[var(--nim-code-bg)] px-1 py-[1px] rounded">{draft || 'NIM'}-42</code>）。
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.toUpperCase());
            setError('');
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          maxLength={5}
          placeholder="NIM"
          className="w-24 px-2.5 py-1.5 text-[13px] font-mono bg-[var(--nim-bg)] border border-[var(--nim-border)] rounded-md text-[var(--nim-text)] outline-none focus:border-[var(--nim-primary)] transition-colors"
        />
        <span className="text-[13px] text-[var(--nim-text-faint)]">-123</span>
      </div>
      {error && (
        <p className="text-[11px] text-[var(--nim-error)] mt-1.5">{error}</p>
      )}
      <p className="text-[11px] text-[var(--nim-text-faint)] mt-2">
        修改前缀只影响新项目。已有项目保留其当前编号。
      </p>
    </div>
  );
}

// ============================================================================
// Admin View
// ============================================================================

function AdminView({ trackers, onSyncModeChange, workspacePath }: {
  trackers: TrackerTypeConfig[];
  onSyncModeChange: (type: string, mode: TrackerSyncMode) => void;
  workspacePath?: string;
}) {
  return (
    <>
      {/* Team Sync Policy Section */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-[15px] font-semibold mb-2 text-[var(--nim-text)] flex items-center gap-2">
          团队同步策略
          <span className="px-[7px] py-[2px] rounded-[10px] text-[10px] font-semibold bg-[rgba(96,165,250,0.15)] text-[var(--nim-primary)]">
            管理员
          </span>
        </h4>
        <p className="text-[13px] leading-relaxed text-[var(--nim-text-muted)] mb-3">
          控制每种看板类型如何与团队同步。更改将应用于所有成员。
        </p>

        {/* Info Banner */}
        <div className="flex items-start gap-2.5 p-3 bg-[rgba(96,165,250,0.08)] border border-[rgba(96,165,250,0.2)] rounded-lg mb-3">
          <MaterialSymbol icon="info" size={14} className="text-[var(--nim-primary)] shrink-0 mt-0.5" />
          <div className="text-[12px] text-[var(--nim-text-muted)] leading-relaxed">
            <strong className="text-[var(--nim-primary)] font-semibold">共享</strong>项目实时同步给所有团队成员。{' '}
            <strong className="text-[var(--nim-text-muted)] font-semibold">本地</strong>项目仅保存在你的设备上。{' '}
            <strong className="text-[#a78bfa] font-semibold">混合</strong>模式下每个项目可单独选择共享或本地。
          </div>
        </div>

        {/* Tracker Type List */}
        <div className="bg-[var(--nim-bg-secondary)] rounded-lg overflow-hidden">
          {trackers.map((tracker) => (
            <div
              key={tracker.model.type}
              className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--nim-bg)] last:border-b-0"
            >
              <TrackerIcon color={tracker.model.color} icon={tracker.model.icon} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--nim-text)] flex items-center gap-1.5">
                  {tracker.model.displayNamePlural}
                  <span className="px-1.5 py-[1px] rounded bg-[var(--nim-bg-tertiary)] text-[var(--nim-text-muted)] text-[10px] font-semibold">
                    <TrackerTypeCount type={tracker.model.type} />
                  </span>
                </div>
                <div className="text-[11px] text-[var(--nim-text-faint)]">
                  {getSyncMetaText(tracker.syncMode)}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <SyncModeToggle
                  mode={tracker.syncMode}
                  onChange={(mode) => onSyncModeChange(tracker.model.type, mode)}
                />
                {!globalRegistry.isBuiltin(tracker.model.type) && (
                  <DeleteTrackerTypeButton model={tracker.model} workspacePath={workspacePath} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inline Note */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <div className="flex items-start gap-1.5 p-2.5 bg-[var(--nim-bg-secondary)] rounded-md text-[11px] text-[var(--nim-text-faint)] leading-relaxed">
          <MaterialSymbol icon="info" size={14} className="shrink-0 mt-0.5" />
          <span>
            行内看板标记（<code className="text-[11px] text-[var(--nim-code-text)] bg-[var(--nim-code-bg)] px-1 py-[1px] rounded">#bug[...]</code>）始终为本地，不受同步策略影响。只有从面板创建的看板项目参与同步。
          </span>
        </div>
      </div>

      {/* Promote Banner */}
      <div className="provider-panel-section py-4">
        <div className="flex items-center gap-2 p-3 bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.15)] rounded-lg">
          <MaterialSymbol icon="arrow_upward" size={16} className="text-[#a78bfa] shrink-0" />
          <div className="flex-1 text-[12px] text-[var(--nim-text-muted)] leading-snug">
            <strong className="text-[#a78bfa]">将行内项目提升</strong>为看板项目即可与团队共享。右键任意行内看板标记并选择"提升为看板项目"。
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Member View
// ============================================================================

function MemberView({ trackers, workspacePath }: { trackers: TrackerTypeConfig[]; workspacePath?: string }) {
  const sharedTrackers = trackers.filter((t) => t.syncMode !== 'local');
  const localTrackers = trackers.filter((t) => t.syncMode === 'local');

  return (
    <>
      {/* Team Trackers (read-only) */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-[15px] font-semibold mb-2 text-[var(--nim-text)] flex items-center gap-2">
          团队看板
          <span className="text-[11px] font-normal text-[var(--nim-text-faint)]">由管理员管理</span>
        </h4>
        <p className="text-[13px] leading-relaxed text-[var(--nim-text-muted)] mb-3">
          这些看板类型由团队管理员配置。共享项目实时同步。
        </p>

        <div className="bg-[var(--nim-bg-secondary)] rounded-lg overflow-hidden">
          {sharedTrackers.map((tracker) => (
            <div
              key={tracker.model.type}
              className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--nim-bg)] last:border-b-0"
            >
              <TrackerIcon color={tracker.model.color} icon={tracker.model.icon} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--nim-text)]">
                  {tracker.model.displayNamePlural}
                </div>
                <div className="text-[11px] text-[var(--nim-text-faint)]">
                  <TrackerTypeCount type={tracker.model.type} /> 个项目已与团队同步
                </div>
              </div>
              <div className="shrink-0">
                <SyncBadge mode={tracker.syncMode} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Local Trackers */}
      {localTrackers.length > 0 && (
        <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
          <h4 className="provider-panel-section-title text-[15px] font-semibold mb-2 text-[var(--nim-text)] flex items-center gap-2">
            你的本地看板
            <span className="text-[11px] font-normal text-[var(--nim-text-faint)]">仅在本机</span>
          </h4>
          <p className="text-[13px] leading-relaxed text-[var(--nim-text-muted)] mb-3">
            这些看板类型仅存在于你的工作区。它们永远不会同步，团队无法看到。
          </p>

          <div className="bg-[var(--nim-bg-secondary)] rounded-lg overflow-hidden">
            {localTrackers.map((tracker) => (
              <div
                key={tracker.model.type}
                className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--nim-bg)] last:border-b-0"
              >
                <TrackerIcon color={tracker.model.color} icon={tracker.model.icon} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--nim-text)]">
                    {tracker.model.displayNamePlural}
                  </div>
                  <div className="text-[11px] text-[var(--nim-text-faint)]">
                    <TrackerTypeCount type={tracker.model.type} /> 个项目，仅本地
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <SyncBadge mode="local" />
                  {!globalRegistry.isBuiltin(tracker.model.type) && (
                    <DeleteTrackerTypeButton model={tracker.model} workspacePath={workspacePath} />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <button className="inline-flex items-center gap-1 px-2.5 py-1 bg-transparent border border-[var(--nim-border)] rounded text-[var(--nim-text-muted)] text-[11px] cursor-pointer hover:bg-[var(--nim-bg-hover)]">
              <MaterialSymbol icon="add" size={12} />
              添加自定义看板
            </button>
          </div>
        </div>
      )}

      {/* Inline Note */}
      <div className="provider-panel-section py-4">
        <div className="flex items-start gap-1.5 p-2.5 bg-[var(--nim-bg-secondary)] rounded-md text-[11px] text-[var(--nim-text-faint)] leading-relaxed">
          <MaterialSymbol icon="info" size={14} className="shrink-0 mt-0.5" />
          <span>
            文档中的行内看板标记（<code className="text-[11px] text-[var(--nim-code-text)] bg-[var(--nim-code-bg)] px-1 py-[1px] rounded">#bug[...]</code>）始终为本地。将其提升为看板项目即可与团队共享。
          </span>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// TrackerConfigPanel
// ============================================================================

export function TrackerConfigPanel({ workspacePath }: TrackerConfigPanelProps) {
  const [trackers, setTrackers] = useState<TrackerTypeConfig[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [issueKeyPrefix, setIssueKeyPrefix] = useState('NIM');
  const [isSyncConnected, setIsSyncConnected] = useState(false);
  const { confirm } = useDialog();

  useEffect(() => {
    // Load saved sync policies from workspace state, then merge with registry
    const loadPolicies = async () => {
      let savedPolicies: Record<string, TrackerSyncMode> = {};
      if (workspacePath) {
        try {
          const state = await (window as any).electronAPI.invoke('workspace:get-state', workspacePath);
          savedPolicies = state?.trackerSyncPolicies ?? {};
          if (state?.issueKeyPrefix) {
            setIssueKeyPrefix(state.issueKeyPrefix);
          }
        } catch {
          // Workspace state not available
        }

        // Check team role (per-workspace lookup)
        try {
          const teamResult = await (window as any).electronAPI.team.findForWorkspace(workspacePath);
          if (teamResult.success) {
            if (teamResult.team) {
              setIsAdmin(teamResult.team.role === 'admin');
            } else {
              // No team matched this workspace, so keep local tracker policy management available.
              setIsAdmin(true);
            }
          }
        } catch {
          // Leave admin gating closed on lookup error.
        }

        // Check if tracker sync is connected (for determining where to save prefix)
        try {
          const syncStatus = await (window as any).electronAPI.invoke('tracker-sync:get-status', { workspacePath });
          setIsSyncConnected(syncStatus?.active ?? false);
        } catch {
          // Not connected
        }
      }

      const models = globalRegistry.getAll();
      const configs: TrackerTypeConfig[] = models.map((model) => ({
        model,
        syncMode: savedPolicies[model.type] ?? model.sync?.mode ?? 'local',
      }));
      setTrackers(configs);
    };

    loadPolicies();

    // Subscribe to registry changes (e.g., custom trackers loaded later)
    const unsubscribe = globalRegistry.onChange(() => {
      const updatedModels = globalRegistry.getAll();
      setTrackers((prev) => {
        const existingModes = new Map(prev.map((t) => [t.model.type, t.syncMode]));
        return updatedModels.map((model) => ({
          model,
          syncMode: existingModes.get(model.type) ?? model.sync?.mode ?? 'local',
        }));
      });
    });

    return () => {
      unsubscribe();
    };
  }, [workspacePath]);

  // React to `tracker-sync:config-changed` events broadcast by main. The IPC
  // event is handled centrally in store/listeners/trackerSyncListeners.ts
  // which writes trackerSyncConfigChangeAtom; we apply only updates whose
  // workspacePath matches ours, skipping the initial-mount value so a stale
  // config update from before this panel opened doesn't clobber the fresh
  // value loaded from workspace state.
  const trackerSyncConfigChange = useAtomValue(trackerSyncConfigChangeAtom);
  const initialTrackerSyncConfigChangeRef = useRef(trackerSyncConfigChange);
  useEffect(() => {
    if (trackerSyncConfigChange === initialTrackerSyncConfigChangeRef.current) return;
    if (!trackerSyncConfigChange) return;
    const { workspacePath: eventPath, config } = trackerSyncConfigChange.payload;
    if (eventPath !== workspacePath || !config.issueKeyPrefix) return;
    setIssueKeyPrefix(config.issueKeyPrefix);
  }, [trackerSyncConfigChange, workspacePath]);

  const handlePrefixChange = useCallback((prefix: string) => {
    setIssueKeyPrefix(prefix);
    if (workspacePath) {
      // Always persist to workspace settings (used for local-only trackers)
      (window as any).electronAPI.invoke('workspace:update-state', workspacePath, {
        issueKeyPrefix: prefix,
      });
      // If sync is connected, also send to server
      if (isSyncConnected) {
        (window as any).electronAPI.invoke('tracker-sync:set-config', {
          workspacePath,
          key: 'issueKeyPrefix',
          value: prefix,
        });
      }
    }
  }, [workspacePath, isSyncConnected]);

  const handleSyncModeChange = useCallback(async (type: string, mode: TrackerSyncMode) => {
    const tracker = trackers.find((entry) => entry.model.type === type);
    if (!tracker || tracker.syncMode === mode) {
      return;
    }

    if (!canUpgradeTrackerMode(tracker.syncMode, mode, isAdmin)) {
      return;
    }

    if (requiresTrackerUpgradeConfirmation(tracker.syncMode, mode)) {
      const approved = await confirm(
        buildTrackerUpgradeConfirmOptions(tracker.model.displayNamePlural, mode)
      );
      if (!approved) {
        return;
      }
    }

    setTrackers((prev) =>
      prev.map((t) =>
        t.model.type === type ? { ...t, syncMode: mode } : t
      )
    );

    // Persist to workspace state
    if (workspacePath) {
      (window as any).electronAPI.invoke('workspace:update-state', workspacePath, {
        trackerSyncPolicies: { [type]: mode },
      });
    }
  }, [confirm, isAdmin, trackers, workspacePath]);

  return (
    <div className="tracker-config-panel provider-panel flex flex-col">
      {/* Header */}
      <div className="provider-panel-header mb-5 pb-4 border-b border-[var(--nim-border)]">
        <h3 className="provider-panel-title text-xl font-semibold leading-tight mb-1.5 text-[var(--nim-text)] flex items-center gap-2">
          看板
          <AlphaBadge size="sm" tooltip={SETTINGS_ALPHA_TOOLTIP} />
        </h3>
        <p className="provider-panel-description text-[13px] leading-relaxed text-[var(--nim-text-muted)]">
          {isAdmin
            ? '配置哪些看板类型与团队共享，以及管理仅限本地的看板。'
            : '查看团队共享的看板类型，管理你的本地看板。'}
        </p>
      </div>

      <TrackerStorageInfoBanner />

      <IssueKeyPrefixInput
        value={issueKeyPrefix}
        onChange={handlePrefixChange}
      />

      {isAdmin ? (
        <AdminView
          trackers={trackers}
          onSyncModeChange={handleSyncModeChange}
          workspacePath={workspacePath}
        />
      ) : (
        <MemberView trackers={trackers} workspacePath={workspacePath} />
      )}
    </div>
  );
}
