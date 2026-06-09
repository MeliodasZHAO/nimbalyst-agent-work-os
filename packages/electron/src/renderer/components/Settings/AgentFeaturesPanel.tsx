import React, { useCallback, useEffect, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { usePostHog } from 'posthog-js/react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import {
  advancedSettingsAtom,
  setAdvancedSettingsAtom,
  aiDebugSettingsAtom,
  setAIDebugSettingsAtom,
} from '../../store/atoms/appSettings';
import { autoCommitEnabledAtom, setAutoCommitEnabledAtom } from '../../store/atoms/autoCommitAtoms';
import { ALPHA_FEATURES, type AlphaFeatureTag } from '../../../shared/alphaFeatures';
import { AlphaBadge, SETTINGS_ALPHA_TOOLTIP } from '../common/AlphaBadge';
import { SettingsToggle } from '../GlobalSettings/SettingsToggle';

const AGENT_FEATURE_TAGS: AlphaFeatureTag[] = [
  'super-loops',
  'blitz',
  'meta-agent',
];

interface WorkflowSourceSettings {
  workspaceClaudeCompatibilityEnabled: boolean;
  includeProjectClaudeSources: boolean;
  includeUserClaudeSources: boolean;
  extensionWorkflowsEnabled: boolean;
}

interface WorkflowExportSettings {
  codexEnabled: boolean;
  claudeGeneratedExtensionWorkflowsEnabled: boolean;
}

