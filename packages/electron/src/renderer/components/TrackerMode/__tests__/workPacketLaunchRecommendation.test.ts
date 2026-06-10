import { describe, expect, it } from 'vitest';
import type { TrackerRecord } from '@nimbalyst/runtime/core/TrackerRecord';
import type { AIProviderSettings } from '../../../store/atoms/appSettings';
import { createWorkPacketLaunchPlan, getWorkPacketProviderAvailability } from '../workPacketLaunchRecommendation';

function makeRecord(fields: Record<string, unknown>): TrackerRecord {
  return {
    id: 'fm:work-packet:plans/frontend-fix.md',
    primaryType: 'work-packet',
    typeTags: ['work-packet'],
    issueKey: 'WPKT-42',
    source: 'frontmatter',
    sourceRef: 'plans/frontend-fix.md',
    archived: false,
    syncStatus: 'local',
    system: {
      workspace: '/workspace',
      documentPath: 'plans/frontend-fix.md',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    fields: {
      title: 'Repair settings layout',
      ...fields,
    },
  };
}

function makeSettings(overrides: Partial<AIProviderSettings> = {}): AIProviderSettings {
  return {
    providers: {
      claude: { enabled: false },
      'claude-code': { enabled: false },
      openai: { enabled: false },
      'openai-codex': { enabled: false },
      'openai-codex-acp': { enabled: false },
      opencode: { enabled: false },
      'copilot-cli': { enabled: false },
      lmstudio: { enabled: false },
      ...overrides.providers,
    },
    apiKeys: {},
    availableModels: {},
    ...overrides,
  };
}

describe('workPacketLaunchRecommendation', () => {
  it('maps an abstract codex recommendation to an enabled Codex agent provider', () => {
    const plan = createWorkPacketLaunchPlan({
      trackerItem: makeRecord({
        complexity: 'medium',
        recommendedAgent: 'codex',
        capabilityRoute: 'plan-first',
      }),
      aiProviderSettings: makeSettings({
        providers: {
          'openai-codex-acp': { enabled: true },
        },
        availableModels: {
          'openai-codex-acp': [{ id: 'openai-codex-acp:gpt-5.4', name: 'GPT-5.4', provider: 'openai-codex-acp' }],
        },
      }),
      defaultModel: 'claude-code:default',
    });

    expect(plan.provider).toBe('openai-codex-acp');
    expect(plan.model).toBe('openai-codex-acp:gpt-5.4');
    expect(plan.metadata.agentWorkOS).toMatchObject({
      provider: 'openai-codex-acp',
      routeProvider: 'codex',
      sessionMode: 'plan-first',
    });
    expect(plan.prompt).toContain('## Agent Work OS Launch Recommendation');
    expect(plan.prompt).toContain('- controlMode: assisted');
  });

  it('lets project config override system defaults for launch routing', () => {
    const plan = createWorkPacketLaunchPlan({
      trackerItem: makeRecord({
        complexity: 'small',
        recommendedAgent: 'auto',
        capabilityRoute: 'auto',
      }),
      systemConfig: {
        automation: {
          defaultAgent: 'codex',
        },
      },
      projectConfig: {
        automation: {
          defaultAgent: 'claude-code',
          defaultCollaborationMode: 'implement-review',
        },
      },
      aiProviderSettings: makeSettings({
        providers: {
          'claude-code': { enabled: true },
          'openai-codex': { enabled: true },
        },
      }),
    });

    expect(plan.provider).toBe('claude-code');
    expect(plan.recommendation.collaborationMode).toBe('implement-review');
    expect(plan.recommendation.agentSource).toBe('config');
  });

  it('converts high-reasoning recommendations into session effort metadata', () => {
    const plan = createWorkPacketLaunchPlan({
      trackerItem: makeRecord({
        complexity: 'risky',
        recommendedAgent: 'codex',
        capabilityRoute: 'high-reasoning',
        risks: 'database migration',
      }),
      aiProviderSettings: makeSettings({
        providers: {
          'openai-codex': { enabled: true },
        },
      }),
    });

    expect(plan.effortLevel).toBe('high');
    expect(plan.metadata.effortLevel).toBe('high');
  });

  it('ignores role model preferences outside the resolved provider capability set', () => {
    const plan = createWorkPacketLaunchPlan({
      trackerItem: makeRecord({
        complexity: 'medium',
        recommendedAgent: 'codex',
        capabilityRoute: 'plan-first',
      }),
      systemConfig: {
        providerPreferences: {
          implementer: {
            provider: 'codex',
            model: 'claude-code:sonnet',
            reasoning: 'auto',
          },
        },
      },
      aiProviderSettings: makeSettings({
        providers: {
          'openai-codex': { enabled: true },
        },
        availableModels: {
          'openai-codex': [{ id: 'openai-codex:gpt-5.1-codex', name: 'GPT-5.1 Codex', provider: 'openai-codex' }],
          'claude-code': [{ id: 'claude-code:sonnet', name: 'Claude Sonnet', provider: 'claude-code' }],
        },
      }),
    });

    expect(plan.provider).toBe('openai-codex');
    expect(plan.model).toBe('openai-codex:gpt-5.1-codex');
  });

  it('plans a reviewer session for mixed or risky collaboration routes', () => {
    const plan = createWorkPacketLaunchPlan({
      trackerItem: makeRecord({
        complexity: 'risky',
        recommendedAgent: 'mixed',
        capabilityRoute: 'second-agent-review',
        risks: 'security-sensitive runtime change',
        successCriteria: 'The risky flow has review evidence.',
      }),
      aiProviderSettings: makeSettings({
        providers: {
          'claude-code': { enabled: true },
          'openai-codex': { enabled: true },
        },
      }),
      extraFields: {
        linkedSession: 'session-primary',
      },
    });

    expect(plan.shouldCreateReviewerSession).toBe(true);
    expect(plan.reviewerProvider).toBeDefined();
    expect(plan.reviewerPrompt).toContain('Do not edit files.');
    expect(plan.reviewerPrompt).toContain('implementationSession: session-primary');
    expect(plan.reviewerPrompt).toContain('The risky flow has review evidence.');
  });

  it('adds frontend visual verification guidance for frontend repair launches', () => {
    const plan = createWorkPacketLaunchPlan({
      trackerItem: makeRecord({
        complexity: 'medium',
        recommendedAgent: 'claude-code',
        capabilityRoute: 'plan-first',
        successCriteria: 'The settings panel layout works on desktop and mobile.',
        verification: 'Inspect the UI with screenshots.',
      }),
      systemConfig: {
        automation: {
          defaultCollaborationMode: 'frontend-repair',
          requireFrontendVisualEvidence: true,
        },
      },
      aiProviderSettings: makeSettings({
        providers: {
          'claude-code': { enabled: true },
          'openai-codex': { enabled: true },
        },
      }),
    });

    expect(plan.shouldCreateReviewerSession).toBe(true);
    expect(plan.prompt).toContain('## Frontend Visual Verification');
    expect(plan.prompt).toContain('desktop and mobile-sized viewports');
    expect(plan.prompt).toContain('verificationEvidence or runtimeEvidence');
  });

  it('reports provider availability using real enabled agent providers', () => {
    expect(getWorkPacketProviderAvailability(makeSettings({
      providers: {
        'openai-codex': { enabled: true },
        'claude-code': { enabled: false },
      },
    }))).toEqual({
      codex: true,
      'claude-code': false,
    });
  });
});
