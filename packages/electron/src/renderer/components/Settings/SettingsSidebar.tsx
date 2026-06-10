import React, { useState } from 'react';
import { useAtomValue } from 'jotai';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MaterialSymbol, getProviderIcon } from '@nimbalyst/runtime';
import { useAlphaFeatures } from '../../hooks/useAlphaFeature';
import { AlphaBadge, SETTINGS_ALPHA_TOOLTIP } from '../common/AlphaBadge';
import { developerModeAtom } from '../../store/atoms/appSettings';

export type SettingsCategory =
  | 'agent-permissions'
  | 'claude-code'
  | 'claude'
  | 'openai'
  | 'openai-codex'
  | 'opencode'
  | 'copilot-cli'
  | 'lmstudio'
  | 'notifications'
  | 'voice-mode'
  | 'sync'
  | 'themes'
  | 'language'
  | 'advanced'
  | 'database'
  | 'agent-features'
  | 'agent-work-os'
  | 'beta-features'
  | 'mcp-servers'
  | 'installed-extensions'
  | 'privileged-extensions'
  | 'claude-plugins'
  | 'shared-links'
  | 'marketplace'
  | 'installed'
  | 'team'
  | 'tracker-config';

interface CategoryGroup {
  key: string;
  title: string;
  items: CategoryItem[];
  infoTooltip?: string;
}

interface CategoryItem {
  id: SettingsCategory;
  name: string;
  icon: React.ReactNode;
  badge?: string | number;
  isAlpha?: boolean;
  statusDot?: 'success' | 'warning' | 'error';
  hidden?: boolean;
}

export type SettingsScope = 'user' | 'project';

