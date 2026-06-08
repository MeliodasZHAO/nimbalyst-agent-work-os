import { describe, expect, it } from 'vitest';
import type { TrackerRecord } from '../../core/TrackerRecord';
import { buildWorkPacketUpdateGuidance, formatWorkPacketUpdateGuidance } from '../buildWorkPacketUpdateGuidance';

function makeRecord(fields: Record<string, unknown>): TrackerRecord {
  return {
    id: 'fm:work-packet:plans/runtime-fix.md',
    primaryType: 'work-packet',
    typeTags: ['work-packet'],
    issueKey: 'WPKT-12',
    source: 'frontmatter',
    sourceRef: 'plans/runtime-fix.md',
    archived: false,
    syncStatus: 'local',
    system: {
      workspace: '/workspace',
      documentPath: 'plans/runtime-fix.md',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    fields: {
      title: 'Runtime import fix',
      gate: 'review',
      complexity: 'risky',
      recommendedAgent: 'mixed',
      capabilityRoute: 'second-agent-review',
      risks: 'database migration risk',
      successCriteria: 'Extensionless upload filenames work.',
      verification: 'Run upload/import tests.',
      ...fields,
    },
  };
}

describe('buildWorkPacketUpdateGuidance', () => {
  it('recommends missing evidence fields for the current gate', () => {
    const guidance = buildWorkPacketUpdateGuidance(makeRecord({}));

    expect(guidance.gate).toBe('review');
    expect(guidance.recommendedFields).toEqual([
      'diffSummary',
      'reviewEvidence',
      'secondAgentReview',
      'projectMemoryUpdates',
      'humanApproval',
    ]);
    expect(guidance.allowedFields).toContain('verificationEvidence');
    expect(guidance.guardedFields).toContain('humanApproval');
    expect(guidance.forbiddenFields).toContain('linkedSession');
    expect(guidance.forbiddenFields).toContain('shipped');
  });

  it('formats prompt guidance that separates evidence fields from system-managed fields', () => {
    const text = formatWorkPacketUpdateGuidance(makeRecord({
      diffSummary: 'Changed runtime import handling.',
    }));

    expect(text).toContain('## Work Packet Update Rules');
    expect(text).toContain('allowedEvidenceFields:');
    expect(text).toContain('guardedUserApprovalFields:');
    expect(text).toContain('systemManagedFields: linkedSession, reviewerSession, worktreeId, worktreePath, shipped');
    expect(text).toContain('Do not set gate to shipped');
  });
});
