import { describe, expect, it } from 'vitest';
import type { TrackerRecord } from '@nimbalyst/runtime/core/TrackerRecord';
import type { SessionMeta } from '../../../store/atoms/sessions';
import { getWorkPacketLaunchEvidence } from '../workPacketLaunchEvidence';

function makeRecord(primaryType: string, fields: Record<string, unknown>): TrackerRecord {
  return {
    id: `native:${primaryType}:1`,
    primaryType,
    typeTags: [primaryType],
    source: 'native',
    archived: false,
    syncStatus: 'local',
    system: {
      workspace: '/workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    fields: {
      title: 'Launch a Work Packet',
      ...fields,
    },
  };
}

function makeSession(id: string, provider: string): SessionMeta {
  return {
    id,
    title: `${provider} session`,
    provider,
    sessionType: 'session',
    workspaceId: '/workspace',
    worktreeId: null,
    parentSessionId: null,
    childCount: 0,
    uncommittedCount: 0,
    createdAt: 1_000,
    updatedAt: 2_000,
    messageCount: 1,
    isArchived: false,
    isPinned: false,
  };
}

describe('getWorkPacketLaunchEvidence', () => {
  it('resolves implementation and reviewer sessions from Work Packet fields', () => {
    const registry = new Map<string, SessionMeta>([
      ['session-primary', makeSession('session-primary', 'openai-codex')],
      ['session-reviewer', makeSession('session-reviewer', 'claude-code')],
    ]);

    const evidence = getWorkPacketLaunchEvidence(makeRecord('work-packet', {
      linkedSession: 'session-primary',
      reviewerSession: 'session-reviewer',
      worktreeId: 'wt_123',
      worktreePath: '/workspace/.worktrees/wt_123',
    }), registry);

    expect(evidence.hasEvidence).toBe(true);
    expect(evidence.implementationSession?.session?.provider).toBe('openai-codex');
    expect(evidence.reviewerSession?.session?.provider).toBe('claude-code');
    expect(evidence.reviewerStatus).toBe('active');
    expect(evidence.worktreeId).toBe('wt_123');
    expect(evidence.sessionIds).toEqual(['session-primary', 'session-reviewer']);
  });

  it('keeps recorded session ids when the registry has not refreshed yet', () => {
    const evidence = getWorkPacketLaunchEvidence(makeRecord('work-packet', {
      linkedSession: 'session-primary',
    }), new Map());

    expect(evidence.hasEvidence).toBe(true);
    expect(evidence.implementationSession).toEqual({
      id: 'session-primary',
      session: null,
    });
  });

  it('ignores launch fields for non Work Packet items', () => {
    const evidence = getWorkPacketLaunchEvidence(makeRecord('task', {
      linkedSession: 'session-primary',
      worktreePath: '/workspace/.worktrees/wt_123',
    }), new Map());

    expect(evidence.hasEvidence).toBe(false);
    expect(evidence.sessionIds).toEqual([]);
  });

  it('reports reviewer status from required review, reviewer session, and recorded evidence', () => {
    const required = getWorkPacketLaunchEvidence(makeRecord('work-packet', {
      complexity: 'risky',
      risks: 'database migration',
    }), new Map());
    expect(required.reviewerStatus).toBe('required');
    expect(required.hasEvidence).toBe(true);

    expect(getWorkPacketLaunchEvidence(makeRecord('work-packet', {
      recommendedAgent: 'mixed',
      reviewerSession: 'session-reviewer',
    }), new Map()).reviewerStatus).toBe('session-recorded');

    expect(getWorkPacketLaunchEvidence(makeRecord('work-packet', {
      secondAgentReview: 'Reviewer found no blocking issues.',
    }), new Map()).reviewerStatus).toBe('recorded');

    expect(getWorkPacketLaunchEvidence(makeRecord('work-packet', {
      complexity: 'small',
      risks: 'none',
    }), new Map()).reviewerStatus).toBe('not-required');
  });
});
