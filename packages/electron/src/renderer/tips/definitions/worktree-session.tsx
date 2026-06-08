import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { store } from '@nimbalyst/runtime/store';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import { setWindowModeAtom } from '../../store/atoms/windowMode';
import { tipCreateWorktreeSessionRequestAtom } from '../atoms';
import type { TipDefinition } from '../types';

const BranchIcon = <MaterialSymbol icon="account_tree" size={16} />;

export const worktreeSessionTip: TipDefinition = {
  id: 'tip-worktree-session',
  name: 'Worktree Session Suggestion',
  version: 1,
  trigger: {
    screen: 'agent',
    condition: (context) =>
      context.isGitRepo &&
      context.isWorktreesAvailable &&
      !context.workspacePath?.includes('_worktrees/') &&
      context.hasReachedCount(FEATURE_USAGE_KEYS.SESSION_CREATED, 10) &&
      !context.hasBeenUsed(FEATURE_USAGE_KEYS.WORKTREE_CREATED),
    delay: 2500,
    priority: 7,
  },
  content: {
    icon: BranchIcon,
    title: '用 Worktree 隔离高风险操作',
    body: '你在 Git 仓库中频繁使用 Agent 会话，但还没创建过 **Worktree 会话**。Worktree 为实验提供独立的分支和工作目录，不会影响主分支的代码。',
    action: {
      label: '新建 Worktree 会话',
      onClick: () => {
        store.set(setWindowModeAtom, 'agent');
        store.set(tipCreateWorktreeSessionRequestAtom, (prev) => prev + 1);
      },
      variant: 'primary',
    },
  },
};
