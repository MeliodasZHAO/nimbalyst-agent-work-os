import { describe, expect, it } from 'vitest';
import {
  getModelOptionsForProviderChoice,
  getReasoningLevelsForProviderChoice,
  normalizeModelForProviderChoice,
  normalizeReasoningForProviderChoice,
  resolveConcreteProvidersForChoice,
} from '../providerCapabilities';

const availableModels = {
  'openai-codex': [
    { id: 'openai-codex:gpt-5.1-codex', name: 'GPT-5.1 Codex' },
  ],
  'openai-codex-acp': [
    { id: 'openai-codex-acp:gpt-5.1-codex', name: 'GPT-5.1 Codex ACP' },
  ],
  'claude-code': [
    { id: 'claude-code:sonnet', name: 'Claude Sonnet' },
  ],
  openai: [
    { id: 'openai:gpt-5.1', name: 'GPT-5.1' },
  ],
};

describe('Agent Work OS provider capabilities', () => {
  it('resolves abstract Codex to concrete Codex agent providers', () => {
    expect(resolveConcreteProvidersForChoice('codex')).toEqual([
      'openai-codex',
      'openai-codex-acp',
      'opencode',
      'copilot-cli',
    ]);
  });

  it('filters model options to models owned by the selected agent family', () => {
    const options = getModelOptionsForProviderChoice('codex', availableModels);

    expect(options.map(option => option.value)).toEqual([
      'auto',
      'openai-codex:gpt-5.1-codex',
      'openai-codex-acp:gpt-5.1-codex',
    ]);
    expect(options.some(option => option.value === 'openai:gpt-5.1')).toBe(false);
    expect(options.some(option => option.value === 'claude-code:sonnet')).toBe(false);
  });

  it('keeps auto, mixed, and research-only model choices managed', () => {
    expect(getModelOptionsForProviderChoice('auto', availableModels)).toEqual([
      { value: 'auto', label: 'Auto model' },
    ]);
    expect(getModelOptionsForProviderChoice('mixed', availableModels)).toEqual([
      { value: 'auto', label: 'Auto model' },
    ]);
    expect(getModelOptionsForProviderChoice('research-only', availableModels)).toEqual([
      { value: 'auto', label: 'Auto model' },
    ]);
  });

  it('limits reasoning choices to provider capabilities', () => {
    expect(getReasoningLevelsForProviderChoice('claude-code')).toContain('max');
    expect(getReasoningLevelsForProviderChoice('codex')).toContain('high');
    expect(getReasoningLevelsForProviderChoice('research-only')).toEqual(['auto']);
  });

  it('normalizes unsupported model and reasoning selections back to auto', () => {
    expect(normalizeModelForProviderChoice('codex', 'claude-code:sonnet', availableModels)).toBe('auto');
    expect(normalizeReasoningForProviderChoice('research-only', 'high')).toBe('auto');
  });
});
