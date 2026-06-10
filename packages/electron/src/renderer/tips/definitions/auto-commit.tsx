/**
 * Tip: Auto-Commit Mode
 *
 * Surfaces auto-commit to users with deep AI-session history -- if they
 * manually commit each turn they'll appreciate the automation.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { store } from '@nimbalyst/runtime/store';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import { openSettingsCommandAtom } from '../../store/atoms/settingsNavigation';
import type { TipDefinition } from '../types';

const CommitIcon = <MaterialSymbol icon="auto_mode" size={16} />;

export const autoCommitTip: TipDefinition = {
  id: 'tip-auto-commit',
  name: 'Auto-Commit Mode',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.SESSION_COMPLETED, 10),
    delay: 2000,
    priority: 3,
  },
  content: {
    icon: CommitIcon,
    title: '每次 AI 回合后自动提交',
    body: '在 Claude Code 面板中启用自动提交，每次回合结束时都会创建一个检查点提交。方便回退，再也不怕失控的 Agent 丢代码了。',
    action: {
      label: '打开 Claude Code 设置',
      onClick: () => {
        store.set(openSettingsCommandAtom, { category: 'claude-code', timestamp: Date.now() });
      },
      variant: 'primary',
    },
  },
};
