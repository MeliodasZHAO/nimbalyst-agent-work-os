import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import {
  DEFAULT_AGENT_WORK_OS_CONFIG,
  AGENT_WORK_OS_CONCRETE_PROVIDERS,
  AGENT_WORK_OS_PROVIDER_CAPABILITIES,
  getModelOptionsForProviderChoice,
  getReasoningLevelsForProviderChoice,
  normalizeModelForProviderChoice,
  normalizeReasoningForProviderChoice,
  normalizeAgentWorkOSConfig,
  validateAgentWorkOSConfig,
  type AgentWorkOSConfig,
  type AgentWorkOSControlMode,
  type AgentWorkOSCollaborationMode,
  type AgentWorkOSMobilePolicyMode,
  type AgentWorkOSReasoningLevel,
  type AgentWorkOSAgentRole,
  type WorkPacketRecommendedAgent,
} from '@nimbalyst/runtime/agent-work-os';
import { MaterialSymbol } from '@nimbalyst/runtime';
import type { SettingsScope } from './SettingsView';
import { SettingsToggle, ToggleSwitch } from '../GlobalSettings/SettingsToggle';
import {
  aiProviderSettingsAtom,
  setAIProviderSettingsAtom,
  flushPendingAIProviderPersist,
} from '../../store/atoms/appSettings';

interface AgentWorkOSPanelProps {
  scope: SettingsScope;
  workspacePath?: string;
  workspaceName?: string;
}

type EditorMode = 'visual' | 'json';

const AGENT_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'codex', label: 'Codex' },
  { value: 'claude-code', label: 'Claude 智能体' },
  { value: 'mixed', label: '混合智能体' },
  { value: 'research-only', label: '仅研究' },
] as const;

const PROVIDER_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'codex', label: 'Codex' },
  { value: 'claude-code', label: 'Claude 智能体' },
  { value: 'mixed', label: '混合智能体' },
  { value: 'research-only', label: '仅研究' },
] as const;

const ROLE_OPTIONS: Array<{ value: AgentWorkOSAgentRole; label: string }> = [
  { value: 'planner', label: '规划者' },
  { value: 'implementer', label: '实现者' },
  { value: 'reviewer', label: '审查者' },
  { value: 'verifier', label: '验证者' },
  { value: 'frontend-inspector', label: '前端检查员' },
  { value: 'researcher', label: '研究员' },
];

const CONTROL_MODES: Array<{ value: AgentWorkOSControlMode; label: string }> = [
  { value: 'manual', label: '手动' },
  { value: 'assisted', label: '辅助' },
  { value: 'autopilot', label: '自动驾驶' },
];

const REASONING_LEVELS: Array<{ value: AgentWorkOSReasoningLevel; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'max', label: '最高' },
];

const REASONING_LABELS = new Map(REASONING_LEVELS.map(option => [option.value, option.label]));

const COLLABORATION_MODES: Array<{ value: AgentWorkOSCollaborationMode; label: string }> = [
  { value: 'solo', label: '单独' },
  { value: 'plan-implement', label: '规划 + 实现' },
  { value: 'implement-review', label: '实现 + 审查' },
  { value: 'frontend-repair', label: '前端修复' },
  { value: 'risky-change', label: '高风险变更' },
  { value: 'research-only', label: '仅研究' },
];

const MOBILE_POLICY_MODES: Array<{ value: AgentWorkOSMobilePolicyMode; label: string }> = [
  { value: 'strict', label: '严格' },
  { value: 'balanced', label: '平衡' },
  { value: 'flexible', label: '灵活' },
  { value: 'custom', label: '自定义' },
];

function SelectRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="agent-work-os-select-row flex items-start justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--nim-text)] leading-tight">{label}</span>
        <span className="block text-xs text-[var(--nim-text-muted)] leading-snug mt-0.5">{description}</span>
      </span>
      <select
        className="w-44 py-1.5 px-2 rounded-md text-sm bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] outline-none focus:border-[var(--nim-primary)]"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function providerLabel(provider: string): string {
  const capability = AGENT_WORK_OS_PROVIDER_CAPABILITIES[provider as keyof typeof AGENT_WORK_OS_PROVIDER_CAPABILITIES];
  if (capability) return capability.label;
  switch (provider) {
    case 'claude-code': return 'Claude 智能体';
    case 'openai-codex': return 'OpenAI Codex';
    case 'openai-codex-acp': return 'Codex ACP';
    case 'opencode': return 'OpenCode';
    case 'copilot-cli': return 'GitHub Copilot';
    default: return provider;
  }
}

