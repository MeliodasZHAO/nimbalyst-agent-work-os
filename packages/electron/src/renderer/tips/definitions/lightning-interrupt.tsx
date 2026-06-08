/**
 * Tip: Lightning Interrupt
 *
 * Surfaces the interrupt button to users who have completed enough
 * sessions that they have certainly watched at least one go sideways.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import type { TipDefinition } from '../types';

const BoltIcon = <MaterialSymbol icon="bolt" size={16} />;

export const lightningInterruptTip: TipDefinition = {
  id: 'tip-lightning-interrupt',
  name: 'Lightning Interrupt',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.SESSION_COMPLETED, 10),
    delay: 2000,
    priority: 3,
  },
  content: {
    icon: BoltIcon,
    title: '闪电按钮中断失控的 Agent',
    body: '如果 Agent 走偏了方向，点击编辑器旁的**闪电按钮**来中断它。在编辑器中输入新指令，它会从那里继续——不用等整个回合结束。',
  },
};
