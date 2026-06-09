/**
 * MCP tool handlers for Agent Work OS dispatch.
 *
 * Exposes `agent_work_os_dispatch` so any AI agent can trigger parallel
 * task execution from within a session conversation.
 */

import { dispatchTasks, type DispatchTask } from '../../services/AgentWorkOSDispatcher';
import type { DispatchResult } from '../../../shared/ipc/types';

type McpToolResult = {
  content: Array<{ type: string; text?: string }>;
  isError: boolean;
};

export const agentWorkOSToolSchemas = [
  {
    name: 'agent_work_os_dispatch',
    description:
      'Dispatch multiple tasks for parallel execution. Each task gets its own git worktree and AI session with an independent prompt. Use this when the user asks to do multiple things at once, or when tasks are independent and can run in parallel.',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Array of tasks to dispatch in parallel.',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Short title for this task (shown in UI).',
              },
              prompt: {
                type: 'string',
                description: 'The full prompt/instructions for this task. Be specific — each task runs in its own isolated session.',
              },
              provider: {
                type: 'string',
                enum: ['claude-code', 'openai-codex', 'auto'],
                description: 'Which AI provider to use. "auto" picks based on task type.',
              },
              model: {
                type: 'string',
                description: 'Optional specific model ID (e.g. "claude-code:opus", "openai-codex:codex-mini").',
              },
              complexity: {
                type: 'string',
                enum: ['tiny', 'small', 'medium', 'large'],
                description: 'Estimated task complexity. Affects resource allocation.',
              },
              createWorkPacket: {
                type: 'boolean',
                description: 'If true, creates a Work Packet tracker item linked to the session.',
              },
            },
            required: ['title', 'prompt'],
          },
          minItems: 1,
          maxItems: 8,
        },
        mergeStrategy: {
          type: 'string',
          enum: ['manual', 'sequential-auto'],
          description: 'How to merge results when all tasks complete. "manual" (default) waits for user. "sequential-auto" merges in order automatically.',
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'agent_work_os_dispatch_status',
    description: 'Get the status of a previously dispatched batch of tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        dispatchId: {
          type: 'string',
          description: 'The dispatch ID returned from agent_work_os_dispatch.',
        },
      },
      required: ['dispatchId'],
    },
  },
  {
    name: 'agent_work_os_dispatch_merge',
    description: 'Merge all completed dispatch task worktrees sequentially into the base branch. Stops on first conflict.',
    inputSchema: {
      type: 'object',
      properties: {
        dispatchId: {
          type: 'string',
          description: 'The dispatch ID to merge.',
        },
      },
      required: ['dispatchId'],
    },
  },
];

export async function handleAgentWorkOSDispatch(
  args: any,
  workspacePath?: string,
  sessionId?: string,
): Promise<McpToolResult> {
  if (!workspacePath) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'No workspace path available. Open a project first.' }) }],
      isError: true,
    };
  }

  const tasks: DispatchTask[] = (args.tasks || []).map((t: any) => ({
    title: t.title || 'Untitled task',
    prompt: t.prompt || '',
    provider: t.provider || 'auto',
    model: t.model,
    complexity: t.complexity,
    createWorkPacket: t.createWorkPacket ?? false,
  }));

  if (tasks.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'At least one task is required.' }) }],
      isError: true,
    };
  }

  try {
    const result: DispatchResult = await dispatchTasks({
      workspacePath,
      tasks,
      mergeStrategy: args.mergeStrategy || 'manual',
      parentSessionId: sessionId,
    });

    const summary = result.success
      ? `Dispatched ${result.tasks.filter(t => t.status === 'queued').length}/${result.tasks.length} tasks. Dispatch ID: ${result.dispatchId}`
      : `Dispatch failed: ${result.error}`;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ structured: result, summary }),
      }],
      isError: !result.success,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}

export async function handleAgentWorkOSDispatchStatus(
  args: any,
): Promise<McpToolResult> {
  const { dispatchId } = args;
  if (!dispatchId) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'dispatchId is required.' }) }],
      isError: true,
    };
  }

  try {
    const { getDatabase } = await import('../../database/initialize');
    const { AISessionsRepository } = await import('@nimbalyst/runtime/storage/repositories/AISessionsRepository');

    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const dispatch = await AISessionsRepository.get(dispatchId);
    if (!dispatch || (dispatch as any).sessionType !== 'dispatch') {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Dispatch not found.' }) }],
        isError: true,
      };
    }

    const { rows: children } = await db.query<any>(
      `SELECT s.id, s.title, s.provider, s.model,
              w.name AS worktree_name, w.branch AS worktree_branch
       FROM ai_sessions s
       LEFT JOIN worktrees w ON s.worktree_id = w.id
       WHERE s.parent_session_id = $1
       ORDER BY s.created_at ASC`,
      [dispatchId],
    );

    const result = {
      dispatchId,
      title: dispatch.title,
      taskCount: children.length,
      tasks: children.map((c: any) => ({
        sessionId: c.id,
        title: c.title,
        provider: c.provider,
        model: c.model,
        worktreeName: c.worktree_name,
        worktreeBranch: c.worktree_branch,
      })),
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          structured: result,
          summary: `Dispatch "${dispatch.title}" has ${children.length} tasks.`,
        }),
      }],
      isError: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}

export async function handleAgentWorkOSDispatchMerge(
  args: any,
  workspacePath?: string,
): Promise<McpToolResult> {
  if (!workspacePath) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'No workspace path available.' }) }],
      isError: true,
    };
  }

  const { dispatchId } = args;
  if (!dispatchId) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'dispatchId is required.' }) }],
      isError: true,
    };
  }

  try {
    const { getDatabase } = await import('../../database/initialize');
    const { GitWorktreeService } = await import('../../services/GitWorktreeService');

    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const gitService = new GitWorktreeService();

    // Get all child worktree branches
    const { rows: children } = await db.query<any>(
      `SELECT w.branch FROM ai_sessions s JOIN worktrees w ON s.worktree_id = w.id
       WHERE s.parent_session_id = $1 ORDER BY s.created_at ASC`,
      [dispatchId],
    );

    if (children.length === 0) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'No worktree branches found for this dispatch.' }) }],
        isError: true,
      };
    }

    const branches = children.map((c: any) => c.branch);
    const branchName = `dispatch-merge-${Date.now().toString(36)}`;

    const result = await gitService.selectiveMergeToBranch(workspacePath, branches, branchName);

    const summary = result.success
      ? `Merged ${result.mergedCount}/${result.totalCount} branches into ${result.branchName} (${result.commitCount} commits).`
      : `Merge failed at ${result.conflictedWorktree}: ${result.error}`;

    return {
      content: [{ type: 'text', text: JSON.stringify({ structured: result, summary }) }],
      isError: !result.success,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}
