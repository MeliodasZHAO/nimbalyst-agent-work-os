/**
 * Tip: CLAUDE.md Standing Instructions
 *
 * Surfaces workspace-level rules to users running many sessions in the
 * same project. Each new session re-learns the workspace without one.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import type { TipDefinition } from '../types';

const RulesIcon = <MaterialSymbol icon="rule" size={16} />;

export const claudeMdTip: TipDefinition = {
  id: 'tip-claude-md',
  name: 'CLAUDE.md Workspace Rules',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.SESSION_CREATED, 15),
    delay: 2000,
    priority: 3,
  },
  content: {
    icon: RulesIcon,
    title: '在 CLAUDE.md 中设置常驻指令',
    body: '在工作区根目录放一个 **CLAUDE.md**，写上你的编码规范、常用工具和风格要求。每个会话都会自动加载——你只需要写一次。',
  },
};
