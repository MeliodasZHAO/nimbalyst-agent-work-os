/**
 * PreviewHandlers — IPC for per-worktree dev-server previews.
 *
 * Thin wrappers over PreviewServerManager (the single source of truth). The
 * renderer starts/stops previews and reads live state; state changes are pushed
 * back via the `preview:state-changed` event (see PreviewServerManager.broadcast).
 */

import log from 'electron-log/main';
import { safeHandle } from '../utils/ipcRegistry';
import {
  getPreviewServerManager,
  getPreviewLogs,
  type PreviewState,
} from '../services/PreviewServerManager';

const logger = log.scope('PreviewHandlers');

export function registerPreviewHandlers(): void {
  safeHandle(
    'preview:start',
    async (_event, worktreeId: string, worktreePath: string): Promise<PreviewState> => {
      if (!worktreeId) throw new Error('worktreeId is required');
      if (!worktreePath) throw new Error('worktreePath is required');
      return getPreviewServerManager().start(worktreeId, worktreePath);
    },
  );

  safeHandle('preview:stop', async (_event, worktreeId: string): Promise<void> => {
    if (!worktreeId) throw new Error('worktreeId is required');
    await getPreviewServerManager().stop(worktreeId);
  });

  safeHandle(
    'preview:get-state',
    async (_event, worktreeId: string): Promise<PreviewState | null> => {
      if (!worktreeId) throw new Error('worktreeId is required');
      return getPreviewServerManager().getState(worktreeId) ?? null;
    },
  );

  safeHandle('preview:list', async (): Promise<PreviewState[]> => {
    return getPreviewServerManager().listStates();
  });

  safeHandle(
    'preview:set-name',
    async (_event, worktreeId: string, name: string): Promise<void> => {
      if (!worktreeId) throw new Error('worktreeId is required');
      await getPreviewServerManager().setName(worktreeId, name ?? '');
    },
  );

  safeHandle('preview:get-logs', async (_event, worktreeId: string): Promise<string[]> => {
    if (!worktreeId) throw new Error('worktreeId is required');
    return getPreviewLogs(worktreeId);
  });

  logger.info('[PreviewHandlers] Preview IPC handlers registered');
}
