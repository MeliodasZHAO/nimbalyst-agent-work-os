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
import { AnalyticsService } from './analytics/AnalyticsService';
import { routeWorkPacket } from '@nimbalyst/runtime/agent-work-os/routeWorkPacket';
import type { DispatchResult, DispatchTaskResult } from '../../shared/ipc/types';

const logger = log.scope('AgentWorkOSDispatcher');

const MAX_DISPATCH_WORKTREES = 8;

export interface DispatchTask {
  title: string;
  prompt: string;
  provider: 'claude-code' | 'openai-codex' | 'auto';
  model?: string;
  complexity?: 'tiny' | 'small' | 'medium' | 'large';
  createWorkPacket?: boolean;
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

  const worktreeStore = createWorktreeStore(db);

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

  // 2. Gather existing names for worktree de-duplication
  const [dbNames, filesystemNames, branchNames] = await Promise.all([
    worktreeStore.getAllNames(),
    Promise.resolve(gitWorktreeService.getExistingWorktreeDirectories(workspacePath)),
    gitWorktreeService.getAllBranchNames(workspacePath),
  ]);

  const existingNames = new Set<string>();
  for (const n of dbNames) existingNames.add(n);
  for (const n of filesystemNames) existingNames.add(n);
  for (const n of branchNames) existingNames.add(n);

  // 3. Create worktrees and sessions serially (git ops need serialization)
  const taskResults: DispatchTaskResult[] = [];
  const sessionIds: string[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    try {
      const worktreeName = gitWorktreeService.generateUniqueWorktreeName(existingNames);
      existingNames.add(worktreeName);

      const gitWorktree = await gitWorktreeService.createWorktree(workspacePath, { name: worktreeName });
      await worktreeStore.create(gitWorktree);

      const { provider, model } = resolveProvider(task);
      const sessionId = crypto.randomUUID();

      await AISessionsRepository.create({
        id: sessionId,
        provider,
        model,
        sessionType: 'session',
        title: task.title,
        workspaceId: workspacePath,
        worktreeId: gitWorktree.id,
        parentSessionId: dispatchId,
      });

      // Set initial phase so dispatch children appear in the kanban "Implementing" column
      await AISessionsRepository.updateMetadata(sessionId, { phase: 'implementing' } as any);

      sessionIds.push(sessionId);

      // Queue the task-specific prompt
      try {
        const queueStore = getQueuedPromptsStore();
        await queueStore.create({
          id: `dispatch-prompt-${dispatchId}-${sessionId}`,
          sessionId,
          prompt: task.prompt.trim(),
        });
      } catch (queueError) {
        logger.error('Failed to queue prompt for dispatch task', { dispatchId, sessionId, error: queueError });
      }

      // Optionally create Work Packet tracker item
      let workPacketId: string | undefined;
      if (task.createWorkPacket) {
        workPacketId = await createWorkPacketForTask(db, task, sessionId, workspacePath);
      }

      taskResults.push({
        title: task.title,
        sessionId,
        worktreeId: gitWorktree.id,
        worktreePath: gitWorktree.path,
        worktreeBranch: gitWorktree.branch,
        provider: `${provider}:${model}`,
        workPacketId,
        status: 'queued',
      });

      logger.info('Dispatch task created', {
        dispatchId,
        taskIndex: i + 1,
        totalTasks: tasks.length,
        title: task.title,
        worktreeName: gitWorktree.name,
        provider,
        model,
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

  // 4. Notify renderer to start processing queued prompts
  for (const sessionId of sessionIds) {
    emitDispatchEvent('dispatch:session-ready', {
      dispatchId,
      sessionId,
      workspacePath,
    });
  }

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
    await db.query(
      `INSERT INTO tracker_session_links (tracker_item_id, session_id, workspace, linked_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [id, sessionId, workspacePath, now],
    );

    return id;
  } catch (error) {
    logger.warn('Failed to create work packet for dispatch task', { title: task.title, error });
    return undefined;
  }
}
