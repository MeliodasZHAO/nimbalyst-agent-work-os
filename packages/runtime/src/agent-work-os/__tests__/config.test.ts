import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_WORK_OS_CONFIG,
  mergeAgentWorkOSConfigs,
  normalizeAgentWorkOSConfig,
  validateAgentWorkOSConfig,
} from '../config';

describe('Agent Work OS config', () => {
  it('normalizes missing input to assisted defaults', () => {
    const config = normalizeAgentWorkOSConfig(null);

    expect(config.automation.controlMode).toBe('assisted');
    expect(config.automation.defaultAgent).toBe('auto');
    expect(config.automation.preferWorktreesForMediumRisk).toBe(true);
    expect(config.mobilePermissions.mode).toBe('balanced');
    expect(config.mobilePermissions.allowCommitApproval).toBe(false);
  });

  it('normalizes partial config without losing default role preferences', () => {
    const config = normalizeAgentWorkOSConfig({
      automation: {
        controlMode: 'autopilot',
        defaultCollaborationMode: 'frontend-repair',
      },
      mobilePermissions: {
        mode: 'flexible',
        allowCommitApproval: true,
      },
      providerPreferences: {
        reviewer: {
          provider: 'codex',
          model: 'gpt-5-codex',
          reasoning: 'max',
        },
      },
    });

    expect(config.automation.controlMode).toBe('autopilot');
    expect(config.automation.defaultCollaborationMode).toBe('frontend-repair');
    expect(config.automation.defaultAgent).toBe(DEFAULT_AGENT_WORK_OS_CONFIG.automation.defaultAgent);
    expect(config.mobilePermissions.mode).toBe('flexible');
    expect(config.mobilePermissions.allowCommitApproval).toBe(true);
    expect(config.providerPreferences.reviewer?.model).toBe('gpt-5-codex');
    expect(config.providerPreferences.implementer?.provider).toBe('auto');
  });

  it('reports invalid enum values during validation', () => {
    const result = validateAgentWorkOSConfig({
      version: 1,
      automation: {
        controlMode: 'delegate-everything',
        defaultAgent: 'made-up-agent',
      },
      mobilePermissions: {
        mode: 'reckless',
      },
      providerPreferences: {
        painter: {
          provider: 'codex',
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'automation.controlMode is invalid.',
      'automation.defaultAgent is invalid.',
      'mobilePermissions.mode is invalid.',
      'providerPreferences.painter is not a supported agent role.',
    ]));
  });

  it('merges project overrides without dropping system defaults', () => {
    const config = mergeAgentWorkOSConfigs({
      automation: {
        controlMode: 'manual',
        defaultAgent: 'codex',
        defaultReasoning: 'high',
      },
      mobilePermissions: {
        mode: 'strict',
      },
    }, {
      automation: {
        defaultAgent: 'claude-code',
      },
      providerPreferences: {
        reviewer: {
          provider: 'codex',
          model: 'auto',
          reasoning: 'max',
        },
      },
    });

    expect(config.automation.controlMode).toBe('manual');
    expect(config.automation.defaultAgent).toBe('claude-code');
    expect(config.automation.defaultReasoning).toBe('high');
    expect(config.mobilePermissions.mode).toBe('strict');
    expect(config.providerPreferences.reviewer?.reasoning).toBe('max');
  });

  it('accepts the default config', () => {
    const result = validateAgentWorkOSConfig(DEFAULT_AGENT_WORK_OS_CONFIG);

    expect(result.valid).toBe(true);
    expect(result.normalized?.automation.controlMode).toBe('assisted');
  });
});