export function AgentWorkOSPanel({ scope, workspacePath, workspaceName }: AgentWorkOSPanelProps) {
  const [aiProviderSettings] = useAtom(aiProviderSettingsAtom);
  const [, setAIProviderSettings] = useAtom(setAIProviderSettingsAtom);
  const [config, setConfig] = useState<AgentWorkOSConfig>(DEFAULT_AGENT_WORK_OS_CONFIG);
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [jsonDraft, setJsonDraft] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'saved' | 'error'>('loading');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const storageLabel = scope === 'project' && workspaceName
    ? `${workspaceName} 项目`
    : '所有项目';

  const loadConfig = useCallback(async () => {
    setStatus('loading');
    try {
      let loaded: unknown;
      if (scope === 'project' && workspacePath) {
        const workspaceState = await window.electronAPI.invoke('workspace:get-state', workspacePath);
        loaded = workspaceState?.agentWorkOSConfig;
      } else {
        loaded = await window.electronAPI.invoke('app-settings:get', 'agentWorkOSConfig');
      }
      const normalized = normalizeAgentWorkOSConfig(loaded);
      setConfig(normalized);
      setJsonDraft(JSON.stringify(normalized, null, 2));
      setValidationErrors([]);
      setStatus('idle');
    } catch (error) {
      console.error('[AgentWorkOSPanel] Failed to load settings:', error);
      setStatus('error');
    }
  }, [scope, workspacePath]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = useCallback(async (nextConfig: AgentWorkOSConfig) => {
    const validation = validateAgentWorkOSConfig(nextConfig);
    if (!validation.valid || !validation.normalized) {
      setValidationErrors(validation.errors);
      setStatus('error');
      return;
    }

    try {
      if (scope === 'project' && workspacePath) {
        await window.electronAPI.invoke('workspace:update-state', workspacePath, {
          agentWorkOSConfig: validation.normalized,
        });
        await window.electronAPI.invoke('agent-work-os:sync-project-config', workspacePath);
      } else {
        await window.electronAPI.invoke('app-settings:set', 'agentWorkOSConfig', validation.normalized);
      }
      setConfig(validation.normalized);
      setJsonDraft(JSON.stringify(validation.normalized, null, 2));
      setValidationErrors([]);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1600);
    } catch (error) {
      console.error('[AgentWorkOSPanel] Failed to save settings:', error);
      setStatus('error');
    }
  }, [scope, workspacePath]);

  const updateConfig = useCallback((updater: (current: AgentWorkOSConfig) => AgentWorkOSConfig) => {
    const next = updater(config);
    void saveConfig(next);
  }, [config, saveConfig]);

  const validateJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonDraft);
      const validation = validateAgentWorkOSConfig(parsed);
      setValidationErrors(validation.errors);
      if (validation.valid && validation.normalized) {
        setConfig(validation.normalized);
      }
      return validation;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON';
      setValidationErrors([message]);
      return { valid: false, errors: [message] };
    }
  }, [jsonDraft]);

  const saveJson = useCallback(() => {
    const validation = validateJson();
    if (validation.valid && validation.normalized) {
      void saveConfig(validation.normalized);
    }
  }, [saveConfig, validateJson]);

  const agentProviderStatus = useMemo(() => {
    return AGENT_WORK_OS_CONCRETE_PROVIDERS
      .map((provider) => ({
        provider,
        enabled: aiProviderSettings.providers[provider]?.enabled === true,
        testStatus: aiProviderSettings.providers[provider]?.testStatus ?? 'idle',
        testMessage: aiProviderSettings.providers[provider]?.testMessage,
      }));
  }, [aiProviderSettings.providers]);

  const handleTestProvider = useCallback(async (provider: string) => {
    setTestingProvider(provider);
    setAIProviderSettings({
      providers: {
        [provider]: {
          ...aiProviderSettings.providers[provider],
          testStatus: 'testing',
          testMessage: undefined,
        },
      },
    });
    await flushPendingAIProviderPersist();

    try {
      const result = await window.electronAPI.aiTestConnection(provider, workspacePath);
      setAIProviderSettings({
        providers: {
          [provider]: {
            ...aiProviderSettings.providers[provider],
            testStatus: result.success ? 'success' : 'error',
            testMessage: result.success ? '已连接' : result.error,
          },
        },
      });
      if (result.success) {
        const response = await window.electronAPI.aiGetAllModels();
        if (response.success && response.grouped) {
          setAIProviderSettings({ availableModels: response.grouped });
        }
      }
    } catch (error) {
      setAIProviderSettings({
        providers: {
          [provider]: {
            ...aiProviderSettings.providers[provider],
            testStatus: 'error',
            testMessage: error instanceof Error ? error.message : '连接失败',
          },
        },
      });
    } finally {
      setTestingProvider(null);
    }
  }, [aiProviderSettings, setAIProviderSettings, workspacePath]);

  return (
    <div className="agent-work-os-panel provider-panel flex flex-col">
      <div className="provider-panel-header mb-6 pb-4 border-b border-[var(--nim-border)]">
        <h3 className="provider-panel-title text-xl font-semibold leading-tight mb-2 text-[var(--nim-text)]">
          智能体工作系统
        </h3>
        <p className="provider-panel-description text-sm leading-relaxed text-[var(--nim-text-muted)]">
          配置默认的智能体路由、Work Packet 自动化、移动端审批和多智能体协作，适用于 {storageLabel}。
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex bg-[var(--nim-bg-tertiary)] p-1 rounded-lg">
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${editorMode === 'visual' ? 'bg-[var(--nim-primary)] text-white' : 'text-[var(--nim-text-muted)] hover:text-[var(--nim-text)]'}`}
            onClick={() => setEditorMode('visual')}
          >
            可视化
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${editorMode === 'json' ? 'bg-[var(--nim-primary)] text-white' : 'text-[var(--nim-text-muted)] hover:text-[var(--nim-text)]'}`}
            onClick={() => setEditorMode('json')}
          >
            JSON
          </button>
        </div>
      </div>

      {editorMode === 'visual' ? (
        <div className="space-y-4">
        <div className="rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] p-4">
          <SelectRow
            label="控制模式"
            description="Nimbalyst 默认管理多少路由。"
            value={config.automation.controlMode}
            options={CONTROL_MODES}
            onChange={(value) => updateConfig((current) => ({
              ...current,
              automation: { ...current.automation, controlMode: value },
            }))}
          />
          <SelectRow
            label="默认智能体"
            description="自动从已配置的智能体供应商中为每个 Packet 选择。"
            value={config.automation.defaultAgent}
            options={[...AGENT_OPTIONS]}
            onChange={(value) => updateConfig((current) => ({
              ...current,
              automation: { ...current.automation, defaultAgent: value },
            }))}
          />
          <SelectRow
            label="默认能力路由"
            description="手动模式保持 Packet 路由显式指定；辅助/自动驾驶模式可在 Packet 设为自动时提供此路由。"
            value={config.automation.defaultCapabilityRoute}
            options={[
              { value: 'auto', label: '自动' },
              { value: 'default', label: '默认' },
              { value: 'plan-first', label: '优先规划' },
              { value: 'pursue-goal', label: '追求目标' },
              { value: 'high-reasoning', label: '高推理' },
              { value: 'second-agent-review', label: '二次智能体审查' },
            ]}
            onChange={(value) => updateConfig((current) => ({
              ...current,
              automation: { ...current.automation, defaultCapabilityRoute: value },
            }))}
          />
          <SelectRow
            label="默认推理级别"
            description="当选定的智能体支持时，用作会话的推理力度级别。"
            value={config.automation.defaultReasoning}
            options={REASONING_LEVELS}
            onChange={(value) => updateConfig((current) => ({
              ...current,
              automation: { ...current.automation, defaultReasoning: value },
            }))}
          />
          <SelectRow
            label="协作模式"
            description="新 Work Packet 的默认多智能体协作模式。"
            value={config.automation.defaultCollaborationMode}
            options={COLLABORATION_MODES}
            onChange={(value) => updateConfig((current) => ({
              ...current,
              automation: { ...current.automation, defaultCollaborationMode: value },
            }))}
          />
        </div>

        <div className="rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h4 className="text-sm font-semibold text-[var(--nim-text)]">智能体供应商</h4>
              <p className="text-xs text-[var(--nim-text-muted)] mt-0.5">
                智能体工作系统仅路由到此处或供应商面板中已启用的供应商。
              </p>
            </div>
            <MaterialSymbol icon="cable" size={18} className="text-[var(--nim-text-muted)]" />
          </div>
          <div className="space-y-2">
            {agentProviderStatus.map((item) => (
              <div key={item.provider} className="flex items-center gap-3 py-2 border-t border-[var(--nim-border)] first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[var(--nim-text)]">{providerLabel(item.provider)}</div>
                  <div className="text-xs text-[var(--nim-text-muted)]">
                    {item.enabled ? `已启用, ${item.testStatus}` : '已禁用'}
                    {item.testMessage ? ` - ${item.testMessage}` : ''}
                  </div>
                </div>
                <ToggleSwitch
                  checked={item.enabled}
                  onChange={(checked) => setAIProviderSettings({
                    providers: {
                      [item.provider]: {
                        ...aiProviderSettings.providers[item.provider],
                        enabled: checked,
                      },
                    },
                  })}
                />
                <button
                  className="px-3 py-1.5 rounded-md text-xs border border-[var(--nim-border)] text-[var(--nim-text)] bg-[var(--nim-bg)] hover:bg-[var(--nim-bg-hover)] disabled:opacity-50"
                  disabled={!item.enabled || testingProvider === item.provider}
                  onClick={() => void handleTestProvider(item.provider)}
                >
                  {testingProvider === item.provider ? '测试中...' : '测试'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] p-4">
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-[var(--nim-text)]">角色默认设置</h4>
            <p className="text-xs text-[var(--nim-text-muted)] mt-0.5">
              这些选项驱动规划者、实现者、审查者、验证者、前端修复和研究的分配。
            </p>
          </div>
          <div className="space-y-3">
            {ROLE_OPTIONS.map((role) => {
              const preference = config.providerPreferences[role.value] ?? { provider: 'auto', model: 'auto', reasoning: 'auto' };
              const roleModelOptions = getModelOptionsForProviderChoice(
                preference.provider,
                aiProviderSettings.availableModels,
              );
              const roleReasoningOptions = getReasoningLevelsForProviderChoice(preference.provider)
                .map((level) => ({
                  value: level,
                  label: REASONING_LABELS.get(level) ?? level,
                }));
              const selectedModel = normalizeModelForProviderChoice(
                preference.provider,
                preference.model,
                aiProviderSettings.availableModels,
              );
              const selectedReasoning = normalizeReasoningForProviderChoice(
                preference.provider,
                preference.reasoning,
              );
              return (
                <div key={role.value} className="grid grid-cols-[minmax(110px,1fr)_150px_minmax(180px,1.4fr)_120px] gap-2 items-center">
                  <div className="text-sm text-[var(--nim-text)]">{role.label}</div>
                  <select
                    className="py-1.5 px-2 rounded-md text-sm bg-[var(--nim-bg)] border border-[var(--nim-border)] text-[var(--nim-text)]"
                    value={preference.provider}
                    onChange={(event) => updateConfig((current) => ({
                      ...current,
                      providerPreferences: {
                        ...current.providerPreferences,
                        [role.value]: {
                          ...preference,
                          provider: event.target.value as WorkPacketRecommendedAgent | 'auto',
                          model: normalizeModelForProviderChoice(
                            event.target.value as WorkPacketRecommendedAgent | 'auto',
                            preference.model,
                            aiProviderSettings.availableModels,
                          ),
                          reasoning: normalizeReasoningForProviderChoice(
                            event.target.value as WorkPacketRecommendedAgent | 'auto',
                            preference.reasoning,
                          ),
                        },
                      },
                    }))}
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select
                    className="py-1.5 px-2 rounded-md text-sm bg-[var(--nim-bg)] border border-[var(--nim-border)] text-[var(--nim-text)]"
                    value={selectedModel}
                    onChange={(event) => updateConfig((current) => ({
                      ...current,
                      providerPreferences: {
                        ...current.providerPreferences,
                        [role.value]: {
                          ...preference,
                          model: event.target.value,
                        },
                      },
                    }))}
                  >
                    {roleModelOptions.map((model) => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                  <select
                    className="py-1.5 px-2 rounded-md text-sm bg-[var(--nim-bg)] border border-[var(--nim-border)] text-[var(--nim-text)]"
                    value={selectedReasoning}
                    onChange={(event) => updateConfig((current) => ({
                      ...current,
                      providerPreferences: {
                        ...current.providerPreferences,
                        [role.value]: {
                          ...preference,
                          reasoning: event.target.value as AgentWorkOSReasoningLevel,
                        },
                      },
                    }))}
                  >
                    {roleReasoningOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {(selectedModel !== preference.model || selectedReasoning !== preference.reasoning) && (
                    <div className="col-start-2 col-span-3 text-[11px] text-[var(--nim-text-muted)]">
                      已保存的值超出当前供应商的能力范围，在重新保存前将被视为自动。
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] p-4">
          <SelectRow
            label="移动端权限策略"
            description="桌面端运行时，Android 端拥有多大的审批权限。"
            value={config.mobilePermissions.mode}
            options={MOBILE_POLICY_MODES}
            onChange={(value) => updateConfig((current) => ({
              ...current,
              mobilePermissions: { ...current.mobilePermissions, mode: value },
            }))}
          />
          <SettingsToggle
            checked={config.automation.preferWorktreesForMediumRisk}
            onChange={(checked) => updateConfig((current) => ({
              ...current,
              automation: { ...current.automation, preferWorktreesForMediumRisk: checked },
            }))}
            name="中等风险任务优先使用 Worktree"
            description="为中等、大型、高风险或并行的 Work Packet 启动隔离的 Worktree 会话。"
          />
          <SettingsToggle
            checked={config.automation.requireFrontendVisualEvidence}
            onChange={(checked) => updateConfig((current) => ({
              ...current,
              automation: { ...current.automation, requireFrontendVisualEvidence: checked },
            }))}
            name="要求前端视觉验证"
            description="前端 Work Packet 在验证前应收集截图、DOM 观测或浏览器自动化证据。"
          />
          <SettingsToggle
            checked={config.automation.allowAgentToUpdateWorkPackets}
            onChange={(checked) => updateConfig((current) => ({
              ...current,
              automation: { ...current.automation, allowAgentToUpdateWorkPackets: checked },
            }))}
            name="允许智能体更新 Work Packet"
            description="智能体可以在任务事实变化时提议或填写非审批类证据字段。"
          />
        </div>
        </div>
      ) : (
        <div className="rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] p-4">
          <textarea
            className="w-full min-h-[360px] font-mono text-xs leading-relaxed rounded-md border border-[var(--nim-border)] bg-[var(--nim-bg)] text-[var(--nim-text)] p-3 outline-none focus:border-[var(--nim-primary)]"
            value={jsonDraft}
            spellCheck={false}
            onChange={(event) => setJsonDraft(event.target.value)}
          />
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              className="px-3 py-1.5 rounded-md text-sm border border-[var(--nim-border)] text-[var(--nim-text)] bg-[var(--nim-bg-tertiary)] hover:bg-[var(--nim-bg-hover)]"
              onClick={validateJson}
            >
              验证
            </button>
            <button
              className="px-3 py-1.5 rounded-md text-sm border border-[var(--nim-primary)] text-white bg-[var(--nim-primary)] hover:opacity-90"
              onClick={saveJson}
            >
              保存 JSON
            </button>
          </div>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="mt-4 rounded border border-[var(--nim-error)]/40 bg-[var(--nim-error)]/10 p-3 text-sm text-[var(--nim-text)]">
          <div className="font-medium mb-1">配置需要注意</div>
          {validationErrors.map((error) => (
            <div key={error} className="text-xs text-[var(--nim-text-muted)]">{error}</div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-[var(--nim-text-muted)]">
        {status === 'loading' && '加载中...'}
        {status === 'saved' && '已保存'}
        {status === 'error' && validationErrors.length === 0 && '无法保存设置'}
      </div>
    </div>
  );
}
