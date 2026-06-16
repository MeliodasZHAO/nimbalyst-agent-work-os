/**
 * AgentWorkOSDispatcher — core dispatch engine for parallel task execution.
 *
 * Extends the Blitz model: instead of one prompt across N worktrees,
 * each task gets its own prompt and provider assignment. Worktrees are
 * created serially (git needs serialization), sessions run in parallel.
 */

import { BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { GitWorktreeService, WorkspaceHasNoCommitsError } from './GitWorktreeService';
import { createWorktreeStore } from './WorktreeStore';
import { getDatabase } from '../database/initialize';
import { getQueuedPromptsStore } from './RepositoryManager';
import { AISessionsRepository } from '@nimbalyst/runtime/storage/repositories/AISessionsRepository';
import { ModelIdentifier, type AIProviderType } from '@nimbalyst/runtime/ai/server/types';
import type { EffortLevel } from '@nimbalyst/runtime/ai/server/effortLevels';
import { AnalyticsService } from './analytics/AnalyticsService';
import { routeWorkPacket } from '@nimbalyst/runtime/agent-work-os/routeWorkPacket';
import {
  getDispatchQueue,
  setDispatchMaterializer,
  setDispatchSettleHandler,
  type QueueEntry,
  type DispatchPriority,
  type SettleEventType,
} from './DispatchQueue';
import { deriveDispatchTitle } from './dispatchTitle';
import { applySessionMetadataUpdate, requestSessionListRefresh } from './sessionMetadataBroadcast';
import type { DispatchResult, DispatchTaskResult } from '../../shared/ipc/types';

const logger = log.scope('AgentWorkOSDispatcher');

const MAX_DISPATCH_WORKTREES = 8;

export interface DispatchTask {
  title: string;
  prompt: string;
  provider: 'claude-code' | 'openai-codex' | 'auto';
  model?: string;
  complexity?: 'tiny' | 'small' | 'medium' | 'large';
  /** Reasoning effort for the child session (written to metadata.effortLevel). */
  effortLevel?: EffortLevel;
  createWorkPacket?: boolean;
  /** Scheduling priority; controls dequeue order when over the concurrency limit. */
  priority?: DispatchPriority;
  /** Tracker item this task was launched from (for linking). */
  trackerItemId?: string;
}

/**
 * Heavy per-session data the queue needs at materialize time. Kept here (not on
 * the lean QueueEntry) so the dispatcher owns worktree/session creation.
 */
interface PendingMaterialization {
  workspacePath: string;
  task: DispatchTask;
  provider: AIProviderType;
  model: string;
  dispatchId: string;
}

const pendingMaterializations = new Map<string, PendingMaterialization>();

let materializerRegistered = false;

/** Register the queue's materialize + settle callbacks once. */
function ensureMaterializerRegistered(): void {
  if (materializerRegistered) return;
  materializerRegistered = true;
  setDispatchMaterializer(materializeDispatchSession);
  setDispatchSettleHandler((entry, eventType) => {
    void handleDispatchSettled(entry, eventType);
  });
}

/**
 * Advance a dispatch child's kanban phase when its session settles.
 *
 * On successful completion we move it to `validating` (ready for the user to
 * review) — never `complete`; only the user promotes work to done. We
 * deliberately do NOT touch error/interrupted sessions (they stay where they
 * are so the stall is visible), and we leave a session alone if the agent has
 * already advanced it to validating/complete itself.
 */
async function handleDispatchSettled(entry: QueueEntry, eventType: SettleEventType): Promise<void> {
  if (eventType !== 'session:completed') return;
  try {
    const session = await AISessionsRepository.get(entry.sessionId);
    const currentPhase = (session?.metadata as any)?.phase;
    if (currentPhase === 'validating' || currentPhase === 'complete') return;
    await applySessionMetadataUpdate(entry.sessionId, { phase: 'validating' });
  } catch (error) {
    logger.warn('Failed to advance settled dispatch session to validating', {
      sessionId: entry.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Build the worktree, link it to the (already-created) child session, queue the
 * task prompt, and tell the renderer to start running it. Runs serialized by the
 * queue (git worktree creation must not race).
 */
async function materializeDispatchSession(entry: QueueEntry): Promise<void> {
  const pending = pendingMaterializations.get(entry.sessionId);
  if (!pending) {
    throw new Error(`No pending materialization for session ${entry.sessionId}`);
  }

  const db = getDatabase();
  if (!db) throw new Error('Database not initialized');

  const { workspacePath, task, dispatchId } = pending;
  const gitWorktreeService = new GitWorktreeService();
  const worktreeStore = createWorktreeStore(db);

  // Re-gather existing names fresh each time. Materialize is serialized by the
  // queue, so there is no race — this avoids a stale cross-call name set.
  const [dbNames, filesystemNames, branchNames] = await Promise.all([
    worktreeStore.getAllNames(),
    Promise.resolve(gitWorktreeService.getExistingWorktreeDirectories(workspacePath)),
    gitWorktreeService.getAllBranchNames(workspacePath),
  ]);
  const existingNames = new Set<string>([...dbNames, ...filesystemNames, ...branchNames]);

  const worktreeName = gitWorktreeService.generateUniqueWorktreeName(existingNames);
  const gitWorktree = await gitWorktreeService.createWorktree(workspacePath, { name: worktreeName });
  await worktreeStore.create(gitWorktree);

  // Link the worktree to the child session row created at enqueue time.
  await db.query('UPDATE ai_sessions SET worktree_id = $1 WHERE id = $2', [
    gitWorktree.id,
    entry.sessionId,
  ]);

  // Queue the task-specific prompt (deferred until now so a queued-but-not-yet
  // -running session cannot have its prompt processed early).
  try {
    const queueStore = getQueuedPromptsStore();
    await queueStore.create({
      id: `dispatch-prompt-${dispatchId}-${entry.sessionId}`,
      sessionId: entry.sessionId,
      prompt: task.prompt.trim(),
    });
  } catch (queueError) {
    logger.error('Failed to queue prompt for dispatch task', {
      dispatchId,
      sessionId: entry.sessionId,
      error: queueError,
    });
  }

  pendingMaterializations.delete(entry.sessionId);

  // The task is leaving the queue and about to run — move it off the 排队中
  // column into 实现中. Persists phase + broadcasts so the kanban card moves.
  await applySessionMetadataUpdate(entry.sessionId, { phase: 'implementing' });

  // Tell the renderer to start processing the queued prompt.
  emitDispatchEvent('dispatch:session-ready', {
    dispatchId,
    sessionId: entry.sessionId,
    workspacePath,
  });

  logger.info('Dispatch task materialized', {
    dispatchId,
    sessionId: entry.sessionId,
    worktreeName: gitWorktree.name,
  });
}

export interface DispatchPayload {
  workspacePath: string;
  tasks: DispatchTask[];
  mergeStrategy?: 'manual' | 'sequential-auto';
  parentSessionId?: string;
}

function resolveProvider(task: DispatchTask): { provider: AIProviderType; model: string; routingNotes?: string[] } {
  if (task.model) {
    const parsed = ModelIdentifier.tryParse(task.model);
    if (parsed) {
      return { provider: parsed.provider, model: task.model };
    }
  }

  if (task.provider === 'auto') {
    // Smart routing: analyze task prompt to pick the best provider
    const route = routeWorkPacket({
      complexity: task.complexity || 'medium',
      risks: task.prompt,
    });

    const providerMap: Record<string, { provider: AIProviderType; model: string }> = {
      'codex': { provider: 'openai-codex', model: 'openai-codex:codex-mini' },
      'claude-code': { provider: 'claude-code', model: 'claude-code:opus' },
    };

    const resolved = providerMap[route.provider] || providerMap['claude-code'];
    return { ...resolved, routingNotes: route.routingNotes };
  }

  switch (task.provider) {
    case 'claude-code':
      return { provider: 'claude-code', model: task.model || 'claude-code:opus' };
    case 'openai-codex':
      return { provider: 'openai-codex', model: task.model || 'openai-codex:codex-mini' };
    default:
      return { provider: 'claude-code', model: task.model || 'claude-code:opus' };
  }
}

function emitDispatchEvent(channel: string, payload: Record<string, unknown>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

export async function dispatchTasks(payload: DispatchPayload): Promise<DispatchResult> {
  const startTime = Date.now();
  const { workspacePath, tasks, mergeStrategy, parentSessionId } = payload;

  if (!workspacePath) {
    throw new Error('workspacePath is required');
  }
  if (!tasks || tasks.length === 0) {
    throw new Error('At least one task is required');
  }
  if (tasks.length > MAX_DISPATCH_WORKTREES) {
    throw new Error(`Task count (${tasks.length}) exceeds maximum of ${MAX_DISPATCH_WORKTREES}`);
  }

  const gitWorktreeService = new GitWorktreeService();
  await gitWorktreeService.validateWorkspaceHasCommits(workspacePath);

  const db = getDatabase();
  if (!db) {
    throw new Error('Database not initialized');
  }

  ensureMaterializerRegistered();
  const queue = getDispatchQueue();

  // 1. Create dispatch parent session
  const dispatchId = crypto.randomUUID();

  await AISessionsRepository.create({
    id: dispatchId,
    provider: 'system',
    sessionType: 'dispatch',
    title: `Dispatch (${tasks.length} tasks)`,
    workspaceId: workspacePath,
    parentSessionId: parentSessionId || undefined,
    metadata: {
      tasks: tasks.map(t => ({ title: t.title, provider: t.provider, complexity: t.complexity })),
      mergeStrategy: mergeStrategy || 'manual',
    },
  } as any);

  logger.info('Dispatch session created', { dispatchId, taskCount: tasks.length });

  // 2. Create a child session row per task NOW (phase=queued) so every task is
  //    visible on the kanban immediately, even while waiting for a slot. The
  //    worktree + prompt + session-ready are deferred to materialize (gated by
  //    the queue's concurrency limit).
  const taskResults: DispatchTaskResult[] = [];
  const entries: QueueEntry[] = [];
  const now = Date.now();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    try {
      const { provider, model } = resolveProvider(task);
      const sessionId = crypto.randomUUID();
      const title = deriveDispatchTitle({ agentTitle: task.title, taskDescription: task.prompt });

      await AISessionsRepository.create({
        id: sessionId,
        provider,
        model,
        sessionType: 'session',
        title,
        workspaceId: workspacePath,
        parentSessionId: dispatchId,
      });

      // phase=queued so dispatch children appear on the kanban (排队中) before
      // they run. Must go through applySessionMetadataUpdate: a bare
      // { phase } payload to updateMetadata is a silent no-op (it only writes
      // the metadata JSON blob when the payload has a `metadata` sub-object).
      // effortLevel rides along in the SAME write so AIService picks it up at
      // session init (CLAUDE_CODE_EFFORT_LEVEL / Codex effort) — only set when
      // the agent assessed a non-default difficulty.
      await applySessionMetadataUpdate(sessionId, {
        phase: 'queued',
        ...(task.effortLevel ? { effortLevel: task.effortLevel } : {}),
      });

      // Optionally create a Work Packet tracker item (worktree-independent).
      let workPacketId: string | undefined;
      if (task.createWorkPacket) {
        workPacketId = await createWorkPacketForTask(db, { ...task, title }, sessionId, workspacePath);
      }

      // Link an existing tracker item (auto-implement path) if provided.
      if (task.trackerItemId) {
        await linkTrackerItemToSession(db, task.trackerItemId, sessionId, workspacePath);
      }

      pendingMaterializations.set(sessionId, { workspacePath, task: { ...task, title }, provider, model, dispatchId });

      entries.push({
        sessionId,
        dispatchId,
        workspacePath,
        priority: task.priority ?? 'medium',
        enqueuedAt: now + i, // preserve submit order within a batch
        trackerItemId: task.trackerItemId,
      });

      taskResults.push({
        title,
        sessionId,
        worktreeId: '',
        worktreePath: '',
        worktreeBranch: '',
        provider: `${provider}:${model}`,
        workPacketId,
        status: 'queued',
      });
    } catch (taskError) {
      const errorMsg = taskError instanceof Error ? taskError.message : String(taskError);
      logger.error(`Dispatch task ${i + 1}/${tasks.length} failed`, { dispatchId, title: task.title, error: errorMsg });

      taskResults.push({
        title: task.title,
        sessionId: '',
        worktreeId: '',
        worktreePath: '',
        worktreeBranch: '',
        provider: task.provider,
        status: 'failed',
        error: errorMsg,
      });
    }
  }

  // 3. Hand the entries to the queue — it materializes up to maxConcurrent and
  //    promotes the rest by priority as running sessions settle.
  queue.enqueue(entries);

  // The child + parent rows were created directly in the DB; there is no
  // sessions:session-created listener, so ask the renderer to re-query its
  // session list. Without this the new cards never enter the registry and the
  // kanban stays empty until some unrelated refresh fires.
  requestSessionListRefresh(workspacePath);

  emitDispatchEvent('dispatch:created', { dispatchId, workspacePath });

  const successCount = taskResults.filter(r => r.status === 'queued').length;
  const duration = Date.now() - startTime;

  logger.info('Dispatch completed', {
    dispatchId,
    successCount,
    failCount: taskResults.length - successCount,
    durationMs: duration,
  });

  AnalyticsService.getInstance().sendEvent('dispatch_created', {
    task_count: tasks.length,
    success_count: successCount,
    merge_strategy: mergeStrategy || 'manual',
    duration_ms: duration,
  });

  if (successCount === 0) {
    return {
      success: false,
      dispatchId,
      tasks: taskResults,
      error: taskResults[0]?.error || 'No tasks could be dispatched',
    };
  }

  return { success: true, dispatchId, tasks: taskResults };
}

async function createWorkPacketForTask(
  db: { query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }> },
  task: DispatchTask,
  sessionId: string,
  workspacePath: string,
): Promise<string | undefined> {
  try {
    const id = crypto.randomUUID();
    const now = new Date();
    const data = JSON.stringify({
      complexity: task.complexity || 'medium',
      prompt: task.prompt.slice(0, 500),
      linkedSessionId: sessionId,
    });

    await db.query(
      `INSERT INTO tracker_items (id, workspace, type, title, status, priority, data, created, updated)
       VALUES ($1, $2, 'work-packet', $3, 'in-progress', 'medium', $4, $5, $5)`,
      [id, workspacePath, task.title, data, now],
    );

    // Link session to tracker item
    await linkTrackerItemToSession(db, id, sessionId, workspacePath);

    return id;
  } catch (error) {
    logger.warn('Failed to create work packet for dispatch task', { title: task.title, error });
    return undefined;
  }
}

/** Insert a tracker_item ↔ session link (idempotent). */
async function linkTrackerItemToSession(
  db: { query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }> },
  trackerItemId: string,
  sessionId: string,
  workspacePath: string,
): Promise<void> {
  await db.query(
    `INSERT INTO tracker_session_links (tracker_item_id, session_id, workspace, linked_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [trackerItemId, sessionId, workspacePath, new Date()],
  );
}
