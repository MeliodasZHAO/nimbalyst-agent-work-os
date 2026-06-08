import { describe, expect, it } from 'vitest';
import { recommendWorkPacketExecution } from '../recommendWorkPacketExecution';

describe('recommendWorkPacketExecution', () => {
  it('uses config defaults when packet leaves agent and route on auto', () => {
    const recommendation = recommendWorkPacketExecution({
      complexity: 'medium',
      recommendedAgent: 'auto',
      capabilityRoute: 'auto',
      risks: 'none',
    }, {
      automation: {
        defaultAgent: 'claude-code',
        defaultCapabilityRoute: 'high-reasoning',
        defaultCollaborationMode: 'implement-review',
        defaultReasoning: 'high',
      },
      mobilePermissions: {},
      providerPreferences: {},
    });

    expect(recommendation.route.provider).toBe('claude-code');
    expect(recommendation.route.highReasoningRecommended).toBe(true);
    expect(recommendation.collaborationMode).toBe('implement-review');
    expect(recommendation.reasoning).toBe('high');
    expect(recommendation.agentSource).toBe('config');
    expect(recommendation.routeSource).toBe('config');
  });

  it('keeps explicit packet routing ahead of config defaults', () => {
    const recommendation = recommendWorkPacketExecution({
      complexity: 'small',
      recommendedAgent: 'codex',
      capabilityRoute: 'plan-first',
      risks: 'none',
    }, {
      automation: {
        defaultAgent: 'claude-code',
        defaultCapabilityRoute: 'second-agent-review',
      },
      mobilePermissions: {},
      providerPreferences: {},
    });

    expect(recommendation.route.provider).toBe('codex');
    expect(recommendation.route.sessionMode).toBe('plan-first');
    expect(recommendation.agentSource).toBe('packet');
    expect(recommendation.routeSource).toBe('packet');
  });

  it('can turn off default worktree recommendation from config', () => {
    const recommendation = recommendWorkPacketExecution({
      complexity: 'medium',
      recommendedAgent: 'codex',
      capabilityRoute: 'plan-first',
      risks: 'none',
    }, {
      automation: {
        preferWorktreesForMediumRisk: false,
      },
      mobilePermissions: {},
      providerPreferences: {},
    });

    expect(recommendation.route.worktreeRecommended).toBe(false);
    expect(recommendation.notes.join(' ')).toContain('skipping isolation');
  });
});
