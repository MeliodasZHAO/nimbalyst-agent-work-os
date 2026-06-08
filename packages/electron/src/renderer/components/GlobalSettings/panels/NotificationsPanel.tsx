import React, { useState } from 'react';
import { useAtom } from 'jotai';
import { SettingsToggle } from '../SettingsToggle';
import {
  notificationSettingsAtom,
  setNotificationSettingsAtom,
  type CompletionSoundType,
} from '../../../store/atoms/appSettings';

/**
 * NotificationsPanel - Self-contained settings panel for notifications.
 *
 * This component subscribes directly to Jotai atoms instead of receiving props.
 * Changes are automatically persisted via the setter atom.
 */
export function NotificationsPanel() {
  const [settings] = useAtom(notificationSettingsAtom);
  const [, updateSettings] = useAtom(setNotificationSettingsAtom);
  const [isTestPlaying, setIsTestPlaying] = useState(false);
  const [notificationHelp, setNotificationHelp] = useState<string | null>(null);

  const { completionSoundEnabled, completionSoundType, osNotificationsEnabled, notifyWhenFocused } = settings;

  // play-completion-sound is handled by store/listeners/soundListeners.ts.

  const handleTestSound = async () => {
    if (!window.electronAPI) return;

    setIsTestPlaying(true);
    try {
      await window.electronAPI.invoke('completion-sound:test', completionSoundType);
    } catch (error) {
      console.error('Failed to test sound:', error);
    } finally {
      setTimeout(() => setIsTestPlaying(false), 500);
    }
  };

  const handleTestNotification = async () => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.invoke('notifications:show-test');
    if (result?.success) {
      setNotificationHelp('已发送测试通知。如果没有看到，请打开系统通知设置并允许 Nimbalyst 通知。');
    } else {
      setNotificationHelp(result?.error || '发送测试通知失败。');
    }
  };

  const handleOpenNotificationSettings = async () => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.invoke('notifications:open-system-settings');
    if (!result?.success) {
      setNotificationHelp(result?.error || '打开系统通知设置失败。');
    }
  };

  return (
    <div className="provider-panel flex flex-col">
      <div className="provider-panel-header mb-6 pb-4 border-b border-[var(--nim-border)]">
        <h3 className="provider-panel-title text-xl font-semibold leading-tight mb-2 text-[var(--nim-text)]">通知</h3>
        <p className="provider-panel-description text-sm leading-relaxed text-[var(--nim-text-muted)]">
          配置 AI 交互的音频和视觉通知。
        </p>
      </div>

      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-base font-semibold mb-3 text-[var(--nim-text)]">完成提示音</h4>
        <p className="text-sm leading-relaxed text-[var(--nim-text-muted)] mb-4">
          当 AI 或代理完成一轮对话并准备好接收更多输入时播放提示音。
        </p>

        <SettingsToggle
          checked={completionSoundEnabled}
          onChange={(checked) => updateSettings({ completionSoundEnabled: checked })}
          name="启用完成提示音"
          description="当 AI 对话或代理完成回复时播放音频通知。"
        />

        {completionSoundEnabled && (
          <div className="setting-item py-3 mt-4">
            <div className="setting-text flex flex-col gap-0.5">
              <span className="setting-name text-sm font-medium text-[var(--nim-text)]">提示音类型</span>
              <span className="setting-description text-xs leading-relaxed text-[var(--nim-text-muted)]">
                选择回复完成时播放的提示音。
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {(['chime', 'bell', 'pop'] as CompletionSoundType[]).map((sound) => (
                <label key={sound} className="setting-radio-label flex items-center gap-2 cursor-pointer text-sm text-[var(--nim-text)]">
                  <input
                    type="radio"
                    name="sound-type"
                    value={sound}
                    checked={completionSoundType === sound}
                    onChange={(e) => updateSettings({ completionSoundType: e.target.value as CompletionSoundType })}
                    className="setting-radio w-4 h-4 cursor-pointer shrink-0 accent-[var(--nim-primary)]"
                  />
                  <span className="capitalize">{sound}</span>
                </label>
              ))}
            </div>
            <button
              onClick={handleTestSound}
              disabled={isTestPlaying}
              className="nim-btn-secondary text-sm mt-3"
            >
              {isTestPlaying ? '播放中...' : '测试提示音'}
            </button>
          </div>
        )}
      </div>

      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-base font-semibold mb-3 text-[var(--nim-text)]">系统通知</h4>
        <p className="text-sm leading-relaxed text-[var(--nim-text-muted)] mb-4">
          当应用在后台时，AI 回复完成后显示系统通知。
        </p>

        <SettingsToggle
          checked={osNotificationsEnabled}
          onChange={(checked) => {
            updateSettings({ osNotificationsEnabled: checked });
            if (checked) {
              void handleTestNotification();
            } else {
              setNotificationHelp(null);
            }
          }}
          name="启用系统通知"
          description="AI 完成回复时发送系统原生通知。遵循勿扰模式。"
        />

        {osNotificationsEnabled && (
          <>
            <SettingsToggle
              checked={notifyWhenFocused}
              onChange={(checked) => updateSettings({ notifyWhenFocused: checked })}
              name="聚焦时也通知"
              description="即使应用处于前台也显示通知，除非正在查看该会话。"
            />

            <div className="setting-item py-3">
              <div className="setting-text flex flex-col gap-2">
                <span className="setting-description text-xs leading-relaxed text-[var(--nim-text-muted)]">
                  Electron 在此不提供可靠的跨平台通知权限状态。
                  使用测试通知来触发系统提示或验证是否送达。
                </span>
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleTestNotification} className="nim-btn-secondary text-sm">
                    发送测试通知
                  </button>
                  <button onClick={handleOpenNotificationSettings} className="nim-btn-secondary text-sm">
                    打开系统通知设置
                  </button>
                </div>
                {notificationHelp && (
                  <span className="text-xs leading-relaxed text-[var(--nim-text-muted)]">{notificationHelp}</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-base font-semibold mb-3 text-[var(--nim-text)]">会话阻塞通知</h4>
        <p className="text-sm leading-relaxed text-[var(--nim-text-muted)] mb-4">
          当 AI 会话需要你的输入时显示系统通知。
        </p>

        <SettingsToggle
          checked={settings.sessionBlockedNotificationsEnabled}
          onChange={(checked) => updateSettings({ sessionBlockedNotificationsEnabled: checked })}
          name="会话需要关注时通知"
          description="当会话等待输入时通知（权限、问题、计划审查、提交）。"
        />
      </div>
    </div>
  );
}