interface SettingsSidebarProps {
  selectedCategory: SettingsCategory;
  onSelectCategory: (category: SettingsCategory) => void;
  providerStatus?: Record<string, { enabled: boolean; testStatus?: string }>;
  scope?: SettingsScope;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  selectedCategory,
  onSelectCategory,
  providerStatus = {},
  scope = 'user',
}) => {
  // Alpha feature flags drive Collaboration group visibility only.
  // Per-feature panels (Voice Mode, OpenCode, Copilot, Agent Features) are always visible
  // so users can discover and enable them; the panels themselves gate their controls.
  const alphaFeatures = useAlphaFeatures(['collaboration']);
  // Database panel exposes the PGLite→SQLite migration. Hidden from non-dev
  // users until we finish internal testing with other devs.
  const developerMode = useAtomValue(developerModeAtom);
  const { t } = useTranslation('settings');
  const getStatusDot = (providerId: string): 'success' | 'warning' | 'error' | undefined => {
    const status = providerStatus[providerId];
    if (!status) return undefined;
    if (status.enabled && status.testStatus === 'success') return 'success';
    if (status.enabled && status.testStatus === 'error') return 'error';
    return undefined;
  };

  const categoryGroups: CategoryGroup[] = [
    {
      key: 'application',
      title: t('application'),
      items: [
        {
          id: 'sync',
          name: t('accountSync'),
          icon: <MaterialSymbol icon="account_circle" size={16} />,
        },
        {
          id: 'shared-links',
          name: t('sharedLinks'),
          icon: <MaterialSymbol icon="link" size={16} />,
        },
        {
          id: 'notifications',
          name: t('notifications'),
          icon: <MaterialSymbol icon="notifications" size={16} />,
        },
        {
          id: 'themes',
          name: t('themes'),
          icon: <MaterialSymbol icon="palette" size={16} />,
        },
        {
          id: 'language',
          name: t('language'),
          icon: <MaterialSymbol icon="translate" size={16} />,
        },
        {
          id: 'advanced',
          name: t('advanced'),
          icon: <MaterialSymbol icon="settings" size={16} />,
        },
        {
          id: 'database',
          name: t('database'),
          icon: <MaterialSymbol icon="database" size={16} />,
          isAlpha: true,
          hidden: !developerMode,
        },
        {
          id: 'voice-mode',
          name: t('voiceMode'),
          icon: <MaterialSymbol icon="mic" size={16} />,
          isAlpha: true,
        },
        {
          id: 'agent-work-os',
          name: t('agentWorkOS'),
          icon: <MaterialSymbol icon="assignment" size={16} />,
          isAlpha: true,
        },
        {
          id: 'agent-features',
          name: t('agentFeatures'),
          icon: <MaterialSymbol icon="science" size={16} />,
          isAlpha: true,
        },

        {
          id: 'beta-features',
          name: t('betaFeatures'),
          icon: <MaterialSymbol icon="biotech" size={16} />,
          hidden: true,
        },
      ],
    },
    {
      key: 'agent-providers',
      title: t('agentProviders'),
      infoTooltip: t('agentProvidersTooltip'),
      items: [
        {
          id: 'claude-code',
          name: t('claudeAgent'),
          icon: getProviderIcon('claude-code', { size: 16 }),
          statusDot: getStatusDot('claude-code'),
        },
        {
          id: 'openai-codex',
          name: t('openaiCodex'),
          icon: getProviderIcon('openai', { size: 16 }),
          statusDot: getStatusDot('openai-codex'),
        },
        {
          id: 'opencode',
          name: t('openCode'),
          icon: getProviderIcon('opencode', { size: 16 }),
          statusDot: getStatusDot('opencode'),
          isAlpha: true,
        },
        {
          id: 'copilot-cli',
          name: t('githubCopilot'),
          icon: <MaterialSymbol icon="terminal" size={16} />,
          statusDot: getStatusDot('copilot-cli'),
          isAlpha: true,
        },
      ],
    },
    {
      key: 'chat-providers',
      title: t('chatProviders'),
      infoTooltip: t('chatProvidersTooltip'),
      items: [
        {
          id: 'claude',
          name: t('claudeChat'),
          icon: getProviderIcon('claude', { size: 16 }),
          statusDot: getStatusDot('claude'),
        },
        {
          id: 'openai',
          name: t('openai'),
          icon: getProviderIcon('openai', { size: 16 }),
          statusDot: getStatusDot('openai'),
        },
        {
          id: 'lmstudio',
          name: t('lmStudio'),
          icon: getProviderIcon('lmstudio', { size: 16 }),
          statusDot: getStatusDot('lmstudio'),
        },
      ],
    },
    {
      key: 'project',
      title: t('project'),
      items: [
        {
          id: 'agent-permissions',
          name: t('agentPermissions'),
          icon: <MaterialSymbol icon="shield" size={16} />,
        },
      ],
    },
    ...(alphaFeatures['collaboration'] ? [{
      key: 'collaboration',
      title: t('collaboration'),
      items: [
        {
          id: 'team' as SettingsCategory,
          name: t('team'),
          icon: <MaterialSymbol icon="group" size={16} />,
          isAlpha: true,
        },
        {
          id: 'tracker-config' as SettingsCategory,
          name: t('trackers'),
          icon: <MaterialSymbol icon="assignment" size={16} />,
          isAlpha: true,
        },
      ],
    }] : []),
    {
      key: 'extensions',
      title: t('extensions'),
      items: [
        {
          id: 'marketplace',
          name: t('marketplace'),
          icon: <MaterialSymbol icon="storefront" size={16} />,
        },
        {
          id: 'installed-extensions',
          name: t('installed'),
          icon: <MaterialSymbol icon="extension" size={16} />,
        },
        {
          id: 'privileged-extensions',
          name: t('privilegedCapabilities'),
          icon: <MaterialSymbol icon="shield_lock" size={16} />,
        },
        {
          id: 'claude-plugins',
          name: t('claudePlugins'),
          icon: <MaterialSymbol icon="widgets" size={16} />,
        },
        {
          id: 'mcp-servers',
          name: t('mcpServers'),
          icon: <MaterialSymbol icon="dns" size={16} />,
        },
      ],
    },
  ];

  // Filter groups based on scope
  // Project scope: Show Project group, Agent/Chat Providers (for overrides), Extensions
  // User scope: Show Agent/Chat Providers, Application, Extensions (not Project)
  const filteredGroups = scope === 'project'
    ? [
        categoryGroups.find(g => g.key === 'project'),
        categoryGroups.find(g => g.key === 'collaboration'),
        categoryGroups.find(g => g.key === 'agent-providers'),
        categoryGroups.find(g => g.key === 'chat-providers'),
        categoryGroups.find(g => g.key === 'extensions'),
      ].filter((g): g is CategoryGroup => g != null)
    : categoryGroups.filter(g => g.key !== 'project' && g.key !== 'collaboration');

  const [tooltip, setTooltip] = useState<{ text: string; top: number; left: number } | null>(null);

  const handleTooltipEnter = (event: React.MouseEvent<HTMLSpanElement>, text: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      text,
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  const handleTooltipLeave = () => {
    setTooltip(null);
  };

  return (
    <div className="settings-sidebar w-[240px] shrink-0 border-r border-[var(--nim-border)] bg-[var(--nim-bg)] overflow-y-auto">
      <div className="settings-sidebar-content p-3">
        {filteredGroups.map((group) => (
          <div key={group.key} className="settings-sidebar-group mb-4">
            <div className="settings-sidebar-group-title flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--nim-text-muted)]">
              {group.title}
              {group.infoTooltip && (
                <span
                  className="settings-sidebar-group-info cursor-help text-[var(--nim-text-faint)] hover:text-[var(--nim-text-muted)] transition-colors"
                  onMouseEnter={(event) => handleTooltipEnter(event, group.infoTooltip!)}
                  onMouseLeave={handleTooltipLeave}
                >
                  <MaterialSymbol icon="info" size={14} />
                </span>
              )}
            </div>
            {group.items
              .filter((item) => !item.hidden)
              .map((item) => (
                <div
                  key={item.id}
                  className={`settings-sidebar-item flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
                    selectedCategory === item.id
                      ? 'bg-[var(--nim-bg-selected)] text-[var(--nim-text)]'
                      : 'text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-hover)] hover:text-[var(--nim-text)]'
                  }`}
                  onClick={() => onSelectCategory(item.id)}
                >
                  <span className="settings-sidebar-item-icon flex items-center justify-center w-5 h-5 shrink-0 text-[var(--nim-text-muted)]">{item.icon}</span>
                  <span className="settings-sidebar-item-name flex-1 truncate">{item.name}</span>
                  {item.isAlpha && <AlphaBadge size="xs" tooltip={SETTINGS_ALPHA_TOOLTIP} />}
                  {item.badge && (
                    <span className="settings-sidebar-item-badge text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--nim-bg-tertiary)] text-[var(--nim-text-muted)]">
                      {item.badge}
                    </span>
                  )}
                  {item.statusDot && (
                    <span
                      className={`settings-sidebar-item-status w-2 h-2 rounded-full shrink-0 ${
                        item.statusDot === 'success'
                          ? 'bg-[var(--nim-success)]'
                          : item.statusDot === 'error'
                          ? 'bg-[var(--nim-error)]'
                          : 'bg-[var(--nim-warning)]'
                      }`}
                    />
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
      {tooltip &&
        createPortal(
          <div
            className="settings-sidebar-tooltip fixed z-[10000] max-w-[280px] px-3 py-2 bg-[var(--nim-bg-tertiary)] border border-[var(--nim-border)] rounded-lg shadow-lg text-sm text-[var(--nim-text)] whitespace-pre-wrap pointer-events-none transform -translate-y-1/2"
            style={{ top: `${tooltip.top}px`, left: `${tooltip.left}px` }}
          >
            {tooltip.text}
          </div>,
          document.body
        )}
    </div>
  );
};
