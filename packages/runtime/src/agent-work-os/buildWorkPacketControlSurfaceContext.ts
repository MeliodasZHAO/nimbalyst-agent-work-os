import type { TrackerRecord } from '../core/TrackerRecord';
import { getRecordTitle } from '../plugins/TrackerPlugin/trackerRecordAccessors';
import type { AgentWorkOSMobilePermissionPolicy } from './config';
import { resolveMobilePermissionPolicyForMode } from './config';
import { evaluateWorkPacketGates } from './evaluateWorkPacketGates';
import { routeWorkPacket } from './routeWorkPacket';

export type WorkPacketControlSurfaceAction = 'plan-approval' | 'tool-permission' | 'commit-approval' | 'general';

export interface WorkPacketControlSurfaceOptions {
  action?: WorkPacketControlSurfaceAction;
  mobilePolicy?: AgentWorkOSMobilePermissionPolicy;
}

export interface WorkPacketControlSurfaceContext {
  hasWorkPacketContext: boolean;
  warningText?: string;
  desktopReviewRequired: boolean;
  workPacketIds: string[];
}

interface WorkPacketRiskFlags {
  database: boolean;
  security: boolean;
  destructive: boolean;
}

function stringifyField(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(stringifyField).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getRiskFlags(packet: TrackerRecord): WorkPacketRiskFlags {
  const risks = stringifyField(packet.fields.risks);
  return {
    database: /\b(database|db|schema|migration|migrations?|index|indexes|seed|backfill|truncate|stored data|data semantics)\b/i.test(risks),
    security: /\b(security|auth|authentication|authorization|permission|secret|token|key|credential)\b/i.test(risks),
    destructive: /\b(destructive|remove|delete|reset|force|overwrite)\b/i.test(risks),
  };
}

function buildPolicyReasons(
  packet: TrackerRecord,
  options: Required<Pick<WorkPacketControlSurfaceOptions, 'action' | 'mobilePolicy'>>,
): string[] {
  const gateEvaluation = evaluateWorkPacketGates(packet);
  const route = routeWorkPacket({
    complexity: stringifyField(packet.fields.complexity),
    risks: stringifyField(packet.fields.risks),
    recommendedAgent: stringifyField(packet.fields.recommendedAgent),
    capabilityRoute: stringifyField(packet.fields.capabilityRoute),
    requiredSkills: Array.isArray(packet.fields.requiredSkills)
      ? packet.fields.requiredSkills.map(item => stringifyField(item)).filter(Boolean)
      : undefined,
  });
  const policy = resolveMobilePermissionPolicyForMode(options.mobilePolicy.mode, options.mobilePolicy);
  const riskFlags = getRiskFlags(packet);
  const reasons: string[] = [];

  if (!gateEvaluation.readyForCurrentGate) {
    reasons.push(`missing ${gateEvaluation.blockedReasons.join(', ')}`);
  }
  if (policy.requireDesktopForShipped && gateEvaluation.gate === 'shipped') {
    reasons.push('shipped status requires desktop review');
  }
  if (options.action === 'plan-approval' && !policy.allowPlanApproval) {
    reasons.push('mobile plan approval is disabled');
  }
  if (options.action === 'tool-permission' && !policy.allowToolPermissionApproval) {
    reasons.push('mobile tool approval is disabled');
  }
  if (options.action === 'commit-approval' && !policy.allowCommitApproval) {
    reasons.push('mobile commit approval is disabled');
  }
  if (riskFlags.database && !policy.allowDatabaseRiskApproval) {
    reasons.push('database risk requires desktop review');
  }
  if (riskFlags.security && !policy.allowSecurityRiskApproval) {
    reasons.push('security risk requires desktop review');
  }
  if (riskFlags.destructive && !policy.allowDestructiveRiskApproval) {
    reasons.push('destructive risk requires desktop review');
  }
  if (route.secondAgentReviewRequired && !stringifyField(packet.fields.secondAgentReview).trim()) {
    reasons.push('second-agent review is required');
  }

  if (options.action === 'general' && (
    route.humanApprovalRequired ||
    route.secondAgentReviewRequired ||
    gateEvaluation.gate === 'review' ||
    gateEvaluation.gate === 'verification' ||
    gateEvaluation.gate === 'docs'
  )) {
    reasons.push('desktop review is required for this Work Packet gate');
  }

  return reasons;
}

function buildWorkPacketRiskLine(packet: TrackerRecord): string {
  const title = getRecordTitle(packet) || packet.issueKey || packet.id;
  const gateEvaluation = evaluateWorkPacketGates(packet);
  const route = routeWorkPacket({
    complexity: stringifyField(packet.fields.complexity),
    risks: stringifyField(packet.fields.risks),
    recommendedAgent: stringifyField(packet.fields.recommendedAgent),
    capabilityRoute: stringifyField(packet.fields.capabilityRoute),
    requiredSkills: Array.isArray(packet.fields.requiredSkills)
      ? packet.fields.requiredSkills.map(item => stringifyField(item)).filter(Boolean)
      : undefined,
  });

  const parts = [`${title} is at ${gateEvaluation.gate} gate`];
  if (!gateEvaluation.readyForCurrentGate && gateEvaluation.blockedReasons.length > 0) {
    parts.push(`missing ${gateEvaluation.blockedReasons.join(', ')}`);
  }
  if (route.approvalReasons.length > 0) {
    parts.push(route.approvalReasons.join(' '));
  } else if (route.secondAgentReviewRequired) {
    parts.push('Second-agent review is required.');
  }
  return parts.join('; ');
}

export function buildWorkPacketControlSurfaceContext(
  linkedRecords: TrackerRecord[],
  options: WorkPacketControlSurfaceOptions = {},
): WorkPacketControlSurfaceContext {
  const workPackets = linkedRecords.filter(record => record.primaryType === 'work-packet');
  if (workPackets.length === 0) {
    return {
      hasWorkPacketContext: false,
      desktopReviewRequired: false,
      workPacketIds: [],
    };
  }

  const action = options.action ?? 'general';
  const mobilePolicy = options.mobilePolicy ?? resolveMobilePermissionPolicyForMode('strict');
  const riskyPackets = workPackets
    .map(packet => ({
      packet,
      reasons: buildPolicyReasons(packet, { action, mobilePolicy }),
    }))
    .filter(item => item.reasons.length > 0);

  if (riskyPackets.length === 0) {
    return {
      hasWorkPacketContext: true,
      desktopReviewRequired: false,
      workPacketIds: workPackets.map(packet => packet.issueKey || packet.id),
    };
  }

  const lines = riskyPackets.map(({ packet, reasons }) => `${buildWorkPacketRiskLine(packet)} Policy: ${reasons.join(', ')}.`);
  return {
    hasWorkPacketContext: true,
    desktopReviewRequired: true,
    workPacketIds: workPackets.map(packet => packet.issueKey || packet.id),
    warningText: [
      'Work Packet guardrail: do not approve risky work, commits, database changes, destructive commands, or shipped status from voice or mobile unless desktop review and required gate evidence are complete.',
      ...lines,
    ].join(' '),
  };
}
