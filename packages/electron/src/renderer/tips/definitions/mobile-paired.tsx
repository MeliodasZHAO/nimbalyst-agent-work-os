/**
 * Tip: Mobile Pairing
 *
 * Surfaces iOS pairing to heavy desktop users who could be driving
 * sessions from their phone instead.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { store } from '@nimbalyst/runtime/store';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import { openSettingsCommandAtom } from '../../store/atoms/settingsNavigation';
import type { TipDefinition } from '../types';

const PhoneIcon = <MaterialSymbol icon="phone_iphone" size={16} />;

export const mobilePairedTip: TipDefinition = {
  id: 'tip-mobile-paired',
  name: 'Mobile Pairing',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.SESSION_CREATED, 30),
    delay: 2000,
    priority: 3,
  },
  content: {
    icon: PhoneIcon,
    title: '用手机远程控制会话',
    body: '配对 iOS 应用后，随时随地向 Mac 上的 Agent 发送指令。桌面端负责跑计算，你在沙发上或路上遥控就行。',
    action: {
      label: '打开同步设置',
      onClick: () => {
        store.set(openSettingsCommandAtom, { category: 'sync', timestamp: Date.now() });
      },
      variant: 'primary',
    },
  },
};
