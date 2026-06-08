/**
 * Tip: Quick Open (Cmd+O)
 *
 * Surfaces fuzzy file open to users who haven't been triggering keyboard
 * shortcuts -- the classic discoverability gap.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import type { TipDefinition } from '../types';

const SearchIcon = <MaterialSymbol icon="search" size={16} />;

export const quickOpenTip: TipDefinition = {
  id: 'tip-quick-open',
  name: 'Quick Open Shortcut',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.APP_LAUNCH, 7) &&
      !context.hasBeenUsed(FEATURE_USAGE_KEYS.KEYBOARD_SHORTCUT_USED),
    delay: 2000,
    priority: 3,
  },
  content: {
    icon: SearchIcon,
    title: 'Cmd+O 模糊搜索打开文件',
    body: '跳过文件树。**Cmd+O** 打开工作区内所有文件的模糊搜索——输入路径片段然后回车。',
  },
};
