import { describe, expect, it } from 'vitest';
import { routeWorkPacket } from '../routeWorkPacket';

describe('routeWorkPacket', () => {
  it('keeps tiny packets on a normal session without a worktree', () => {
    const route = routeWorkPacket({
      complexity: 'tiny',
      recommendedAgent: 'codex',
      capabilityRoute: 'default',
    });

    expect(route.provider).toBe('codex');
    expect(route.sessionMode).toBe('normal');
    expect(route.worktreeRecommended).toBe(false);
    expect(route.secondAgentReviewRequired).toBe(false);
    expect(route.humanApprovalRequired).toBe(false);
  });

  it('routes medium packets through plan-first with a worktree recommendation', () => {
    const route = routeWorkPacket({
      complexity: 'medium',
      recommendedAgent: 'claude-code',
    });

    expect(route.provider).toBe('claude-code');
    expect(route.sessionMode).toBe('plan-first');
    expect(route.worktreeRecommended).toBe(true);
    expect(route.docsGateRequired).toBe(true);
  });

  it('recommends worktrees for large packets', () => {
    const route = routeWorkPacket({
      complexity: 'large',
      recommendedAgent: 'codex',
    });

    expect(route.sessionMode).toBe('plan-first');
    expect(route.worktreeRecommended).toBe(true);
  });

  it('requires review, worktree isolation, and approval for risky packets', () => {
    const route = routeWorkPacket({
      complexity: 'risky',
      recommendedAgent: 'mixed',
    });

    expect(route.provider).toBe('mixed');
    expect(route.sessionMode).toBe('plan-first');
    expect(route.worktreeRecommended).toBe(true);
    expect(route.secondAgentReviewRequired).toBe(true);
    expect(route.humanApprovalRequired).toBe(true);
    expect(route.reviewerProvider).toBeDefined();
  });

  it('requires human approval for database risk even on small packets', () => {
    const route = routeWorkPacket({
      complexity: 'small',
      recommendedAgent: 'codex',
      risks: 'Touches database schema and migrations.',
    });

    expect(route.sessionMode).toBe('plan-first');
    expect(route.worktreeRecommended).toBe(true);
    expect(route.secondAgentReviewRequired).toBe(true);
    expect(route.humanApprovalRequired).toBe(true);
    expect(route.highReasoningRecommended).toBe(true);
    expect(route.approvalReasons).toContain('Database impact requires explicit human approval.');
  });

  it('keeps research-only packets from code-writing launch modes', () => {
    const route = routeWorkPacket({
      complexity: 'large',
      recommendedAgent: 'research-only',
    });

    expect(route.provider).toBe('research-only');
    expect(route.sessionMode).toBe('research-only');
    expect(route.worktreeRecommended).toBe(false);
  });

  it('falls back when the preferred provider is unavailable', () => {
    const route = routeWorkPacket({
      complexity: 'small',
      recommendedAgent: 'codex',
      providerAvailability: { codex: false, 'claude-code': true },
    });

    expect(route.provider).toBe('claude-code');
    expect(route.warnings).toContain('codex is unavailable; claude-code is recommended instead.');
  });
});
