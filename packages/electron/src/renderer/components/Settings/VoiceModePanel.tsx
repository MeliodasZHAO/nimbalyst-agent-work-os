/**
 * Voice Mode Settings Panel
 *
 * Self-contained component that subscribes directly to Jotai atoms.
 * No props needed - settings are read from and written to atoms.
 */

import React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { ModelIdentifier } from '@nimbalyst/runtime/ai/server/types';
import {
  voiceModeSettingsAtom,
  setVoiceModeSettingsAtom,
  apiKeysAtom,
  setApiKeyAtom,
  defaultAgentModelAtom,
  type VoiceModeSettings,
  type VoiceId,
  type TurnDetectionConfig,
  type SystemPromptConfig,
} from '../../store/atoms/appSettings';
import { voiceModePreviewAudioAtom } from '../../store/atoms/voiceModeState';
import { addSessionFullAtom, setSelectedWorkstreamAtom, setWindowModeAtom, navigateToSettingsAtom } from '../../store';
import { useDialog } from '../../contexts/DialogContext';
import { AlphaBadge, SETTINGS_ALPHA_TOOLTIP } from '../common/AlphaBadge';
import { buildVoiceProjectSummaryPrompt, VOICE_PROJECT_SUMMARY_PATH } from './voiceModeSummaryPrompt';
import type { SessionCreateResult } from '../../../shared/ipc/types';

interface VoiceModePanelProps {
  /** Optional workspace path for project-specific features like summary generation */
  workspacePath?: string;
}

// Default turn detection config
const DEFAULT_TURN_DETECTION: TurnDetectionConfig = {
  mode: 'server_vad',
  vadThreshold: 0.5,
  silenceDuration: 500,
  interruptible: true,
};