export function AgentFeaturesPanel() {
  const posthog = usePostHog();
  const [settings] = useAtom(advancedSettingsAtom);
  const [, updateSettings] = useAtom(setAdvancedSettingsAtom);
  const { alphaFeatures } = settings;

  const autoCommitEnabled = useAtomValue(autoCommitEnabledAtom);
  const setAutoCommitEnabled = useSetAtom(setAutoCommitEnabledAtom);

  const [aiDebugSettings] = useAtom(aiDebugSettingsAtom);
  const [, updateAIDebugSettings] = useAtom(setAIDebugSettingsAtom);
  const { showToolCalls, chatShowToolCalls, aiDebugLogging, showPromptAdditions } = aiDebugSettings;
  const [workflowSettingsLoading, setWorkflowSettingsLoading] = useState(false);
  const [preferredAgentLanguage, setPreferredAgentLanguage] = useState<string>('');
  const [workflowSourceSettings, setWorkflowSourceSettings] = useState<WorkflowSourceSettings>({
    workspaceClaudeCompatibilityEnabled: false,
    includeProjectClaudeSources: false,
    includeUserClaudeSources: false,
    extensionWorkflowsEnabled: false,
  });
  const [workflowExportSettings, setWorkflowExportSettings] = useState<WorkflowExportSettings>({
    codexEnabled: false,
    claudeGeneratedExtensionWorkflowsEnabled: false,
  });

  const isDevelopment = import.meta.env.DEV;

  const handleAlphaToggle = (tag: AlphaFeatureTag, enabled: boolean) => {
    updateSettings({
      alphaFeatures: { ...alphaFeatures, [tag]: enabled },
    });
    posthog?.capture('alpha_feature_toggled', {
      feature_tag: tag,
      enabled,
      source: 'agent_features_panel',
    });
  };

  const features = AGENT_FEATURE_TAGS
    .map((tag) => ALPHA_FEATURES.find((f) => f.tag === tag))
    .filter((f): f is (typeof ALPHA_FEATURES)[number] => f != null);

  useEffect(() => {
    const loadAgentWorkflowSettings = async () => {
      try {
        const settings = await window.electronAPI.claudeCode.getSettings();
        const workflowSettings = await window.electronAPI.agentWorkflows.getSettings();
        setWorkflowSourceSettings({
          workspaceClaudeCompatibilityEnabled: workflowSettings.sourceSettings.workspaceClaudeCompatibilityEnabled,
          includeProjectClaudeSources: workflowSettings.sourceSettings.includeProjectClaudeSources ?? settings.projectCommandsEnabled,
          includeUserClaudeSources: workflowSettings.sourceSettings.includeUserClaudeSources ?? settings.userCommandsEnabled,
          extensionWorkflowsEnabled: workflowSettings.sourceSettings.extensionWorkflowsEnabled,
        });
        setWorkflowExportSettings(workflowSettings.exportSettings);
      } catch (err) {
        console.error('Failed to load agent workflow settings:', err);
      }
    };

    loadAgentWorkflowSettings();
  }, []);

  useEffect(() => {
    const loadPreferredAgentLanguage = async () => {
      try {
        const language = await window.electronAPI.invoke('preferred-agent-language:get');
        setPreferredAgentLanguage(typeof language === 'string' ? language : '');
      } catch (err) {
        console.error('Failed to load preferred agent language:', err);
      }
    };
    loadPreferredAgentLanguage();
  }, []);

  const handlePreferredAgentLanguageChange = useCallback(async (value: string) => {
    setPreferredAgentLanguage(value);
    try {
      await window.electronAPI.invoke('preferred-agent-language:set', value);
    } catch (err) {
      console.error('Failed to save preferred agent language:', err);
    }
  }, []);

  const handleWorkflowSourceToggle = useCallback(async (
    key: keyof WorkflowSourceSettings,
    enabled: boolean,
  ) => {
    setWorkflowSettingsLoading(true);
    try {
      const next = await window.electronAPI.agentWorkflows.setSourceSettings({ [key]: enabled });
      setWorkflowSourceSettings(next);
    } catch (err) {
      console.error('Failed to update workflow source settings:', err);
    } finally {
      setWorkflowSettingsLoading(false);
    }
  }, []);

  const handleWorkflowExportToggle = useCallback(async (
    key: keyof WorkflowExportSettings,
    enabled: boolean,
  ) => {
    setWorkflowSettingsLoading(true);
    try {
      const next = await window.electronAPI.agentWorkflows.setExportSettings({ [key]: enabled });
      setWorkflowExportSettings(next);
    } catch (err) {
      console.error('Failed to update workflow export settings:', err);
    } finally {
      setWorkflowSettingsLoading(false);
    }
  }, []);

  return (
    <div className="provider-panel flex flex-col">
      <div className="provider-panel-header mb-6 pb-4 border-b border-[var(--nim-border)]">
        <h3 className="provider-panel-title text-xl font-semibold leading-tight mb-2 text-[var(--nim-text)]">
          智能体功能
        </h3>
        <p className="provider-panel-description text-sm leading-relaxed text-[var(--nim-text-muted)]">
          控制智能体会话行为的设置。
        </p>
      </div>

      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)]">
        <SettingsToggle
          checked={autoCommitEnabled}
          onChange={(checked) => {
            setAutoCommitEnabled(checked);
            posthog?.capture('auto_commit_toggled', { enabled: checked });
          }}
          name="自动批准提交"
          description="Claude 提议 git 提交时自动批准。"
        />

        <div className="agent-preferred-language flex items-start justify-between gap-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--nim-text)] leading-tight">
              智能体首选语言
            </div>
            <div className="text-xs text-[var(--nim-text-muted)] leading-snug mt-0.5">
              AI 生成会话名称的首选语言（如 "Japanese"、"ja"、"Spanish"）。留空则让智能体根据对话内容自动选择。
            </div>
          </div>
          <input
            type="text"
            value={preferredAgentLanguage}
            onChange={(e) => handlePreferredAgentLanguageChange(e.target.value)}
            placeholder="e.g. ja"
            className="w-40 py-1.5 px-3 rounded-md text-sm bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] outline-none focus:border-[var(--nim-primary)]"
            data-testid="preferred-agent-language-input"
          />
        </div>
      </div>

      <div className="provider-panel-section">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="provider-panel-section-title text-base font-semibold text-[var(--nim-text)] m-0">实验性功能</h4>
          <AlphaBadge size="sm" tooltip={SETTINGS_ALPHA_TOOLTIP} />
        </div>

        <div className="flex items-start gap-2 p-3 mb-3 rounded border border-[var(--nim-warning)]/30 bg-[var(--nim-warning)]/10">
          <MaterialSymbol icon="science" size={16} className="text-[var(--nim-warning)] shrink-0 mt-0.5" />
          <p className="m-0 text-[13px] text-[var(--nim-text)] leading-snug">
            这些功能可能会更改、退化或被移除。部分功能需要重启后才能完全生效。
          </p>
        </div>

        <div className="mb-4 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] p-3">
          <h5 className="text-sm font-semibold mb-1.5 text-[var(--nim-text)]">
            智能体技能和命令兼容性
          </h5>
          <p className="text-xs leading-relaxed text-[var(--nim-text-muted)] mb-2">
            控制哪些命令和技能源馈送到共享选择器，以及为 Claude Code 和 Codex 生成哪些兼容性导出。
          </p>

          <div className="border-b border-[var(--nim-border)] mb-2">
            <SettingsToggle
              checked={workflowSourceSettings.workspaceClaudeCompatibilityEnabled}
              onChange={(checked) => handleWorkflowSourceToggle('workspaceClaudeCompatibilityEnabled', checked)}
              disabled={workflowSettingsLoading}
              name="工作区 Claude 兼容性"
              description="将项目和用户 .claude 命令和技能导入到共享工作流注册表。"
            />
            <SettingsToggle
              checked={workflowSourceSettings.includeProjectClaudeSources}
              onChange={(checked) => handleWorkflowSourceToggle('includeProjectClaudeSources', checked)}
              disabled={workflowSettingsLoading || !workflowSourceSettings.workspaceClaudeCompatibilityEnabled}
              name="项目 .claude 源"
              description="包含当前工作区的 .claude/commands 和 .claude/skills。"
            />
            <SettingsToggle
              checked={workflowSourceSettings.includeUserClaudeSources}
              onChange={(checked) => handleWorkflowSourceToggle('includeUserClaudeSources', checked)}
              disabled={workflowSettingsLoading || !workflowSourceSettings.workspaceClaudeCompatibilityEnabled}
              name="用户 .claude 源"
              description="在选择器和导出中包含 ~/.claude 命令和技能，以实现用户级兼容性。"
            />
            <SettingsToggle
              checked={workflowSourceSettings.extensionWorkflowsEnabled}
              onChange={(checked) => handleWorkflowSourceToggle('extensionWorkflowsEnabled', checked)}
              disabled={workflowSettingsLoading}
              name="扩展工作流"
              description="从已启用的扩展加载供应商中立的 agentWorkflows 贡献和旧版 Claude 插件工作流。"
            />
          </div>

          <div>
            <SettingsToggle
              checked={workflowExportSettings.codexEnabled}
              onChange={(checked) => handleWorkflowExportToggle('codexEnabled', checked)}
              disabled={workflowSettingsLoading}
              name="Codex 生成的技能"
              description="在 Codex 轮次前将注册表工作流导出到 .agents/skills/.nimbalyst-generated。"
            />
            <SettingsToggle
              checked={workflowExportSettings.claudeGeneratedExtensionWorkflowsEnabled}
              onChange={(checked) => handleWorkflowExportToggle('claudeGeneratedExtensionWorkflowsEnabled', checked)}
              disabled={workflowSettingsLoading}
              name="Claude 生成的扩展工作流"
              description="为扩展 agentWorkflows 在 .claude/plugins/.nimbalyst-generated 下生成 Claude 插件垫片。"
            />
          </div>
        </div>

        {features.map((feature) => (
          <SettingsToggle
            key={feature.tag}
            checked={alphaFeatures[feature.tag] ?? false}
            onChange={(checked) => handleAlphaToggle(feature.tag, checked)}
            name={feature.name}
            description={feature.description}
          />
        ))}

        <SettingsToggle
          checked={chatShowToolCalls}
          onChange={(checked) => updateAIDebugSettings({ chatShowToolCalls: checked })}
          name="在聊天中显示工具调用"
          description="在 AI 聊天视图中显示工具调用行。关闭后将隐藏工具活动，仅显示对话消息。"
        />
      </div>

      {isDevelopment && (
        <div className="provider-panel-section py-4 mt-4 border-t border-[var(--nim-border)]">
          <h4 className="provider-panel-section-title text-base font-semibold mb-2 text-[var(--nim-text)]">开发者选项</h4>
          <p className="text-sm leading-relaxed text-[var(--nim-text-muted)] mb-2">
            仅在开发模式下可用。
          </p>

          <SettingsToggle
            checked={showToolCalls}
            onChange={(checked) => updateAIDebugSettings({ showToolCalls: checked })}
            name="显示所有工具调用"
            description="在 AI 聊天侧栏中显示所有 MCP 工具调用，包括 Edit/applyDiff 调用。"
          />

          <SettingsToggle
            checked={aiDebugLogging}
            onChange={(checked) => updateAIDebugSettings({ aiDebugLogging: checked })}
            name="AI 调试日志"
            description="捕获所有 AI 编辑操作的详细日志，包括 LLM 请求/响应。"
          />

          <SettingsToggle
            checked={showPromptAdditions}
            onChange={(checked) => updateAIDebugSettings({ showPromptAdditions: checked })}
            name="显示提示词附加内容"
            description="显示 Nimbalyst 附加到 Claude Code 请求中的系统提示词附加内容和上下文。"
          />
        </div>
      )}
    </div>
  );
}
