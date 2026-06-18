/**
 * Pure mapping from raw MCP `agent_work_os_dispatch` arguments to typed
 * DispatchTask objects. Kept separate from agentWorkOSToolHandlers (which pulls
 * in the dispatcher + electron) so it can be unit-tested in isolation.
 */

import type { DispatchTask } from '../../services/AgentWorkOSDispatcher';
import type { EffortLevel } from '@nimbalyst/runtime/ai/server/effortLevels';

const VALID_EFFORT_LEVELS = new Set<EffortLevel>(['low', 'medium', 'high', 'xhigh', 'max']);

/** Pass an effort level through only when it is one of the known levels. */
function normalizeEffortLevel(value: unknown): EffortLevel | undefined {
  return typeof value === 'string' && VALID_EFFORT_LEVELS.has(value as EffortLevel)
    ? (value as EffortLevel)
    : undefined;
}

/**
 * Map the raw tool arguments to DispatchTask[]. Tolerant of missing fields
 * (defaults match the previous inline behavior); `effortLevel` is only set when
 * the agent supplied a valid level, so absent/garbage values leave the child
 * session on its provider default rather than forcing one.
 */
export function mapDispatchArgs(args: any): DispatchTask[] {
  return (args?.tasks || []).map((t: any) => ({
    title: t.title || 'Untitled task',
    prompt: t.prompt || '',
    provider: t.provider || 'auto',
    model: t.model,
    complexity: t.complexity,
    priority: t.priority,
    effortLevel: normalizeEffortLevel(t.effortLevel),
    createWorkPacket: t.createWorkPacket ?? false,
  }));
}