// Available OpenAI Realtime API voices with descriptions
// Some voices are Realtime-only and use approximations for TTS preview
// Gender categorization based on OpenAI documentation and community observations
const VOICE_OPTIONS: Array<{
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
  realtimeOnly?: boolean; // If true, preview uses a similar voice approximation
}> = [
  // Male voices
  { id: 'ash', name: 'Ash', description: '清晰自信', gender: 'male' },
  { id: 'echo', name: 'Echo', description: '流畅有磁性', gender: 'male' },
  { id: 'verse', name: 'Verse', description: '生动有感染力', gender: 'male', realtimeOnly: true },
  { id: 'cedar', name: 'Cedar', description: '低沉有权威感', gender: 'male', realtimeOnly: true },
  // Female voices
  { id: 'coral', name: 'Coral', description: '温暖友好', gender: 'female' },
  { id: 'sage', name: 'Sage', description: '沉稳温和', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', description: '明亮欢快', gender: 'female' },
  { id: 'ballad', name: 'Ballad', description: '富有表现力', gender: 'female', realtimeOnly: true },
  { id: 'marin', name: 'Marin', description: '自然对话式', gender: 'female', realtimeOnly: true },
  // Neutral voices
  { id: 'alloy', name: 'Alloy', description: '均衡多面', gender: 'neutral' },
];

// Group voices by gender for the dropdown
const VOICE_GROUPS = [
  { label: '男声', voices: VOICE_OPTIONS.filter(v => v.gender === 'male') },
  { label: '女声', voices: VOICE_OPTIONS.filter(v => v.gender === 'female') },
  { label: '中性', voices: VOICE_OPTIONS.filter(v => v.gender === 'neutral') },
];

type MicAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

export const VoiceModePanel: React.FC<VoiceModePanelProps> = ({
  workspacePath,
}) => {
  // Subscribe to atoms directly - no props needed
  const [voiceModeSettings] = useAtom(voiceModeSettingsAtom);
  const [, updateVoiceModeSettings] = useAtom(setVoiceModeSettingsAtom);
  const apiKeys = useAtomValue(apiKeysAtom);
  const [, setApiKey] = useAtom(setApiKeyAtom);
  const defaultAgentModel = useAtomValue(defaultAgentModelAtom);
  const addSession = useSetAtom(addSessionFullAtom);
  const setSelectedWorkstream = useSetAtom(setSelectedWorkstreamAtom);
  const setWindowMode = useSetAtom(setWindowModeAtom);
  const navigateToSettings = useSetAtom(navigateToSettingsAtom);
  const dialog = useDialog();
  const hasAgentConfigured = !!defaultAgentModel?.trim();

  // Extract values from atom
  const {
    enabled,
    voice,
    turnDetection,
    voiceAgentPrompt,
    codingAgentPrompt,
    submitDelayMs,
    listenWindowMs,
  } = voiceModeSettings;

  // Check if OpenAI key is configured
  const hasOpenAIKey = !!apiKeys.openai;

  // Handler to update any voice mode setting
  const handleSettingChange = React.useCallback((updates: Partial<VoiceModeSettings>) => {
    updateVoiceModeSettings(updates);
  }, [updateVoiceModeSettings]);

  const [showVoiceAgentPrompt, setShowVoiceAgentPrompt] = React.useState(false);
  const [showCodingAgentPrompt, setShowCodingAgentPrompt] = React.useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Project summary state. Generation now happens inside an agent session, so
  // there's no in-panel spinner -- we only track whether the file exists on
  // disk and surface failure messages from the launch path.
  const [projectSummaryExists, setProjectSummaryExists] = React.useState<boolean | null>(null);
  const [summaryError, setSummaryError] = React.useState<string | null>(null);
  const [summaryPath, setSummaryPath] = React.useState<string | null>(null);

  // Microphone access state. Only populated while voice mode is enabled --
  // we don't probe the OS at all when voice is off, so a user who never opts
  // in never has the mic permission concept surfaced.
  const [micStatus, setMicStatus] = React.useState<MicAccessStatus | null>(null);
  const [micPlatform, setMicPlatform] = React.useState<NodeJS.Platform | null>(null);

  const checkMicStatus = React.useCallback(async () => {
    try {
      const result = await window.electronAPI?.invoke('voice-mode:get-mic-status') as
        | { status: MicAccessStatus; platform: NodeJS.Platform }
        | undefined;
      if (result) {
        setMicStatus(result.status);
        setMicPlatform(result.platform);
      }
    } catch {
      setMicStatus(null);
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      setMicStatus(null);
      return;
    }
    checkMicStatus();
  }, [enabled, checkMicStatus]);

  const handleOpenMicSettings = async () => {
    await window.electronAPI?.invoke('voice-mode:open-mic-settings');
  };

  // Check if project summary exists
  React.useEffect(() => {
    if (!workspacePath) {
      setProjectSummaryExists(null);
      return;
    }

    const checkSummary = async () => {
      try {
        const path = `${workspacePath}/${VOICE_PROJECT_SUMMARY_PATH}`;
        const exists = await window.electronAPI?.invoke('file:exists', path);
        setProjectSummaryExists(exists);
        if (exists) {
          setSummaryPath(path);
        }
      } catch {
        setProjectSummaryExists(false);
      }
    };

    checkSummary();
  }, [workspacePath]);

  // Launch an agent session that generates the voice-mode project summary.
  // The agent reads project files itself and writes the summary to
  // nimbalyst-local/voice-project-summary.md via its Write tool. Voice mode
  // picks up the file on next session start (see VoiceModeService.ts loadSessionContext).
  const handleGenerateSummary = async () => {
    if (!workspacePath || !window.electronAPI) return;
    if (!hasAgentConfigured) return;

    setSummaryError(null);

    const parsed = ModelIdentifier.tryParse(defaultAgentModel);
    const provider = parsed?.provider || 'claude-code';

    const confirmed = await dialog.confirm({
      title: '生成项目摘要？',
      message:
        `这将使用 ${defaultAgentModel} 启动一个新的 AI 会话。` +
        `该会话将读取你的项目文件并生成一份语音友好的摘要，保存到 ${VOICE_PROJECT_SUMMARY_PATH}，` +
        `供语音模式使用。你将被带到该会话以便实时查看进度。`,
      confirmLabel: '启动会话',
      cancelLabel: '取消',
    });
    if (!confirmed) return;

    try {
      const sessionId = crypto.randomUUID();
      const title = '语音模式：项目摘要';
      const result: SessionCreateResult = await window.electronAPI.invoke('sessions:create', {
        session: {
          id: sessionId,
          provider,
          model: defaultAgentModel,
          title,
        },
        workspaceId: workspacePath,
      });

      if (!result?.success || !result.id) {
        setSummaryError(result?.error || '创建 Agent 会话失败');
        return;
      }

      addSession({
        id: result.id,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        provider,
        model: defaultAgentModel,
        sessionType: 'session',
        messageCount: 0,
        workspaceId: workspacePath,
        isArchived: false,
        isPinned: false,
        parentSessionId: null,
        worktreeId: null,
        childCount: 0,
        uncommittedCount: 0,
      });

      // Send the first message -- this kicks off agent execution.
      await window.electronAPI.invoke(
        'ai:sendMessage',
        buildVoiceProjectSummaryPrompt(),
        undefined,
        result.id,
        workspacePath,
      );

      // Switch to Agent mode and select the new session so the user can watch it run.
      // Switching modes implicitly unmounts the Settings view -- no explicit close needed.
      setWindowMode('agent');
      setSelectedWorkstream({
        workspacePath,
        selection: { type: 'session', id: result.id },
      });
    } catch (error) {
      console.error('[VoiceModePanel] Failed to launch summary session:', error);
      setSummaryError(error instanceof Error ? error.message : '启动摘要会话失败');
    }
  };

  // Open summary file in editor
  const handleOpenSummary = async () => {
    if (summaryPath && workspacePath) {
      await window.electronAPI?.invoke('workspace:open-file', { workspacePath, filePath: summaryPath });
    }
  };

  // Toggle voice mode. We no longer auto-launch a summary session here --
  // generating the summary spawns a visible agent session that costs tokens,
  // so it must be an explicit user action.
  const handleEnabledChange = (newEnabled: boolean) => {
    handleSettingChange({ enabled: newEnabled });
  };

  // Listen for preview audio from main process
  // Stop any playing audio on unmount.
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Play preview audio when main process broadcasts a `voice-mode:preview-audio`
  // event. The IPC event is handled centrally in
  // store/listeners/voiceModeListeners.ts which writes voiceModePreviewAudioAtom;
  // we play only on *new* bumps so any audio that was queued up before this
  // panel mounted doesn't replay on open.
  const previewAudio = useAtomValue(voiceModePreviewAudioAtom);
  const initialPreviewAudioRef = React.useRef(previewAudio);
  React.useEffect(() => {
    if (previewAudio === initialPreviewAudioRef.current) return;
    if (!previewAudio) return;
    const { audioBase64, format } = previewAudio.payload;
    const audio = new Audio(`data:audio/${format};base64,${audioBase64}`);
    audioRef.current = audio;
    setIsPreviewPlaying(true);

    audio.onended = () => {
      setIsPreviewPlaying(false);
      audioRef.current = null;
    };

    audio.onerror = () => {
      setIsPreviewPlaying(false);
      audioRef.current = null;
    };

    audio.play().catch(() => {
      setIsPreviewPlaying(false);
      audioRef.current = null;
    });
  }, [previewAudio]);

  // Use defaults for turn detection
  const currentTurnDetection = { ...DEFAULT_TURN_DETECTION, ...turnDetection };

  const handleTurnDetectionChange = (updates: Partial<TurnDetectionConfig>) => {
    handleSettingChange({ turnDetection: { ...currentTurnDetection, ...updates } });
  };

  const handlePreviewVoice = async () => {
    if (isPreviewPlaying) {
      // Stop current preview
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsPreviewPlaying(false);
      return;
    }

    setIsPreviewPlaying(true);
    try {
      const result = await window.electronAPI?.invoke('voice-mode:preview-voice', voice);
      if (!result?.success) {
        console.error('[VoiceModePanel] Preview failed:', result?.message);
        setIsPreviewPlaying(false);
      }
      // Audio will be received via IPC and played automatically
    } catch (error) {
      console.error('[VoiceModePanel] Preview error:', error);
      setIsPreviewPlaying(false);
    }
  };
  return (
    <div className="provider-panel flex flex-col">
      <div className="provider-panel-header mb-6 pb-4 border-b border-[var(--nim-border)]">
        <h3 className="provider-panel-title text-xl font-semibold leading-tight mb-2 text-[var(--nim-text)] flex items-center gap-2">
          语音模式
          <AlphaBadge size="sm" tooltip={SETTINGS_ALPHA_TOOLTIP} />
        </h3>
        <p className="provider-panel-description text-sm leading-relaxed text-[var(--nim-text-muted)]">
          使用 OpenAI 高级语音模式通过语音控制 Claude Code。
          自然地说出指令，并接收语音回复。
        </p>
      </div>

      <div className="provider-panel-section mb-6">
        <h4 className="provider-panel-section-title text-base font-medium mb-4 text-[var(--nim-text)]">启用语音模式</h4>

        <div className="setting-item py-3 mb-3">
          <div className="setting-text flex flex-col gap-0.5">
            <span className="setting-name text-sm font-medium text-[var(--nim-text)]">OpenAI API 密钥</span>
            <span className="setting-description text-xs text-[var(--nim-text-muted)]">
              语音模式必需。从 platform.openai.com 获取。
            </span>
          </div>
          <input
            type="password"
            value={apiKeys.openai || ''}
            onChange={(e) => setApiKey({ keyName: 'openai', value: e.target.value })}
            onFocus={(e) => e.target.select()}
            placeholder="sk-..."
            className="mt-2 w-full py-2 px-3 rounded-md bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] outline-none font-mono focus:border-[var(--nim-primary)]"
          />
        </div>

        <div className="setting-item py-3">
          <label className="setting-label flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleEnabledChange(e.target.checked)}
              className="setting-checkbox mt-1 w-4 h-4 rounded border-[var(--nim-border)] accent-[var(--nim-primary)]"
              disabled={!hasOpenAIKey}
            />
            <div className="setting-text flex flex-col gap-0.5">
              <span className="setting-name text-sm font-medium text-[var(--nim-text)]">显示语音模式按钮</span>
              <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                在 AI 输入区域显示麦克风按钮
              </span>
            </div>
          </label>
        </div>
      </div>

      {enabled && hasOpenAIKey && micStatus && micStatus !== 'granted' && (
        <div
          className="voice-mode-mic-permission-warning provider-panel-section mb-6 p-4 rounded border border-[var(--nim-warning)] bg-[var(--nim-bg-secondary)]"
          data-testid="voice-mode-mic-permission-warning"
        >
          <div className="flex items-start gap-3">
            <MaterialSymbol icon="mic_off" size={20} className="mt-0.5 text-[var(--nim-warning)]" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-[var(--nim-text)] mb-1">未授予麦克风权限</h4>
              <p className="text-xs text-[var(--nim-text-muted)] mb-3">
                {micStatus === 'denied'
                  ? '语音模式需要麦克风权限。请在系统设置中为 Nimbalyst 启用麦克风权限，然后点击下方重新检查。'
                  : micStatus === 'restricted'
                  ? '此设备上的麦克风权限受限（例如家长控制或 MDM 策略）。语音模式无法录音。'
                  : '语音模式需要麦克风权限。请打开系统设置为 Nimbalyst 授权。'}
              </p>
              <div className="flex items-center gap-2">
                {micPlatform === 'darwin' && (
                  <button
                    onClick={handleOpenMicSettings}
                    className="px-3 py-1.5 rounded border border-[var(--nim-border)] bg-[var(--nim-primary)] text-white cursor-pointer text-sm flex items-center gap-1.5"
                    data-testid="voice-mode-open-mic-settings"
                  >
                    <MaterialSymbol icon="open_in_new" size={14} />
                    打开系统设置
                  </button>
                )}
                <button
                  onClick={checkMicStatus}
                  className="px-3 py-1.5 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] cursor-pointer text-sm flex items-center gap-1.5"
                  data-testid="voice-mode-recheck-mic"
                >
                  <MaterialSymbol icon="refresh" size={14} />
                  重新检查
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {enabled && hasOpenAIKey && (
        <>
          <div className="provider-panel-section mb-6">
            <h4 className="provider-panel-section-title text-base font-medium mb-4 text-[var(--nim-text)]">语音设置</h4>

            <div className="setting-item py-3">
              <div className="setting-text flex flex-col gap-0.5">
                <span className="setting-name text-sm font-medium text-[var(--nim-text)]">语音</span>
                <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                  选择助手语音。每种语音都有独特的性格和语调。
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <select
                  value={voice}
                  onChange={(e) => handleSettingChange({ voice: e.target.value as VoiceId })}
                  className="flex-1 px-3 py-1.5 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] text-[var(--nim-text)]"
                >
                  {VOICE_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} - {v.description}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  onClick={handlePreviewVoice}
                  disabled={isPreviewPlaying && !audioRef.current}
                  className={`px-3 py-1.5 rounded border border-[var(--nim-border)] cursor-pointer flex items-center gap-1 ${
                    isPreviewPlaying
                      ? 'bg-[var(--nim-primary)] text-white'
                      : 'bg-[var(--nim-bg-secondary)] text-[var(--nim-text)]'
                  }`}
                  title={isPreviewPlaying ? '停止预览' : '预览此语音'}
                >
                  <MaterialSymbol icon={isPreviewPlaying ? 'stop' : 'play_arrow'} size={16} />
                  {isPreviewPlaying ? '停止' : '预览'}
                </button>
              </div>
              <p className="provider-panel-hint mt-2 text-xs text-[var(--nim-text-muted)]">
                预览使用 OpenAI TTS API 播放一段简短的语音示例。
                {VOICE_OPTIONS.find(v => v.id === voice)?.realtimeOnly && (
                  <span className="text-[var(--nim-text-muted)]">
                    {' '}此语音仅支持实时模式，预览使用相似语音替代。
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="provider-panel-section mb-6">
            <h4 className="provider-panel-section-title text-base font-medium mb-4 text-[var(--nim-text)]">语音检测</h4>
            <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)] mb-4">
              控制助手如何检测你的语音以及何时停止收听。
            </p>

            {/* Mode Selection */}
            <div className="setting-item py-3 mb-4">
              <div className="setting-text flex flex-col gap-0.5">
                <span className="setting-name text-sm font-medium text-[var(--nim-text)]">输入模式</span>
                <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                  选择语音输入的捕获方式
                </span>
              </div>
              <select
                value={currentTurnDetection.mode}
                onChange={(e) => handleTurnDetectionChange({ mode: e.target.value as 'server_vad' | 'push_to_talk' })}
                className="mt-2 px-3 py-1.5 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] text-[var(--nim-text)]"
              >
                <option value="server_vad">语音活动检测（自动）</option>
                <option value="push_to_talk">按住说话（手动）</option>
              </select>
            </div>

            {/* VAD-specific settings */}
            {currentTurnDetection.mode === 'server_vad' && (
              <>
                {/* VAD Threshold */}
                <div className="setting-item py-3 mb-4">
                  <div className="setting-text flex flex-col gap-0.5">
                    <span className="setting-name text-sm font-medium text-[var(--nim-text)]">语音检测灵敏度</span>
                    <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                      麦克风对语音的灵敏度。值越低越灵敏（可捕捉轻声），值越高越不灵敏（需要较大声音）。
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-[var(--nim-text-muted)]">灵敏</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={(currentTurnDetection.vadThreshold || 0.5) * 100}
                      onChange={(e) => handleTurnDetectionChange({ vadThreshold: parseInt(e.target.value) / 100 })}
                      className="flex-1"
                    />
                    <span className="text-xs text-[var(--nim-text-muted)]">不灵敏</span>
                    <span className="text-xs text-[var(--nim-text)] min-w-[36px]">
                      {Math.round((currentTurnDetection.vadThreshold || 0.5) * 100)}%
                    </span>
                  </div>
                </div>

                {/* Silence Duration */}
                <div className="setting-item py-3 mb-4">
                  <div className="setting-text flex flex-col gap-0.5">
                    <span className="setting-name text-sm font-medium text-[var(--nim-text)]">处理前等待时间</span>
                    <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                      停止说话后等待多长时间再处理请求。越短响应越快，越长则允许更多自然停顿。
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-[var(--nim-text-muted)]">更快</span>
                    <input
                      type="range"
                      min="200"
                      max="1500"
                      step="100"
                      value={currentTurnDetection.silenceDuration || 500}
                      onChange={(e) => handleTurnDetectionChange({ silenceDuration: parseInt(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs text-[var(--nim-text-muted)]">更慢</span>
                    <span className="text-xs text-[var(--nim-text)] min-w-[50px]">
                      {((currentTurnDetection.silenceDuration || 500) / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Interruptible setting */}
            <div className="setting-item py-3">
              <label className="setting-label flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentTurnDetection.interruptible !== false}
                  onChange={(e) => handleTurnDetectionChange({ interruptible: e.target.checked })}
                  className="setting-checkbox mt-1 w-4 h-4 rounded border-[var(--nim-border)] accent-[var(--nim-primary)]"
                />
                <div className="setting-text flex flex-col gap-0.5">
                  <span className="setting-name text-sm font-medium text-[var(--nim-text)]">允许打断</span>
                  <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                    助手说话时你可以随时开口打断
                  </span>
                </div>
              </label>
            </div>

            {/* Listen Window Duration */}
            <div className="setting-item py-3">
              <div className="setting-text flex flex-col gap-0.5">
                <span className="setting-name text-sm font-medium text-[var(--nim-text)]">持续收听时长</span>
                <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                  停止说话后继续收听多长时间。超时后麦克风会休眠，直到助手回复或你点击麦克风按钮。
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-[var(--nim-text-muted)]">5s</span>
                <input
                  type="range"
                  min="5000"
                  max="30000"
                  step="1000"
                  value={listenWindowMs ?? 15000}
                  onChange={(e) => handleSettingChange({ listenWindowMs: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-[var(--nim-text-muted)]">30s</span>
                <span className="text-xs text-[var(--nim-text)] min-w-[36px]">
                  {Math.round((listenWindowMs ?? 15000) / 1000)}s
                </span>
              </div>
            </div>
          </div>

          <div className="provider-panel-section mb-6">
            <h4 className="provider-panel-section-title text-base font-medium mb-4 text-[var(--nim-text)]">命令提交</h4>

            {/* Submit Delay */}
            <div className="setting-item py-3 mb-4">
              <div className="setting-text flex flex-col gap-0.5">
                <span className="setting-name text-sm font-medium text-[var(--nim-text)]">提交前审阅延迟</span>
                <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                  语音命令发送给编程助手前的审阅和编辑时间。设为 0 则立即提交。
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-[var(--nim-text-muted)]">立即</span>
                <input
                  type="range"
                  min="0"
                  max="10000"
                  step="500"
                  value={submitDelayMs ?? 3000}
                  onChange={(e) => handleSettingChange({ submitDelayMs: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-[var(--nim-text-muted)]">10 秒</span>
                <span className="text-xs text-[var(--nim-text)] min-w-[50px]">
                  {((submitDelayMs ?? 3000) / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          </div>

          {/* Project Summary Section */}
          {workspacePath && (
            <div className="voice-mode-project-summary provider-panel-section mb-6">
              <h4 className="provider-panel-section-title text-base font-medium mb-4 text-[var(--nim-text)]">项目摘要</h4>
              <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)] mb-3">
                语音助手使用 AI 生成的项目摘要来理解上下文。
                存储在 <code className="text-xs bg-[var(--nim-bg-secondary)] px-1 py-0.5 rounded">{VOICE_PROJECT_SUMMARY_PATH}</code>。
              </p>

              {projectSummaryExists ? (
                <div className="flex items-center gap-2">
                  <MaterialSymbol icon="check_circle" size={16} className="text-[var(--nim-success)]" />
                  <span className="text-[var(--nim-text-muted)]">摘要已存在</span>
                  <button
                    onClick={handleOpenSummary}
                    className="px-2 py-1 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] cursor-pointer text-xs flex items-center gap-1"
                    title="打开摘要文件"
                    data-testid="voice-mode-summary-view"
                  >
                    <MaterialSymbol icon="open_in_new" size={14} />
                    查看
                  </button>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={!hasAgentConfigured}
                    className="px-2 py-1 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] cursor-pointer text-xs flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={hasAgentConfigured ? '重新生成摘要' : '请先配置一个 Agent 以启用重新生成功能'}
                    data-testid="voice-mode-summary-regenerate"
                  >
                    <MaterialSymbol icon="refresh" size={14} />
                    重新生成
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={!hasAgentConfigured}
                    className="px-3 py-1.5 rounded border border-[var(--nim-border)] bg-[var(--nim-primary)] text-white cursor-pointer text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="voice-mode-summary-generate"
                  >
                    <MaterialSymbol icon="auto_awesome" size={16} />
                    生成项目摘要
                  </button>
                  <p className="provider-panel-hint mt-2 text-xs text-[var(--nim-text-muted)]">
                    启动一个 Agent 会话来读取项目文件并生成摘要。你将被带到该会话以便实时查看进度。
                  </p>
                </div>
              )}

              {!hasAgentConfigured && (
                <p className="mt-3 text-xs text-[var(--nim-text-muted)]" data-testid="voice-mode-summary-no-agent">
                  尚未配置 Agent。{' '}
                  <button
                    type="button"
                    onClick={() => navigateToSettings({ category: 'claude-code' })}
                    className="bg-transparent border-none p-0 cursor-pointer text-[var(--nim-primary)] underline"
                  >
                    前往 AI 模型设置进行配置
                  </button>{' '}
                  以启用此功能。
                </p>
              )}

              {summaryError && (
                <p className="mt-2 text-xs text-[var(--nim-error)]" data-testid="voice-mode-summary-error">
                  {summaryError}
                </p>
              )}
            </div>
          )}

          <div className="provider-panel-section mb-6">
            <h4 className="provider-panel-section-title text-base font-medium mb-4 text-[var(--nim-text)]">用量与定价</h4>
            <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)]">
              OpenAI 语音模式收费标准：
            </p>
            <ul className="ml-5 mt-2 mb-2 text-sm text-[var(--nim-text-muted)] list-disc">
              <li>语音输入：$0.06/分钟</li>
              <li>语音输出：$0.24/分钟</li>
              <li>另加标准 token 处理费用</li>
            </ul>
            <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)]">
              示例：5 分钟对话约花费 $0.50
            </p>
          </div>

          <div className="provider-panel-section mb-6">
            <h4 className="provider-panel-section-title text-base font-medium mb-4 text-[var(--nim-text)]">工作原理</h4>
            <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)]">
              语音模式使用 OpenAI 高级语音模式（GPT Realtime）作为 Claude Code 的智能语音接口。
              你可以自然地说出编程需求，语音助手会将其转化为 Claude Code 命令。
            </p>
            <p className="provider-panel-hint mt-2 text-sm text-[var(--nim-text-muted)]">
              当 Claude Code 完成工作后，助手会总结所做的内容并通过语音反馈给你。
            </p>
          </div>

          <div className="provider-panel-section mb-6">
            <h4 className="provider-panel-section-title text-base font-medium mb-4 text-[var(--nim-text)]">系统提示词自定义</h4>
            <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)] mb-4">
              自定义语音模式会话中语音助手和编程助手的行为。
            </p>

            {/* Voice Agent Prompt Section */}
            <button
              onClick={() => setShowVoiceAgentPrompt(!showVoiceAgentPrompt)}
              className={`flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer text-[var(--nim-text)] text-sm font-medium ${showVoiceAgentPrompt ? 'mb-3' : 'mb-4'}`}
            >
              <MaterialSymbol icon={showVoiceAgentPrompt ? 'expand_less' : 'expand_more'} size={20} />
              语音助手指令
            </button>

            {showVoiceAgentPrompt && (
              <div className="mb-6 pl-7">
                <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)] mb-3">
                  自定义处理语音交互的语音助手（GPT-4 Realtime）。
                </p>

                <div className="setting-item py-3 mb-4">
                  <div className="setting-text flex flex-col gap-0.5">
                    <span className="setting-name text-sm font-medium text-[var(--nim-text)]">前置指令</span>
                    <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                      添加在默认语音助手指令之前
                    </span>
                  </div>
                  <textarea
                    value={voiceAgentPrompt?.prepend || ''}
                    onChange={(e) => handleSettingChange({
                      voiceAgentPrompt: {
                        ...voiceAgentPrompt,
                        prepend: e.target.value,
                      },
                    })}
                    placeholder="例如：始终使用正式语气回复..."
                    className="mt-2 w-full min-h-[80px] px-3 py-2 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] font-inherit text-sm resize-y"
                  />
                </div>

                <div className="setting-item py-3">
                  <div className="setting-text flex flex-col gap-0.5">
                    <span className="setting-name text-sm font-medium text-[var(--nim-text)]">后置指令</span>
                    <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                      添加在默认语音助手指令之后
                    </span>
                  </div>
                  <textarea
                    value={voiceAgentPrompt?.append || ''}
                    onChange={(e) => handleSettingChange({
                      voiceAgentPrompt: {
                        ...voiceAgentPrompt,
                        append: e.target.value,
                      },
                    })}
                    placeholder="例如：讨论代码时始终提及文件名..."
                    className="mt-2 w-full min-h-[80px] px-3 py-2 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] font-inherit text-sm resize-y"
                  />
                </div>
              </div>
            )}

            {/* Coding Agent Prompt Section */}
            <button
              onClick={() => setShowCodingAgentPrompt(!showCodingAgentPrompt)}
              className={`flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer text-[var(--nim-text)] text-sm font-medium ${showCodingAgentPrompt ? 'mb-3' : ''}`}
            >
              <MaterialSymbol icon={showCodingAgentPrompt ? 'expand_less' : 'expand_more'} size={20} />
              编程助手指令（语音模式）
            </button>

            {showCodingAgentPrompt && (
              <div className="pl-7">
                <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)] mb-3">
                  自定义处理语音模式请求时的编程助手（Claude）。
                  这些指令仅在语音模式会话期间添加到系统提示词中。
                </p>

                <div className="setting-item py-3 mb-4">
                  <div className="setting-text flex flex-col gap-0.5">
                    <span className="setting-name text-sm font-medium text-[var(--nim-text)]">前置指令</span>
                    <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                      添加在编程助手语音模式上下文之前
                    </span>
                  </div>
                  <textarea
                    value={codingAgentPrompt?.prepend || ''}
                    onChange={(e) => handleSettingChange({
                      codingAgentPrompt: {
                        ...codingAgentPrompt,
                        prepend: e.target.value,
                      },
                    })}
                    placeholder="例如：回复语音请求时优先简洁..."
                    className="mt-2 w-full min-h-[80px] px-3 py-2 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] font-inherit text-sm resize-y"
                  />
                </div>

                <div className="setting-item py-3">
                  <div className="setting-text flex flex-col gap-0.5">
                    <span className="setting-name text-sm font-medium text-[var(--nim-text)]">后置指令</span>
                    <span className="setting-description text-xs text-[var(--nim-text-muted)]">
                      添加在编程助手语音模式上下文之后
                    </span>
                  </div>
                  <textarea
                    value={codingAgentPrompt?.append || ''}
                    onChange={(e) => handleSettingChange({
                      codingAgentPrompt: {
                        ...codingAgentPrompt,
                        append: e.target.value,
                      },
                    })}
                    placeholder="例如：最后始终用 1-2 句话总结你做了什么..."
                    className="mt-2 w-full min-h-[80px] px-3 py-2 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] font-inherit text-sm resize-y"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
