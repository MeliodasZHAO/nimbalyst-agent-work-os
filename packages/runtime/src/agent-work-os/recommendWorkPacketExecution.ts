import type { AgentWorkOSConfig, AgentWorkOSCollaborationMode, AgentWorkOSReasoningLevel } from './config';
import { normalizeAgentWorkOSConfig } from './config';
import type {
  CapabilityRouteRecommendation,
  WorkPacketRouteInput,
  WorkPacketRecommendedAgent,
  WorkPacketCapabilityRoute,
} from './routeWorkPacket';
import { routeWorkPacket } from './routeWorkPacket';

export interface WorkPacketExecutionRecommendation {
  route: CapabilityRouteRecommendation;
  collaborationMode: AgentWorkOSCollaborationMode;
  reasoning: AgentWorkOSReasoningLevel;
  controlMode: AgentWorkOSConfig['automation']['controlMode'];
  agentSource: 'packet' | 'config' | 'auto';
  routeSource: 'packet' | 'config' | 'auto';
  notes: string[];
}

function isUnset(value: unknown): boolean {
  return value == null || String(value).trim() === '' || String(value).trim() === 'auto';
}

export function recommendWorkPacketExecution(
  packet: WorkPacketRouteInput,
  configInput?: unknown,
): WorkPacketExecutionRecommendation {
  const config = normalizeAgentWorkOSConfig(configInput);

  const recommendedAgent = isUnset(packet.recommendedAgent) && config.automation.defaultAgent !== 'auto'
    ? config.automation.defaultAgent as WorkPacketRecommendedAgent
    : packet.recommendedAgent;
  const capabilityRoute = isUnset(packet.capabilityRoute) && config.automation.defaultCapabilityRoute !== 'auto'
    ? config.automation.defaultCapabilityRoute as WorkPacketCapabilityRoute
    : packet.capabilityRoute;

  const route = routeWorkPacket({
    ...packet,
    recommendedAgent,
    capabilityRoute,
  });

  const notes: string[] = [];
  if (config.automation.requireFrontendVisualEvidence) {
    notes.push('Frontend Work Packets should collect visual evidence before Verification Gate.');
  }
  if (config.automation.allowAgentToUpdateWorkPackets) {
    notes.push('Agents may update non-approval Work Packet evidence fields as facts change.');
  }
  if (!config.automation.preferWorktreesForMediumRisk && route.worktreeRecommended) {
    notes.push('Config disables the default medium-risk worktree preference; user review is recommended before skipping isolation.');
  }

  return {
    route: {
      ...route,
      worktreeRecommended: config.automation.preferWorktreesForMediumRisk ? route.worktreeRecommended : false,
    },
    collaborationMode: config.automation.defaultCollaborationMode,
    reasoning: config.automation.defaultReasoning,
    controlMode: config.automation.controlMode,
    agentSource: isUnset(packet.recommendedAgent) && config.automation.defaultAgent !== 'auto' ? 'config' : isUnset(packet.recommendedAgent) ? 'auto' : 'packet',
    routeSource: isUnset(packet.capabilityRoute) && config.automation.defaultCapabilityRoute !== 'auto' ? 'config' : isUnset(packet.capabilityRoute) ? 'auto' : 'packet',
    notes,
  };
}
