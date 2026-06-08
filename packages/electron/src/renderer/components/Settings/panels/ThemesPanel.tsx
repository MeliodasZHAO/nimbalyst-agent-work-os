import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { MaterialSymbol } from '@nimbalyst/runtime';
import type { ThemeManifest } from '@nimbalyst/extension-sdk';
import { useTheme } from '../../../hooks/useTheme';
import { pendingThemeFallbackAtom } from '../../../store/atoms/themeFallback';
import { themeListChangedVersionAtom } from '../../../store/atoms/themeList';

interface ThemesPanelProps {
  scope: 'user' | 'project';
  workspacePath?: string;
}

interface ThemeWithState extends ThemeManifest {
  isBuiltIn: boolean;
  isExtension: boolean;
  isUser: boolean;
  isActive: boolean;
}

export const ThemesPanel: React.FC<ThemesPanelProps> = ({ scope, workspacePath }) => {
  const { themeId } = useTheme();
  const [themes, setThemes] = useState<ThemeWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const pendingFallback = useAtomValue(pendingThemeFallbackAtom);
  const setPendingFallback = useSetAtom(pendingThemeFallbackAtom);

  // Load themes
  const loadThemes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const themeManifests = await window.electronAPI.invoke('theme:list');

      const themesWithState: ThemeWithState[] = themeManifests.map((manifest: ThemeManifest) => ({
        ...manifest,
        isBuiltIn: manifest.origin === 'builtin',
        isExtension: manifest.origin === 'extension',
        isUser: manifest.origin === 'user',
        isActive: manifest.id === themeId,
      }));

      setThemes(themesWithState);
    } catch (err) {
      console.error('Failed to load themes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load themes');
    } finally {
      setLoading(false);
    }
  }, [themeId]);

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  // Refresh when extensions register/unregister themes. The IPC event is
  // handled centrally in store/listeners/themeListeners.ts which bumps
  // themeListChangedVersionAtom; we only react to *new* bumps (skip the
  // initial-mount value) so the side effect doesn't double-fire alongside
  // the loadThemes() effect above.
  const themeListVersion = useAtomValue(themeListChangedVersionAtom);
  const initialThemeListVersionRef = useRef(themeListVersion);
  useEffect(() => {
    if (themeListVersion === initialThemeListVersionRef.current) return;
    void loadThemes();
  }, [themeListVersion, loadThemes]);

  const handleDismissFallback = useCallback(() => {
    if (window.electronAPI?.send) {
      window.electronAPI.send('theme:dismiss-pending-fallback');
    }
    setPendingFallback(null);
  }, [setPendingFallback]);

  // Handle theme selection
  const handleThemeSelect = useCallback(async (themeIdToSelect: string) => {
    const theme = themes.find(t => t.id === themeIdToSelect);
    if (!theme) return;

    // Send theme change to main process
    if (window.electronAPI?.send) {
      window.electronAPI.send('set-theme', themeIdToSelect, theme.isDark);
    }

    // Reload themes to update active state
    await loadThemes();
  }, [themes, loadThemes]);

  // Handle theme uninstall
  const handleUninstall = useCallback(async (themeIdToUninstall: string) => {
    const theme = themes.find(t => t.id === themeIdToUninstall);
    if (!theme) return;

    if (theme.isBuiltIn) {
      setError('无法卸载内置主题');
      return;
    }

    const confirmed = confirm(`确定要卸载 "${theme.name}" 吗？`);
    if (!confirmed) return;

    try {
      const result = await window.electronAPI.invoke('theme:uninstall', themeIdToUninstall);
      if (!result.success) {
        throw new Error(result.error || 'Failed to uninstall theme');
      }

      // If the uninstalled theme was active, switch to light theme
      if (theme.isActive) {
        if (window.electronAPI?.send) {
          window.electronAPI.send('set-theme', 'light', false);
        }
      }

      await loadThemes();
    } catch (err) {
      console.error('Failed to uninstall theme:', err);
      setError(err instanceof Error ? err.message : 'Failed to uninstall theme');
    }
  }, [themes, loadThemes]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    try {
      await window.electronAPI.invoke('theme:reload');
      await loadThemes();
    } catch (err) {
      console.error('Failed to reload themes:', err);
      setError(err instanceof Error ? err.message : 'Failed to reload themes');
    }
  }, [loadThemes]);

  // Get icon for theme
  const getThemeIcon = (theme: ThemeWithState): string => {
    if (theme.isBuiltIn) {
      switch (theme.id) {
        case 'light': return 'light_mode';
        case 'dark': return 'dark_mode';
        case 'crystal-dark': return 'bedtime';
        default: return 'palette';
      }
    }
    return theme.isDark ? 'dark_mode' : 'light_mode';
  };

  // Group themes by origin
  const builtInThemes = themes.filter(t => t.isBuiltIn);
  const userThemes = themes.filter(t => t.isUser);
  const extensionThemes = themes.filter(t => t.isExtension);
  const selectedTheme = themes.find(t => t.id === selectedThemeId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-nim-muted">加载主题中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-nim">
        <div>
          <h2 className="text-lg font-semibold text-nim">主题</h2>
          <p className="text-sm text-nim-muted mt-1">
            管理编辑器的颜色主题
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-nim-muted hover:text-nim hover:bg-nim-hover rounded transition-colors"
          title="刷新主题列表"
        >
          <MaterialSymbol icon="refresh" size={18} />
          <span>刷新</span>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-nim-error/10 border border-nim-error/30 rounded-md text-nim-error text-sm">
          {error}
        </div>
      )}

      {/* Pending fallback banner */}
      {pendingFallback && (
        <div className="theme-fallback-banner mb-4 p-3 bg-nim-warning/10 border border-nim-warning/30 rounded-md flex items-start gap-2">
          <MaterialSymbol icon="info" size={18} className="text-nim-warning shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-nim">
            The theme <span className="font-semibold">{pendingFallback.missingId}</span> is no longer available. Switched to <span className="font-semibold">{pendingFallback.appliedId}</span>.
          </div>
          <button
            data-testid="dismiss-theme-fallback"
            onClick={handleDismissFallback}
            className="p-1 text-nim-muted hover:text-nim hover:bg-nim-hover rounded transition-colors"
            title="关闭"
          >
            <MaterialSymbol icon="close" size={16} />
          </button>
        </div>
      )}

      {/* Active theme section */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-nim mb-3">当前主题</h3>
        <div className="flex items-center gap-3 p-3 bg-nim-secondary border border-nim rounded-md">
          {(() => {
            const activeTheme = themes.find(t => t.isActive);
            if (!activeTheme) return <div className="text-nim-muted text-sm">未选择主题</div>;

            return (
              <>
                <div className="flex items-center justify-center w-10 h-10 bg-nim-tertiary rounded-md">
                  <MaterialSymbol icon={getThemeIcon(activeTheme)} size={20} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-nim">{activeTheme.name}</div>
                  <div className="text-xs text-nim-muted">{activeTheme.description || '暂无描述'}</div>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 bg-nim-primary/20 text-nim-primary text-xs rounded">
                  <MaterialSymbol icon="check" size={14} />
                  <span>使用中</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Theme list */}
      <div className="flex-1 overflow-auto">
        {/* Built-in themes */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-nim mb-3">内置主题</h3>
          <div className="space-y-2">
            {builtInThemes.map((theme) => (
              <div
                key={theme.id}
                className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-all ${
                  selectedThemeId === theme.id
                    ? 'border-nim-primary bg-nim-primary/5'
                    : 'border-nim bg-nim-secondary hover:bg-nim-tertiary'
                }`}
                onClick={() => setSelectedThemeId(theme.id)}
              >
                <div className="flex items-center justify-center w-10 h-10 bg-nim-tertiary rounded-md">
                  <MaterialSymbol icon={getThemeIcon(theme)} size={20} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-nim">{theme.name}</div>
                  <div className="text-xs text-nim-muted">{theme.description || '暂无描述'}</div>
                </div>
                {theme.isActive && (
                  <div className="flex items-center gap-1 text-nim-primary text-xs">
                    <MaterialSymbol icon="check" size={14} />
                  </div>
                )}
                {!theme.isActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleThemeSelect(theme.id);
                    }}
                    className="px-3 py-1 text-xs text-nim-muted hover:text-nim hover:bg-nim-hover rounded transition-colors"
                  >
                    应用
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* User themes */}
        {userThemes.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-nim mb-3">用户主题</h3>
            <div className="space-y-2">
              {userThemes.map((theme) => (
                <div
                  key={theme.id}
                  className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-all ${
                    selectedThemeId === theme.id
                      ? 'border-nim-primary bg-nim-primary/5'
                      : 'border-nim bg-nim-secondary hover:bg-nim-tertiary'
                  }`}
                  onClick={() => setSelectedThemeId(theme.id)}
                >
                  <div className="flex items-center justify-center w-10 h-10 bg-nim-tertiary rounded-md">
                    <MaterialSymbol icon={getThemeIcon(theme)} size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-nim">{theme.name}</div>
                    <div className="text-xs text-nim-muted">{theme.description || '暂无描述'}</div>
                  </div>
                  {theme.isActive && (
                    <div className="flex items-center gap-1 text-nim-primary text-xs">
                      <MaterialSymbol icon="check" size={14} />
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    {!theme.isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleThemeSelect(theme.id);
                        }}
                        className="px-3 py-1 text-xs text-nim-muted hover:text-nim hover:bg-nim-hover rounded transition-colors"
                      >
                        应用
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUninstall(theme.id);
                      }}
                      className="p-1.5 text-nim-muted hover:text-nim-error hover:bg-nim-error/10 rounded transition-colors"
                      title="卸载主题"
                    >
                      <MaterialSymbol icon="delete" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extension themes */}
        {extensionThemes.length > 0 && (
          <div className="extension-themes-section mb-6">
            <h3 className="text-sm font-medium text-nim mb-3">扩展主题</h3>
            <div className="space-y-2">
              {extensionThemes.map((theme) => (
                <div
                  key={theme.id}
                  data-testid="extension-theme-item"
                  className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-all ${
                    selectedThemeId === theme.id
                      ? 'border-nim-primary bg-nim-primary/5'
                      : 'border-nim bg-nim-secondary hover:bg-nim-tertiary'
                  }`}
                  onClick={() => setSelectedThemeId(theme.id)}
                >
                  <div className="flex items-center justify-center w-10 h-10 bg-nim-tertiary rounded-md">
                    <MaterialSymbol icon={getThemeIcon(theme)} size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-nim">{theme.name}</div>
                    <div className="text-xs text-nim-muted">
                      {theme.contributedBy ? `由 ${theme.contributedBy} 提供` : '扩展主题'}
                    </div>
                  </div>
                  {theme.isActive && (
                    <div className="flex items-center gap-1 text-nim-primary text-xs">
                      <MaterialSymbol icon="check" size={14} />
                    </div>
                  )}
                  {!theme.isActive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleThemeSelect(theme.id);
                      }}
                      className="px-3 py-1 text-xs text-nim-muted hover:text-nim hover:bg-nim-hover rounded transition-colors"
                    >
                      应用
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no installed themes (user or extension) */}
        {userThemes.length === 0 && extensionThemes.length === 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-nim mb-3">已安装主题</h3>
            <div className="flex flex-col items-center justify-center p-8 bg-nim-secondary border border-nim border-dashed rounded-md">
              <MaterialSymbol icon="palette" size={32} className="text-nim-muted mb-2" />
              <p className="text-sm text-nim-muted text-center">
                尚未安装用户或扩展主题
              </p>
              <p className="text-xs text-nim-faint text-center mt-1">
                从文件、市场或主题扩展安装主题
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Theme details panel */}
      {selectedTheme && (
        <div className="mt-4 pt-4 border-t border-nim">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-nim">{selectedTheme.name}</h3>
              <p className="text-xs text-nim-muted mt-0.5">{selectedTheme.description || '暂无描述'}</p>
            </div>
            <button
              onClick={() => setSelectedThemeId(null)}
              className="p-1 text-nim-muted hover:text-nim rounded transition-colors"
            >
              <MaterialSymbol icon="close" size={16} />
            </button>
          </div>

          {/* Theme metadata */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-nim-muted">版本:</span>
              <span className="text-nim">{selectedTheme.version}</span>
            </div>
            {selectedTheme.author && (
              <div className="flex items-center justify-between">
                <span className="text-nim-muted">作者:</span>
                <span className="text-nim">{selectedTheme.author}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-nim-muted">类型:</span>
              <span className="text-nim">{selectedTheme.isDark ? '深色' : '浅色'}</span>
            </div>
            {selectedTheme.tags && selectedTheme.tags.length > 0 && (
              <div className="flex items-start justify-between">
                <span className="text-nim-muted">标签:</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {selectedTheme.tags.map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 bg-nim-tertiary text-nim-muted rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(['solarized-dark', 'solarized-light', 'monokai'].includes(selectedTheme.id)) && (
              <div className="flex items-start justify-between pt-2 border-t border-nim mt-2">
                <span className="text-nim-muted">许可证:</span>
                <span className="text-nim text-right max-w-[60%]">
                  {selectedTheme.id.startsWith('solarized')
                    ? 'MIT License © 2011 Ethan Schoonover'
                    : 'MIT License © 2006 Wimer Hazenberg'}
                </span>
              </div>
            )}
          </div>

          {/* Color preview */}
          <div className="mt-4">
            <div className="text-xs font-medium text-nim mb-2">颜色</div>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(selectedTheme.colors).slice(0, 8).map(([key, value]) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <div
                    className="w-full h-8 rounded border border-nim"
                    style={{ backgroundColor: value }}
                    title={`${key}: ${value}`}
                  />
                  <span className="text-xs text-nim-muted">{key}</span>
                </div>
              ))}
            </div>
            {Object.keys(selectedTheme.colors).length > 8 && (
              <div className="text-xs text-nim-muted text-center mt-2">
                +{Object.keys(selectedTheme.colors).length - 8} 更多颜色
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
