import type { TrackerRecord } from '../core/TrackerRecord';
import { getRecordPriority, getRecordStatus, getRecordTitle } from '../plugins/TrackerPlugin/trackerRecordAccessors';
import { formatFrontendVisualVerificationGuidance } from './buildFrontendVisualVerificationGuidance';
import { formatWorkPacketUpdateGuidance } from './buildWorkPacketUpdateGuidance';
import type { WorkPacketExecutionRecommendation } from './recommendWorkPacketExecution';
import { routeWorkPacket } from './routeWorkPacket';

function stringifyField(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(stringifyField).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function appendField(lines: string[], label: string, value: unknown): void {
  const text = stringifyField(value).trim();
  if (text) lines.push(`- ${label}: ${text}`);
}

function appendSection(lines: string[], title: string, value: unknown): void {
  const text = stringifyField(value).trim();
  if (!text) return;
  lines.push('', `## ${title}`, text);
}

export function buildWorkPacketPrompt(
  record: TrackerRecord,
  recommendation?: WorkPacketExecutionRecommendation,
): string {
  const title = getRecordTitle(record) || record.issueKey || record.id;
  const status = getRecordStatus(record);
  const priority = getRecordPriority(record);
  const fields = record.fields;
  const route = routeWorkPacket({
    complexity: stringifyField(fields.complexity),
    risks: stringifyField(fields.risks),
    recommendedAgent: stringifyField(fields.recommendedAgent),
    capabilityRoute: stringifyField(fields.capabilityRoute),
    requiredSkills: Array.isArray(fields.requiredSkills)
      ? fields.requiredSkills.map(item => stringifyField(item)).filter(Boolean)
      : undefined,
  });

  const lines: string[] = [
    'Do not edit files yet. Read this Work Packet and the project memory. Identify missing success criteria, risks, verification steps, and human decisions. Then propose a plan.',
    '',
    `# Work Packet: ${title}`,
  ];

  appendField(lines, 'id', record.issueKey || record.id);
  appendField(lines, 'gate', status || fields.gate);
  appendField(lines, 'complexity', fields.complexity);
  appendField(lines, 'priority', priority);
  appendField(lines, 'recommendedAgent', fields.recommendedAgent);
  appendField(lines, 'capabilityRoute', fields.capabilityRoute);
  appendField(lines, 'source', record.system.documentPath ? `@${record.system.documentPath}` : record.sourceRef);

  appendSection(lines, 'Intent / Scope', fields.intent ?? fields.scope);
  appendSection(lines, 'Success Criteria', fields.successCriteria);
  appendSection(lines, 'Verification', fields.verification);
  appendSection(lines, 'Risks', fields.risks);
  appendSection(lines, 'Required Skills / Project Memory', fields.requiredSkills);
  appendSection(lines, 'Project Memory Updates', fields.projectMemoryUpdates);
  appendSection(lines, 'Human Approval', fields.humanApproval);
  appendSection(lines, 'Plan Evidence', fields.planEvidence);
  appendSection(lines, 'Review Evidence', fields.reviewEvidence);
  appendSection(lines, 'Diff Summary', fields.diffSummary);
  appendSection(lines, 'Success Criteria Checklist', fields.successChecklist);
  appendSection(lines, 'Second-Agent Review', fields.secondAgentReview);
  appendSection(lines, 'Tests Run', fields.testsRun);
  appendSection(lines, 'Verification Evidence', fields.verificationEvidence);
  appendSection(lines, 'Runtime Evidence', fields.runtimeEvidence);
  appendSection(lines, 'Docs Evidence', fields.docsEvidence);
  appendSection(lines, 'Unresolved Risks', fields.unresolvedRisks);

  const routeRecommendation = recommendation?.route ?? route;

  lines.push('', '## Capability Gate Recommendation');
  lines.push(`- provider: ${routeRecommendation.provider}`);
  lines.push(`- sessionMode: ${routeRecommendation.sessionMode}`);
  lines.push(`- worktreeRecommended: ${routeRecommendation.worktreeRecommended ? 'yes' : 'no'}`);
  lines.push(`- secondAgentReviewRequired: ${routeRecommendation.secondAgentReviewRequired ? 'yes' : 'no'}`);
  lines.push(`- docsGateRequired: ${routeRecommendation.docsGateRequired ? 'yes' : 'no'}`);
  lines.push(`- humanApprovalRequired: ${routeRecommendation.humanApprovalRequired ? 'yes' : 'no'}`);
  if (routeRecommendation.reviewerProvider) lines.push(`- reviewerProvider: ${routeRecommendation.reviewerProvider}`);

  if (recommendation) {
    lines.push('', '## Agent Work OS Launch Recommendation');
    lines.push(`- controlMode: ${recommendation.controlMode}`);
    lines.push(`- collaborationMode: ${recommendation.collaborationMode}`);
    lines.push(`- reasoning: ${recommendation.reasoning}`);
    lines.push(`- agentSource: ${recommendation.agentSource}`);
    lines.push(`- routeSource: ${recommendation.routeSource}`);
    for (const note of recommendation.notes) lines.push(`- ${note}`);
  }

  if (routeRecommendation.approvalReasons.length > 0) {
    lines.push('', '## Required Human Decisions');
    for (const reason of routeRecommendation.approvalReasons) lines.push(`- ${reason}`);
  }

  const routingNotes = [
    ...routeRecommendation.routingNotes,
    ...routeRecommendation.warnings,
  ];
  if (routingNotes.length > 0) {
    lines.push('', '## Routing Notes');
    for (const note of routingNotes) lines.push(`- ${note}`);
  }

  lines.push('', formatWorkPacketUpdateGuidance(record));
  const frontendVisualGuidance = formatFrontendVisualVerificationGuidance(record, recommendation);
  if (frontendVisualGuidance) {
    lines.push('', frontendVisualGuidance);
  }

  lines.push(
    '',
    '## Stop Conditions',
    '- Stop before code edits if success criteria, risks, verification, or approvals are incomplete.',
    '- Do not make database changes without explicit human approval.',
    '- Do not mark the Work Packet shipped or completed; leave final promotion to the user.',
  );

  return lines.join('\n');
}
