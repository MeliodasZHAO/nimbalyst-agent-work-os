import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import { dialogRef } from '../../contexts/DialogContext';
import { DIALOG_IDS } from '../../dialogs/registry';
import type { TipDefinition } from '../types';

const KeyboardIcon = <MaterialSymbol icon="keyboard_command_key" size={16} />;

export const keyboardShortcutsTip: TipDefinition = {
  id: 'tip-keyboard-shortcuts',
  name: 'Keyboard Shortcuts Suggestion',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.APP_LAUNCH, 7) &&
      !context.hasBeenUsed(FEATURE_USAGE_KEYS.KEYBOARD_SHORTCUT_USED),
    delay: 2000,
    priority: 6,
  },
  content: {
    icon: KeyboardIcon,
    title: '学习常用快捷键',
    body: '你已经用了一段时间了，但还没触发过任何快捷键。快捷键对话框能帮你快速找到最实用的那些。',
    action: {
      label: '打开快捷键',
      onClick: () => {
        dialogRef.current?.open(DIALOG_IDS.KEYBOARD_SHORTCUTS, {});
      },
      variant: 'primary',
    },
  },
};
