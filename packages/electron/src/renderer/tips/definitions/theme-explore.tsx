import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { store } from '@nimbalyst/runtime/store';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import { openSettingsCommandAtom } from '../../store/atoms/settingsNavigation';
import type { TipDefinition } from '../types';

const PaletteIcon = <MaterialSymbol icon="palette" size={16} />;

export const themeExploreTip: TipDefinition = {
  id: 'tip-theme-explore',
  name: 'Theme Exploration Suggestion',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.APP_LAUNCH, 5) &&
      !context.hasBeenUsed(FEATURE_USAGE_KEYS.THEME_CHANGED),
    delay: 2000,
    priority: 5,
  },
  content: {
    icon: PaletteIcon,
    title: '换个主题试试',
    body: '你已经用了好几次了但一直没换过外观。应用内置了多款**主题**，设置面板可以一次浏览所有选项。',
    action: {
      label: '打开主题',
      onClick: () => {
        store.set(openSettingsCommandAtom, {
          category: 'themes',
          timestamp: Date.now(),
        });
      },
      variant: 'primary',
    },
  },
};
