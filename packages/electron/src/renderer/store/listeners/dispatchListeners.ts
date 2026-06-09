/**
 * Central Dispatch Listeners
 *
 * Subscribes to dispatch-related IPC events ONCE and routes them to atoms.
 *
 * Events handled:
 * - `dispatch:created`       -> dispatchCreatedAtom
 * - `dispatch:session-ready` -> triggers queue processing for the new session
 *
 * Call initDispatchListeners() once at app startup.
 */

import { store } from '@nimbalyst/runtime/store';
import { dispatchCreatedAtom } from '../atoms/dispatch';

let initialized = false;

export function initDispatchListeners(): () => void {
  if (initialized) {
    return () => {};
  }
  initialized = true;

  const cleanups: Array<() => void> = [];
  let createdVersion = 0;

  const u1 = window.electronAPI?.on?.(
    'dispatch:created',
    (data: { dispatchId: string; workspacePath: string }) => {
      if (!data?.dispatchId || !data.workspacePath) return;
      createdVersion += 1;
      store.set(dispatchCreatedAtom, {
        version: createdVersion,
        payload: { dispatchId: data.dispatchId, workspacePath: data.workspacePath },
      });
    },
  );
  if (typeof u1 === 'function') cleanups.push(u1);

  // Auto-start dispatch sessions: when a dispatch child session is ready,
  // trigger queue processing so its queued prompt gets executed immediately
  // (without needing the user to open the session in a panel).
  const u2 = window.electronAPI?.on?.(
    'dispatch:session-ready',
    (data: { dispatchId: string; sessionId: string; workspacePath: string }) => {
      if (!data?.sessionId || !data.workspacePath) return;
      window.electronAPI.invoke('ai:triggerQueueProcessing', data.sessionId, data.workspacePath)
        .catch((err: any) => {
          console.error('[dispatchListeners] Failed to trigger queue processing for dispatch session:', data.sessionId, err);
        });
    },
  );
  if (typeof u2 === 'function') cleanups.push(u2);

  return () => {
    initialized = false;
    cleanups.forEach((fn) => fn?.());
  };
}
