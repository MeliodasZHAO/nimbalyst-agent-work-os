/**
 * Central Preview Listeners
 *
 * Subscribes to the per-worktree dev-server preview events ONCE and routes them
 * into the previewStateAtomFamily. Components read the atom for their worktree
 * instead of subscribing to IPC directly.
 *
 * Events handled:
 * - `preview:state-changed` -> previewStateAtomFamily(worktreeId)
 *
 * Also hydrates initial state from `preview:list` so previews that were already
 * running (e.g. after a renderer reload) show up immediately.
 *
 * Call initPreviewListeners() once at app startup.
 */

import { store } from '@nimbalyst/runtime/store';
import { previewStateAtomFamily, type PreviewStateView } from '../atoms/worktrees';

let initialized = false;

export function initPreviewListeners(): () => void {
  if (initialized) {
    return () => {};
  }
  initialized = true;

  const cleanups: Array<() => void> = [];

  const apply = (state: PreviewStateView | null | undefined) => {
    if (!state?.worktreeId) return;
    store.set(previewStateAtomFamily(state.worktreeId), state);
  };

  const unsub = window.electronAPI?.on?.('preview:state-changed', (data: PreviewStateView) => {
    apply(data);
  });
  if (typeof unsub === 'function') cleanups.push(unsub);

  // Hydrate any previews already running in the main process.
  window.electronAPI
    ?.previewList?.()
    .then((states: PreviewStateView[]) => {
      if (Array.isArray(states)) states.forEach(apply);
    })
    .catch(() => {
      // Best-effort hydration; the live event stream keeps state fresh anyway.
    });

  return () => {
    initialized = false;
    cleanups.forEach((fn) => fn?.());
  };
}
