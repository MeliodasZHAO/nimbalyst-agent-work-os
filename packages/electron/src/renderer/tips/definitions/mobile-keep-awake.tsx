/**
 * Tip: Mobile Keep-Awake
 *
 * Shows when user has sync enabled but preventSleepMode is 'off',
 * suggesting they enable keep-awake so their computer doesn't sleep
 * while mobile sync is active.
 */

import React from 'react';
import { store } from '@nimbalyst/runtime/store';
import { syncConfigAtom, setSyncConfigAtom } from '../../store/atoms/appSettings';
import { openSettingsCommandAtom } from '../../store/atoms/settingsNavigation';
import type { TipDefinition } from '../types';

const PowerIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
);

export const mobileKeepAwakeTip: TipDefinition = {
  id: 'tip-mobile-keep-awake',
  name: 'Mobile Keep-Awake Suggestion',
  version: 1,
  trigger: {
    screen: '*',
    condition: () => {
      const syncConfig = store.get(syncConfigAtom);
      return (
        syncConfig.enabled &&
        (syncConfig.preventSleepMode === 'off' || !syncConfig.preventSleepMode)
      );
    },
    delay: 3000,
    priority: 10,
  },
  content: {
    icon: PowerIcon,
    title: 'Keep your computer awake for mobile prompts',
    titleKey: 'keepAwakeTitle',
    body: 'When your computer sleeps it disconnects mobile sync. Keep it awake while plugged in to avoid this.',
    bodyKey: 'keepAwakeBody',
    action: {
      label: 'Enable Keep-Awake',
      labelKey: 'enableKeepAwake',
      onClick: () => {
        window.electronAPI.invoke('sync:set-prevent-sleep', 'pluggedIn');
        // Update local atom so the condition immediately reflects the change
        // setSyncConfigAtom does a partial merge internally
        store.set(setSyncConfigAtom, { preventSleepMode: 'pluggedIn' });
      },
      variant: 'primary',
    },
    secondaryAction: {
      label: 'Sync Settings',
      labelKey: 'syncSettings',
      onClick: () => {
        store.set(openSettingsCommandAtom, { category: 'sync', timestamp: Date.now() });
      },
      variant: 'link',
    },
  },
};
