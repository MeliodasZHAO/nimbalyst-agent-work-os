import { describe, expect, it } from 'vitest';
import type { TrackerRecord } from '../../core/TrackerRecord';
import { evaluateWorkPacketGateTransition, evaluateWorkPacketGates } from '../evaluateWorkPacketGates';

function makeRecord(fields: Record<string, unknown>): TrackerRecord {
  return {
    id: 'wpkt-1',
    primaryType: 'work-packet',
    typeTags: ['work-packet'],
    source: 'native',
    archived: false,
    syncStatus: 'local',
    system: {
      workspace: '/workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    fields: {
      title: 'Packet',
      complexity: 'medium',
      recommendedAgent: 'codex',
      capabilityRoute: 'plan-first',
      ...fields,
    },
  };
}

describe('evaluateWorkPacketGates', () => {
  it('blocks Review Gate until review evidence and diff summary exist', () => {
    const evaluation = evaluateWorkPacketGates(makeRecord({
      gate: 'review',
      diffSummary: '',
      reviewEvidence: '',
    }));

    expect(evaluation.gate).toBe('review');
    expect(evaluation.readyForCurrentGate).toBe(false);
    expect(evaluation.blockedReasons).toContain('Diff summary');
    expect(evaluation.blockedReasons).toContain('Review evidence');
  });

  it('requires second-agent review when routing marks the packet risky', () => {
    const evaluation = evaluateWorkPacketGates(makeRecord({
      gate: 'review',
      complexity: 'risky',
      diffSummary: 'Changed runtime import path.',
      reviewEvidence: 'Self-review found no regressions.',
    }));

    expect(evaluation.readyForCurrentGate).toBe(false);
    expect(evaluation.blockedReasons).toContain('Second-agent review');
  });

  it('passes Verification Gate when tests and verification evidence are present', () => {
    const evaluation = evaluateWorkPacketGates(makeRecord({
      gate: 'verification',
      testsRun: 'npm run typecheck --prefix packages/runtime',
      verificationEvidence: 'Focused vitest suite passed.',
    }));

    expect(evaluation.readyForCurrentGate).toBe(true);
    expect(evaluation.blockedReasons).toEqual([]);
  });

  it('requires docs evidence and project memory updates at Docs Gate when docs gate is required', () => {
    const evaluation = evaluateWorkPacketGates(makeRecord({
      gate: 'docs',
      complexity: 'medium',
      docsEvidence: 'README updated.',
    }));

    expect(evaluation.readyForCurrentGate).toBe(false);
    expect(evaluation.blockedReasons).toContain('Project memory updates');
  });

  it('warns that shipped promotion remains a user action', () => {
    const evaluation = evaluateWorkPacketGates(makeRecord({
      gate: 'shipped',
      diffSummary: 'Tracker UI and runtime helpers changed.',
      reviewEvidence: 'Reviewer found no blocking issues.',
      testsRun: 'Focused tests passed.',
      verificationEvidence: 'Typecheck passed.',
      docsEvidence: 'No docs changes needed.',
      projectMemoryUpdates: 'No project memory updates needed.',
    }));

    expect(evaluation.readyForCurrentGate).toBe(true);
    expect(evaluation.warnings).toContain('Final shipped promotion remains a user action');
  });

  it('blocks forward gate transitions when prior required evidence is missing', () => {
    const transition = evaluateWorkPacketGateTransition(makeRecord({
      gate: 'review',
      diffSummary: 'Changed runtime helpers.',
      reviewEvidence: '',
      testsRun: 'Focused tests passed.',
      verificationEvidence: 'Typecheck passed.',
    }), 'verification');

    expect(transition.allowed).toBe(false);
    expect(transition.blockedReasons).toContain('review: Review evidence');
  });

  it('allows backward gate transitions without requiring evidence', () => {
    const transition = evaluateWorkPacketGateTransition(makeRecord({
      gate: 'verification',
    }), 'review');

    expect(transition.allowed).toBe(true);
    expect(transition.blockedReasons).toEqual([]);
  });

  it('requires all intermediate gate evidence when jumping forward', () => {
    const transition = evaluateWorkPacketGateTransition(makeRecord({
      gate: 'review',
      diffSummary: 'Changed runtime helpers.',
      reviewEvidence: 'Self-review passed.',
      testsRun: '',
      verificationEvidence: '',
      docsEvidence: '',
    }), 'shipped');

    expect(transition.allowed).toBe(false);
    expect(transition.blockedReasons).toContain('verification: Tests run');
    expect(transition.blockedReasons).toContain('verification: Verification evidence');
    expect(transition.blockedReasons).toContain('docs: Docs/project memory decision');
  });
});
