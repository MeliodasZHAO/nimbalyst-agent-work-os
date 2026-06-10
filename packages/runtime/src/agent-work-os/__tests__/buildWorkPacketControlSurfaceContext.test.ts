import { describe, expect, it } from 'vitest';
import type { TrackerRecord } from '../../core/TrackerRecord';
import { buildWorkPacketControlSurfaceContext } from '../buildWorkPacketControlSurfaceContext';
import { resolveMobilePermissionPolicyForMode } from '../config';

function makeRecord(fields: Record<string, unknown>): TrackerRecord {
  return {
    id: 'wpkt-1',
    primaryType: 'work-packet',
    typeTags: ['work-packet'],
    issueKey: 'WPKT-1',
    source: 'native',
    archived: false,
    syncStatus: 'local',
    system: {
      workspace: '/workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    fields: {
      title: 'Risky packet',
      complexity: 'risky',
      recommendedAgent: 'codex',
      capabilityRoute: 'plan-first',
      ...fields,
    },
  };
}

describe('buildWorkPacketControlSurfaceContext', () => {
  it('returns no context when no Work Packet is linked', () => {
    const context = buildWorkPacketControlSurfaceContext([
      { ...makeRecord({}), primaryType: 'task', typeTags: ['task'] },
    ]);

    expect(context.hasWorkPacketContext).toBe(false);
    expect(context.desktopReviewRequired).toBe(false);
  });

  it('warns control surfaces for risky Work Packets with missing gate evidence', () => {
    const context = buildWorkPacketControlSurfaceContext([
      makeRecord({
        gate: 'review',
        diffSummary: '',
        reviewEvidence: '',
        risks: 'Database migration and production runtime behavior.',
      }),
    ]);

    expect(context.hasWorkPacketContext).toBe(true);
    expect(context.desktopReviewRequired).toBe(true);
    expect(context.warningText).toContain('Work Packet guardrail');
    expect(context.warningText).toContain('Risky packet is at review gate');
    expect(context.warningText).toContain('missing Diff summary, Review evidence');
    expect(context.warningText).toContain('Database impact requires explicit human approval.');
  });

  it('does not require desktop review for a small early-gate packet with complete evidence', () => {
    const context = buildWorkPacketControlSurfaceContext([
      makeRecord({
        gate: 'spec',
        complexity: 'small',
        successCriteria: 'UI displays field.',
        verification: 'Manual smoke test.',
      }),
    ]);

    expect(context.hasWorkPacketContext).toBe(true);
    expect(context.desktopReviewRequired).toBe(false);
    expect(context.warningText).toBeUndefined();
  });

  it('allows balanced mobile plan approvals for low-risk packets with complete plan evidence', () => {
    const context = buildWorkPacketControlSurfaceContext([
      makeRecord({
        gate: 'plan',
        complexity: 'small',
        risks: 'none',
        successCriteria: 'Works.',
        verification: 'Focused test.',
        planEvidence: 'Plan approved.',
      }),
    ], {
      action: 'plan-approval',
      mobilePolicy: resolveMobilePermissionPolicyForMode('balanced'),
    });

    expect(context.desktopReviewRequired).toBe(false);
  });

  it('blocks balanced mobile commit approvals but allows flexible low-risk commit approvals', () => {
    const packet = makeRecord({
      gate: 'verification',
      complexity: 'small',
      risks: 'none',
      testsRun: 'Focused tests passed.',
      verificationEvidence: 'Manual check passed.',
    });

    expect(buildWorkPacketControlSurfaceContext([packet], {
      action: 'commit-approval',
      mobilePolicy: resolveMobilePermissionPolicyForMode('balanced'),
    }).desktopReviewRequired).toBe(true);

    expect(buildWorkPacketControlSurfaceContext([packet], {
      action: 'commit-approval',
      mobilePolicy: resolveMobilePermissionPolicyForMode('flexible'),
    }).desktopReviewRequired).toBe(false);
  });

  it('still blocks database risk when flexible policy does not allow database approvals', () => {
    const context = buildWorkPacketControlSurfaceContext([
      makeRecord({
        gate: 'plan',
        complexity: 'small',
        risks: 'database migration',
        successCriteria: 'Works.',
        verification: 'Migration test.',
        planEvidence: 'Plan approved.',
        humanApproval: 'Approved to plan only.',
      }),
    ], {
      action: 'plan-approval',
      mobilePolicy: resolveMobilePermissionPolicyForMode('flexible'),
    });

    expect(context.desktopReviewRequired).toBe(true);
    expect(context.warningText).toContain('database risk requires desktop review');
  });
});
