/**
 * Tip: DataModelLM Discovery
 *
 * Surfaces visual ER/Prisma editing to users active enough to be writing
 * raw SQL or thinking about schemas.
 */

import React from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { FEATURE_USAGE_KEYS } from '../../../shared/featureUsage';
import type { TipDefinition } from '../types';

const SchemaIcon = <MaterialSymbol icon="schema" size={16} />;

export const datamodelDiscoverTip: TipDefinition = {
  id: 'tip-datamodel-discover',
  name: 'DataModelLM Discovery',
  version: 1,
  trigger: {
    screen: '*',
    condition: (context) =>
      context.hasReachedCount(FEATURE_USAGE_KEYS.SESSION_COMPLETED_WITH_TOOLS, 5) &&
      !context.hasBeenUsed(FEATURE_USAGE_KEYS.DATAMODEL_OPENED),
    delay: 2000,
    priority: 4,
  },
  content: {
    icon: SchemaIcon,
    title: '用 DataModelLM 可视化设计数据模型',
    body: '**.datamodel** 文件是带有实时 ER 图的 Prisma 风格 Schema。Agent 可以像编辑普通源文件一样修改它，你还能免费获得 ER 图。',
  },
};
