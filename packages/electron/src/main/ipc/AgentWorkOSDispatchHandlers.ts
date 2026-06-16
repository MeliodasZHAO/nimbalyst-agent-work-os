/**
 * AgentWorkOSDispatchHandlers — IPC handlers for the dispatch engine.
 *
 * Exposes `agent-work-os:dispatch` for renderer/UI triggers and
 * `agent-work-os:dispatch-status` for monitoring dispatch progress.
 */

import log from 'electron-log/main';
import { BrowserWindow } from 'electron';
import { safeHandle } from '../utils/ipcRegistry';
import { dispatchTasks, type DispatchPayload, type DispatchTask } from '../services/AgentWorkOSDispatcher';
import type { DispatchPriority } from '../services/DispatchQueue';
import { WorkspaceHasNoCommitsError, GitWorktreeService } from '../services/GitWorktreeService';
import { getDatabase } from '../database/initialize';
import { createWorktreeStore } from '../services/WorktreeStore';
import { AISessionsRepository } from '@nimbalyst/runtime/storage/repositories/AISessionsRepository';
import { rowToTrackerItem } from '../mcp/tools/trackerToolHandlers';
import { archiveWorktree } from './WorktreeHandlers';
import type { DispatchResult, SelectiveMergePayload, SelectiveMergeResult } from '../../shared/ipc/types';

const logger = log.scope('AgentWorkOSDispatchHandlers');

/** Map a tracker priority string onto a dispatch scheduling priority. */
function toDispatchPriority(raw: unknown): DispatchPriority {
  const p = String(raw ?? '').toLowerCase();
  if (p === 'critical' || p === 'urgent' || p === 'high') return 'high';
  if (p === 'low' || p === 'minor') return 'low';
  return 'medium';
}

/** Build a self-contained implementation prompt from a tracker item. */
function buildTaskPrompt(item: { title?: string; description?: string }): string {
  const parts = [
    'Implement the following tracker item end-to-end in this isolated worktree.',
    '',
    `Title: ${item.title ?? '(untitled)'}`,
  ];
  if (item.description?.trim()) {
    parts.push('', 'Details:', item.description.trim());
  }
  parts.push(
    '',
    'When the work is ready for review, summarize what changed and how to verify it.',
  );
  return parts.join('\n');
}

