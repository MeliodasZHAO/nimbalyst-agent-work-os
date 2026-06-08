/**
 * Tip: Shared Session Links
 *
 * Suggests sharing a session via an end-to-end-encrypted link instead of
 * screenshots. Users with meaningful sessions are the right audience.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { store } from '@nimbalyst/runtime/store';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import { openSettingsCommandAtom } from '../../store/atoms/settingsNavigation';
import type { TipDefinition } from '../types';

const ShareIcon = <MaterialSymbol icon="share" size={16} />;

export const sessionSharedTip: TipDefinition = {
  id: 'tip-session-shared',
  name: 'Shared Session Links',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.SESSION_COMPLETED_WITH_TOOLS, 5),
    delay: 2000,
    priority: 3,
  },
  content: {
    icon: ShareIcon,
    title: '分享会话，而不是截图',
    body: '会话可以发布为**端到端加密链接**，有效期 1 天、7 天或 30 天。用会话上的分享按钮将完整对话记录发送给队友。',
    action: {
      label: '管理共享链接',
      onClick: () => {
        store.set(openSettingsCommandAtom, { category: 'shared-links', timestamp: Date.now() });
      },
      variant: 'primary',
    },
  },
};
