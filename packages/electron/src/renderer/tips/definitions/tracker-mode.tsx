import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { store } from '@nimbalyst/runtime/store';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import { setWindowModeAtom } from '../../store/atoms/windowMode';
import type { TipDefinition } from '../types';

const TrackerIcon = <MaterialSymbol icon="assignment" size={16} />;

export const trackerModeTip: TipDefinition = {
  id: 'tip-tracker-mode',
  name: 'Tracker Mode Suggestion',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.currentMode !== 'tracker' &&
      context.hasReachedCount(FEATURE_USAGE_KEYS.SESSION_CREATED, 5) &&
      !context.hasBeenUsed(FEATURE_USAGE_KEYS.TRACKER_USED),
    delay: 2500,
    priority: 8,
  },
  content: {
    icon: TrackerIcon,
    title: '在会话旁追踪工作进度',
    body: '你一直在大量使用 AI 会话，**Tracker 模式**为你提供一个持久化的地方来管理跨会话的 Bug、任务和决策。',
    action: {
      label: '打开 Tracker',
      onClick: () => {
        store.set(setWindowModeAtom, 'tracker');
      },
      variant: 'primary',
    },
  },
};
