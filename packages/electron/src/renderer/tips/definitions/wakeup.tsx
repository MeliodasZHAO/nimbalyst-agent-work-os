/**
 * Tip: Scheduled Wakeups
 *
 * Surfaces the schedule_wakeup MCP tool to heavy AI users who could be
 * letting the agent self-page instead of remembering to check back.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import type { TipDefinition } from '../types';

const ScheduleIcon = <MaterialSymbol icon="schedule" size={16} />;

export const wakeupTip: TipDefinition = {
  id: 'tip-wakeup',
  name: 'Scheduled Wakeups',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.AI_PROMPT_SUBMITTED, 30),
    delay: 2000,
    priority: 3,
  },
  content: {
    icon: ScheduleIcon,
    title: '让 Agent 自己定时唤醒',
    body: '让 Agent **设置定时唤醒**（"5 分钟后检查构建"、"每 30 秒轮询 PR"），它会自动恢复执行——不用一直盯着长时间运行的任务。',
  },
};
