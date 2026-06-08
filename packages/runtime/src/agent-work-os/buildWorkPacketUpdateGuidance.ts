import type { TrackerRecord } from '../core/TrackerRecord';
import { evaluateWorkPacketGates } from './evaluateWorkPacketGates';
import { routeWorkPacket } from './routeWorkPacket';

export interface WorkPacketUpdateGuidance {
  gate: string;
  allowedFields: string[];
  guardedFields: string[];
  forbiddenFields: string[];
  recommendedFields: string[];
  instructions: string[];
}

function stringifyField(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(stringifyField).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function hasText(value: unknown): boolean {
  return stringifyField(value).trim().length > 0;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function buildWorkPacketUpdateGuidance(record: TrackerRecord): WorkPacketUpdateGuidance {
  const fields = record.fields;
  const gateEvaluation = evaluateWorkPacketGates(record);
  const route = routeWorkPacket({
    complexity: stringifyField(fields.complexity),
    risks: stringifyField(fields.risks),
    recommendedAgent: stringifyField(fields.recommendedAgent),
    capabilityRoute: stringifyField(fields.capabilityRoute),
    requiredSkills: Array.isArray(fields.requiredSkills)
      ? fields.requiredSkills.map(item => stringifyField(item)).filter(Boolean)
      : undefined,
  });

  const allowedFields = [
    'successCriteria',
    'verification',
    'risks',
    'requiredSkills',
    'projectMemoryUpdates',
    'planEvidence',
    'diffSummary',
    'reviewEvidence',
    'successChecklist',
    'secondAgentReview',
    'testsRun',
    'verificationEvidence',
    'runtimeEvidence',
    'docsEvidence',
    'unresolvedRisks',
  ];
  const guardedFields = [
    'gate',
    'recommendedAgent',
    'capabilityRoute',
    'complexity',
    'priority',
    'humanApproval',
    'progress',
  ];
  const forbiddenFields = [
    'linkedSession',
    'reviewerSession',
    'worktreeId',
    'worktreePath',
    'shipped',
  ];
  const recommendedFields: string[] = [];

  if (!hasText(fields.successCriteria)) recommendedFields.push('successCriteria');
  if (!hasText(fields.verification)) recommendedFields.push('verification');
  if (gateEvaluation.gate === 'plan' && !hasText(fields.planEvidence)) recommendedFields.push('planEvidence');
  if (gateEvaluation.gate === 'review') {
    if (!hasText(fields.diffSummary)) recommendedFields.push('diffSummary');
    if (!hasText(fields.reviewEvidence)) recommendedFields.push('reviewEvidence');
    if (route.secondAgentReviewRequired && !hasText(fields.secondAgentReview)) recommendedFields.push('secondAgentReview');
  }
  if (gateEvaluation.gate === 'verification') {
    if (!hasText(fields.testsRun)) recommendedFields.push('testsRun');
    if (!hasText(fields.verificationEvidence)) recommendedFields.push('verificationEvidence');
  }
  if (gateEvaluation.gate === 'docs' && !hasText(fields.docsEvidence)) recommendedFields.push('docsEvidence');
  if (route.docsGateRequired && !hasText(fields.projectMemoryUpdates)) recommendedFields.push('projectMemoryUpdates');
  if (route.humanApprovalRequired && !hasText(fields.humanApproval)) recommendedFields.push('humanApproval');
  for (const reason of gateEvaluation.blockedReasons) {
    const normalized = reason.toLowerCase();
    if (normalized.includes('diff')) recommendedFields.push('diffSummary');
    if (normalized.includes('review')) recommendedFields.push('reviewEvidence');
    if (normalized.includes('tests')) recommendedFields.push('testsRun');
    if (normalized.includes('verification')) recommendedFields.push('verificationEvidence');
    if (normalized.includes('docs')) recommendedFields.push('docsEvidence');
  }

  return {
    gate: gateEvaluation.gate,
    allowedFields,
    guardedFields,
    forbiddenFields,
    recommendedFields: unique(recommendedFields),
    instructions: [
      'Keep the Work Packet current when facts change, but only write fields you can support with observed evidence.',
      'You may update allowed evidence fields directly when you have concrete information from the plan, diff, tests, logs, screenshots, or review.',
      'For guarded fields, propose the update and wait for user approval before changing them.',
      'Do not fabricate launch evidence fields; linkedSession, reviewerSession, worktreeId, and worktreePath are written by Nimbalyst launch plumbing.',
      'Do not set gate to shipped or mark the work complete; final promotion remains a user action.',
    ],
  };
}

export function formatWorkPacketUpdateGuidance(record: TrackerRecord): string {
  const guidance = buildWorkPacketUpdateGuidance(record);
  const lines = [
    '## Work Packet Update Rules',
    `- currentGate: ${guidance.gate}`,
    `- allowedEvidenceFields: ${guidance.allowedFields.join(', ')}`,
    `- guardedUserApprovalFields: ${guidance.guardedFields.join(', ')}`,
    `- systemManagedFields: ${guidance.forbiddenFields.join(', ')}`,
  ];

  if (guidance.recommendedFields.length > 0) {
    lines.push(`- recommendedNextFields: ${guidance.recommendedFields.join(', ')}`);
  }
  for (const instruction of guidance.instructions) {
    lines.push(`- ${instruction}`);
  }
  return lines.join('\n');
}
