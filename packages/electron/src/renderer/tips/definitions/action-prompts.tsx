/**
 * Tip: Action Prompts Dropdown
 *
 * Surfaces the action-prompts feature (ai-actions.md) to users with lots
 * of prompts under their belt -- power-user reuse pattern they probably
 * have not found.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import type { TipDefinition } from '../types';

const PlaylistIcon = <MaterialSymbol icon="playlist_play" size={16} />;

export const actionPromptsTip: TipDefinition = {
  id: 'tip-action-prompts',
  name: 'Action Prompts',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.AI_PROMPT_SUBMITTED, 50),
    delay: 2000,
    priority: 3,
  },
  content: {
    icon: PlaylistIcon,
    title: '将常用提示词保存为动作',
    body: '创建 **nimbalyst-local/ai-actions.md** 来定义一键提示词。它们会出现在编辑器的动作下拉菜单中——非常适合"审查这个 diff"或"写发布说明"之类的重复工作流。',
  },
};
