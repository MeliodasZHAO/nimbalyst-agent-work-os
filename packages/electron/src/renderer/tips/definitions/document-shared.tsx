/**
 * Tip: Shared Document Links
 *
 * Surfaces the shared-document feature to active document creators who may
 * still be emailing markdown files around.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { store } from '@nimbalyst/runtime/store';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import { openSettingsCommandAtom } from '../../store/atoms/settingsNavigation';
import type { TipDefinition } from '../types';

const LinkIcon = <MaterialSymbol icon="link" size={16} />;

export const documentSharedTip: TipDefinition = {
  id: 'tip-document-shared',
  name: 'Shared Document Links',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.FILE_CREATED, 20),
    delay: 2000,
    priority: 3,
  },
  content: {
    icon: LinkIcon,
    title: '一个链接分享文档',
    body: '右键点击文件并选择 **分享**，即可发布一个端到端加密的链接。接收者在浏览器中打开即可查看——无需 Nimbalyst 账户。',
    action: {
      label: '管理共享链接',
      onClick: () => {
        store.set(openSettingsCommandAtom, { category: 'shared-links', timestamp: Date.now() });
      },
      variant: 'primary',
    },
  },
};
