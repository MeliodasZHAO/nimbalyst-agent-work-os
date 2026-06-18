/**
 * Worktree event atoms.
 *
 * Updated by store/listeners/worktreeListeners.ts. Components that previously
 * subscribed to worktree:* IPC events directly now read from these atoms.
 */

import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/**
 * Latest `worktree:display-name-updated` event from main.
 *
 * Request-atom shape: each event bumps `version` and replaces `payload`.
 * Consumers use `useAtomValue` + the skip-initial-mount idiom (capture the
 * initial version in a ref, bail when it matches) so the side effect fires
 * only on real bumps. Filter by `payload.worktreeId` to react to a specific
 * worktree.
 */
export interface WorktreeDisplayNameUpdate {
  version: number;
  payload: { worktreeId: string; displayName: string };
}

export const worktreeDisplayNameUpdateAtom = atom<WorktreeDisplayNameUpdate | null>(null);

/**
 * Live dev-server preview state per worktree, keyed by worktreeId.
 *
 * Mirrors the main-process PreviewServerManager state. Updated by
 * store/listeners/previewListeners.ts on the `preview:state-changed` event and
 * by an initial `preview:list` hydration. Components read the family member for
 * their worktree to render the "● running :5301 名字" control.
 */
export type PreviewStatus = 'starting' | 'running' | 'stopped' | 'crashed';

export interface PreviewStateView {
  worktreeId: string;
  worktreePath: string;
  port: number;
  name?: string;
  devCommand?: string;
  status: PreviewStatus;
  pid?: number;
  url: string;
  error?: string;
}

export const previewStateAtomFamily = atomFamily((_worktreeId: string) =>
  atom<PreviewStateView | null>(null),
);