export function registerAgentWorkOSDispatchHandlers(): void {
  /**
   * Auto-implement one or more tracker items: turn each into a dispatch task
   * that runs in its own worktree (gated by the dispatch concurrency queue).
   */
  safeHandle(
    'agent-work-os:auto-implement',
    async (
      _event,
      payload: { workspacePath: string; trackerItemId?: string; trackerItemIds?: string[] },
    ): Promise<DispatchResult> => {
      try {
        const { workspacePath } = payload;
        if (!workspacePath) throw new Error('workspacePath is required');

        const ids = payload.trackerItemIds?.length
          ? payload.trackerItemIds
          : payload.trackerItemId
            ? [payload.trackerItemId]
            : [];
        if (ids.length === 0) throw new Error('At least one trackerItemId is required');

        const db = getDatabase();
        if (!db) throw new Error('Database not initialized');

        const tasks: DispatchTask[] = [];
        const touchedItems: any[] = [];

        for (const id of ids) {
          const { rows } = await db.query<any>(
            `SELECT * FROM tracker_items WHERE id = $1 AND workspace = $2`,
            [id, workspacePath],
          );
          if (!rows[0]) {
            logger.warn('auto-implement: tracker item not found', { id });
            continue;
          }
          const item = rowToTrackerItem(rows[0]);
          tasks.push({
            title: item.title || 'Untitled task',
            prompt: buildTaskPrompt(item),
            provider: 'auto',
            priority: toDispatchPriority(item.priority),
            trackerItemId: id,
            createWorkPacket: false,
          });
          touchedItems.push(item);
        }

        if (tasks.length === 0) {
          return { success: false, dispatchId: '', tasks: [], error: 'No matching tracker items found' };
        }

        const result = await dispatchTasks({ workspacePath, tasks });

        // Mark items in-progress and refresh the kanban / tracker views.
        for (const item of touchedItems) {
          await markTrackerItemInProgress(db, item.id, workspacePath);
        }
        notifyTrackerItemsChanged(touchedItems);

        return result;
      } catch (error) {
        logger.error('auto-implement failed:', error);
        const message = error instanceof WorkspaceHasNoCommitsError
          ? error.message
          : (error instanceof Error ? error.message : 'auto-implement failed');
        return { success: false, dispatchId: '', tasks: [], error: message };
      }
    },
  );

  /**
   * Dispatch multiple tasks — each gets its own worktree, session, and prompt.
   */
  safeHandle(
    'agent-work-os:dispatch',
    async (_event, payload: DispatchPayload): Promise<DispatchResult> => {
      try {
        return await dispatchTasks(payload);
      } catch (error) {
        logger.error('Dispatch failed:', error);
        const message = error instanceof WorkspaceHasNoCommitsError
          ? error.message
          : (error instanceof Error ? error.message : 'Dispatch failed');
        return { success: false, dispatchId: '', tasks: [], error: message };
      }
    },
  );

  /**
   * Get status of a dispatch and all its child sessions.
   */
  safeHandle(
    'agent-work-os:dispatch-status',
    async (_event, dispatchId: string): Promise<{
      success: boolean;
      dispatch?: any;
      children?: any[];
      error?: string;
    }> => {
      try {
        const db = getDatabase();
        if (!db) throw new Error('Database not initialized');

        const dispatch = await AISessionsRepository.get(dispatchId);
        if (!dispatch || (dispatch as any).sessionType !== 'dispatch') {
          return { success: false, error: 'Dispatch session not found' };
        }

        const { rows: children } = await db.query<any>(
          `SELECT s.id, s.title, s.provider, s.model, s.session_type,
                  s.worktree_id, s.created_at, s.updated_at, s.metadata,
                  w.name AS worktree_name, w.branch AS worktree_branch, w.path AS worktree_path
           FROM ai_sessions s
           LEFT JOIN worktrees w ON s.worktree_id = w.id
           WHERE s.parent_session_id = $1
           ORDER BY s.created_at ASC`,
          [dispatchId],
        );

        return {
          success: true,
          dispatch: {
            id: dispatch.id,
            title: dispatch.title,
            metadata: dispatch.metadata,
            createdAt: dispatch.createdAt,
          },
          children: children.map((c: any) => ({
            sessionId: c.id,
            title: c.title,
            provider: c.provider,
            model: c.model,
            worktreeId: c.worktree_id,
            worktreeName: c.worktree_name,
            worktreeBranch: c.worktree_branch,
            worktreePath: c.worktree_path,
            createdAt: c.created_at instanceof Date ? c.created_at.getTime() : new Date(c.created_at).getTime(),
          })),
        };
      } catch (error) {
        logger.error('Failed to get dispatch status:', error);
        return { success: false, error: String(error) };
      }
    },
  );

  /**
   * List all dispatch sessions for a workspace.
   */
  safeHandle(
    'agent-work-os:dispatch-list',
    async (_event, workspacePath: string): Promise<{
      success: boolean;
      dispatches?: any[];
      error?: string;
    }> => {
      try {
        const db = getDatabase();
        if (!db) throw new Error('Database not initialized');

        const { rows } = await db.query<any>(
          `SELECT id, title, metadata, is_archived, created_at, updated_at
           FROM ai_sessions
           WHERE workspace_id = $1 AND session_type = 'dispatch'
           ORDER BY created_at DESC`,
          [workspacePath],
        );

        return {
          success: true,
          dispatches: rows.map((row: any) => {
            const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {});
            return {
              id: row.id,
              title: row.title,
              tasks: metadata.tasks ?? [],
              mergeStrategy: metadata.mergeStrategy ?? 'manual',
              isArchived: row.is_archived ?? false,
              createdAt: row.created_at instanceof Date ? row.created_at.getTime() : new Date(row.created_at).getTime(),
            };
          }),
        };
      } catch (error) {
        logger.error('Failed to list dispatches:', error);
        return { success: false, error: String(error) };
      }
    },
  );

  /**
   * Merge all worktrees from a dispatch sequentially into the base branch.
   * Order: first-created worktree merges first; subsequent ones rebase then merge.
   * Stops on first conflict and reports which worktree conflicted.
   */
  safeHandle(
    'agent-work-os:dispatch-merge',
    async (_event, dispatchId: string, workspacePath: string): Promise<{
      success: boolean;
      mergedCount?: number;
      totalCount?: number;
      conflictedWorktree?: string;
      conflictedFiles?: string[];
      error?: string;
    }> => {
      try {
        if (!dispatchId) throw new Error('dispatchId is required');
        if (!workspacePath) throw new Error('workspacePath is required');

        const db = getDatabase();
        if (!db) throw new Error('Database not initialized');

        const gitWorktreeService = new GitWorktreeService();
        const worktreeStore = createWorktreeStore(db);

        // Get child sessions ordered by creation time
        const { rows: children } = await db.query<any>(
          `SELECT s.id, s.title, s.worktree_id,
                  w.path AS worktree_path, w.name AS worktree_name, w.branch AS worktree_branch
           FROM ai_sessions s
           JOIN worktrees w ON s.worktree_id = w.id
           WHERE s.parent_session_id = $1
           ORDER BY s.created_at ASC`,
          [dispatchId],
        );

        if (children.length === 0) {
          return { success: false, error: 'No child worktrees found' };
        }

        let mergedCount = 0;

        for (const child of children) {
          // Rebase onto latest base (except the first one, which is already up-to-date)
          if (mergedCount > 0) {
            const worktree = await worktreeStore.getByPath(child.worktree_path);
            if (worktree) {
              const rebaseResult = await gitWorktreeService.rebaseFromBase(
                child.worktree_path,
                worktree.baseBranch,
              );
              if (!rebaseResult.success) {
                return {
                  success: false,
                  mergedCount,
                  totalCount: children.length,
                  conflictedWorktree: child.worktree_name,
                  conflictedFiles: rebaseResult.conflictedFiles,
                  error: `Rebase conflict in ${child.worktree_name}: ${rebaseResult.message}`,
                };
              }
            }
          }

          // Merge to main
          const mergeResult = await gitWorktreeService.mergeToMain(child.worktree_path, workspacePath);
          if (!mergeResult.success) {
            return {
              success: false,
              mergedCount,
              totalCount: children.length,
              conflictedWorktree: child.worktree_name,
              conflictedFiles: mergeResult.conflictedFiles,
              error: `Merge conflict in ${child.worktree_name}: ${mergeResult.message}`,
            };
          }

          mergedCount++;
          logger.info('Dispatch merge progress', {
            dispatchId,
            mergedCount,
            totalCount: children.length,
            worktree: child.worktree_name,
          });
        }

        // All merged — archive all worktrees
        for (const child of children) {
          if (child.worktree_id) {
            await archiveWorktree(child.worktree_id, workspacePath);
          }
        }

        // Mark dispatch as archived
        await AISessionsRepository.updateMetadata(dispatchId, { isArchived: true } as any);

        // Notify renderer
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send('dispatch:merge-complete', { dispatchId, workspacePath, mergedCount });
          }
        }

        logger.info('Dispatch merge completed', { dispatchId, mergedCount });
        return { success: true, mergedCount, totalCount: children.length };
      } catch (error) {
        logger.error('Dispatch merge failed:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  /**
   * Archive a dispatch and all its child worktrees.
   */
  safeHandle(
    'agent-work-os:dispatch-archive',
    async (_event, dispatchId: string, workspacePath: string): Promise<{
      success: boolean;
      error?: string;
    }> => {
      try {
        if (!dispatchId) throw new Error('dispatchId is required');
        if (!workspacePath) throw new Error('workspacePath is required');

        const db = getDatabase();
        if (!db) throw new Error('Database not initialized');

        const { rows: children } = await db.query<{ id: string; worktree_id: string }>(
          `SELECT id, worktree_id FROM ai_sessions WHERE parent_session_id = $1`,
          [dispatchId],
        );

        const archivedWorktreeIds = new Set<string>();
        for (const child of children) {
          if (child.worktree_id && !archivedWorktreeIds.has(child.worktree_id)) {
            archivedWorktreeIds.add(child.worktree_id);
            await archiveWorktree(child.worktree_id, workspacePath);
          }
        }

        await AISessionsRepository.updateMetadata(dispatchId, { isArchived: true } as any);

        logger.info('Dispatch archived', { dispatchId, worktreeCount: archivedWorktreeIds.size });
        return { success: true };
      } catch (error) {
        logger.error('Failed to archive dispatch:', error);
        return { success: false, error: String(error) };
      }
    },
  );

  /**
   * Selective merge: merge chosen worktree branches onto a new branch.
   */
  safeHandle(
    'agent-work-os:dispatch-selective-merge',
    async (_event, payload: SelectiveMergePayload): Promise<SelectiveMergeResult> => {
      try {
        const { selectedWorktreeIds, newBranchName, baseBranch, workspacePath } = payload;

        if (!selectedWorktreeIds?.length) throw new Error('No worktrees selected');
        if (!newBranchName?.trim()) throw new Error('Branch name is required');
        if (!workspacePath) throw new Error('workspacePath is required');

        const db = getDatabase();
        if (!db) throw new Error('Database not initialized');

        const gitWorktreeService = new GitWorktreeService();

        // Resolve worktree IDs to branch names (preserve selection order)
        const branches: string[] = [];
        for (const wtId of selectedWorktreeIds) {
          const { rows } = await db.query<{ branch: string }>(
            `SELECT branch FROM worktrees WHERE id = $1`,
            [wtId],
          );
          if (rows[0]?.branch) {
            branches.push(rows[0].branch);
          } else {
            return { success: false, mergedCount: 0, totalCount: selectedWorktreeIds.length, commitCount: 0, error: `Worktree ${wtId} not found` };
          }
        }

        const result = await gitWorktreeService.selectiveMergeToBranch(
          workspacePath,
          branches,
          newBranchName.trim(),
          baseBranch,
        );

        logger.info('Selective merge completed', { ...result, workspacePath });
        return result;
      } catch (error) {
        logger.error('Selective merge failed:', error);
        return {
          success: false,
          mergedCount: 0,
          totalCount: payload?.selectedWorktreeIds?.length || 0,
          commitCount: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}

/**
 * Set a tracker item's status to in-progress via a defensive read-modify-write
 * of its data JSON. (data->'key' diverges between PGLite and SQLite, so we read
 * the whole data column and parse it.)
 */
async function markTrackerItemInProgress(
  db: { query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }> },
  itemId: string,
  workspacePath: string,
): Promise<void> {
  try {
    const { rows } = await db.query<{ data: any }>(
      `SELECT data FROM tracker_items WHERE id = $1 AND workspace = $2`,
      [itemId, workspacePath],
    );
    if (!rows[0]) return;
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : (rows[0].data ?? {});
    data.status = 'in-progress';
    await db.query(
      `UPDATE tracker_items SET data = $1, updated = NOW() WHERE id = $2 AND workspace = $3`,
      [JSON.stringify(data), itemId, workspacePath],
    );
  } catch (error) {
    logger.warn('Failed to mark tracker item in-progress', { itemId, error });
  }
}

/** Broadcast a tracker-items-changed event so open kanban/tracker views refresh. */
function notifyTrackerItemsChanged(items: any[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('document-service:tracker-items-changed', {
        added: [],
        updated: items,
        removed: [],
        timestamp: new Date(),
      });
    }
  }
}
