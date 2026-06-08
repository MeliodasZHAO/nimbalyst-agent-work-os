/**
 * Tip: Excalidraw Discovery
 *
 * Surfaces the Excalidraw editor to active AI users who have not yet
 * opened one. Heavy tool-use sessions imply the user is building something
 * complex enough to benefit from a sketch.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import type { TipDefinition } from '../types';

const DrawIcon = <MaterialSymbol icon="gesture" size={16} />;

export const excalidrawDiscoverTip: TipDefinition = {
  id: 'tip-excalidraw-discover',
  name: 'Excalidraw Discovery',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.SESSION_COMPLETED_WITH_TOOLS, 5) &&
      !context.hasBeenUsed(FEATURE_USAGE_KEYS.EXCALIDRAW_OPENED),
    delay: 2000,
    priority: 4,
  },
  content: {
    icon: DrawIcon,
    title: '用 Excalidraw 画架构图',
    body: '创建 **.excalidraw** 文件即可绘制方框、箭头和自由图形。Agent 可以通过工具读取和修改这些图——非常适合系统架构和流程图。',
  },
};
