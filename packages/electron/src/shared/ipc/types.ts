/**
 * Shared type definitions for IPC handler responses
 */

import type { Worktree } from '../../main/services/WorktreeStore';

/**
 * Response from worktree:create IPC handler
 */
export interface WorktreeCreateResult {
  success: boolean;
  worktree?: Worktree;
  error?: string;
}

/**
 * Response from sessions:create IPC handler
 */
export interface SessionCreateResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Response from blitz:create IPC handler
 */
export interface BlitzCreateResult {
  success: boolean;
  blitzSessionId?: string;
  worktrees?: WorktreeCreateResult[];
  sessionIds?: string[];
  models?: string[];
  errors?: string[];
  error?: string;
}

/**
 * Individual task result within a dispatch batch
 */
export interface DispatchTaskResult {
  title: string;
  sessionId: string;
  worktreeId: string;
  worktreePath: string;
  worktreeBranch: string;
  provider: string;
  workPacketId?: string;
  status: 'queued' | 'failed';
  error?: string;
}

/**
 * Response from agent-work-os:dispatch IPC handler
 */
export interface DispatchResult {
  success: boolean;
  dispatchId: string;
  tasks: DispatchTaskResult[];
  error?: string;
}

/**
 * Payload for agent-work-os:dispatch-selective-merge IPC
 */
export interface SelectiveMergePayload {
  dispatchId: string;
  selectedWorktreeIds: string[];
  newBranchName: string;
  baseBranch?: string;
  workspacePath: string;
}

/**
 * Response from agent-work-os:dispatch-selective-merge IPC
 */
export interface SelectiveMergeResult {
  success: boolean;
  branchName?: string;
  mergedCount?: number;
  totalCount?: number;
  commitCount?: number;
  conflictedWorktree?: string;
  conflictedFiles?: string[];
  error?: string;
}
