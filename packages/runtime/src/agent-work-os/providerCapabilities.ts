import type { AgentWorkOSAgentRole, AgentWorkOSReasoningLevel } from './config';

export type AgentWorkOSConcreteProvider =
  | 'claude-code'
  | 'openai-codex'
  | 'openai-codex-acp'
  | 'opencode'
  | 'copilot-cli';

export type AgentWorkOSProviderChoice =
  | 'auto'
  | 'codex'
  | 'claude-code'
  | 'mixed'
  | 'research-only';

export interface AgentWorkOSProviderCapability {
  provider: AgentWorkOSConcreteProvider;
  label: string;
  abstractAgents: AgentWorkOSProviderChoice[];
  supportedRoles: AgentWorkOSAgentRole[];
  supportsExplicitModel: boolean;
  supportsReasoning: boolean;
  reasoningLevels: AgentWorkOSReasoningLevel[];
  notes: string[];
}

export interface AgentWorkOSModelOption {
  value: string;
  label: string;
}

export const AGENT_WORK_OS_PROVIDER_CAPABILITIES: Record<
  AgentWorkOSConcreteProvider,
  AgentWorkOSProviderCapability
> = {
  'claude-code': {
    provider: 'claude-code',
    label: 'Claude Agent',
    abstractAgents: ['claude-code', 'mixed'],
    supportedRoles: ['planner', 'implementer', 'reviewer', 'frontend-inspector', 'researcher'],
    supportsExplicitModel: true,
    supportsReasoning: true,
    reasoningLevels: ['auto', 'low', 'medium', 'high', 'max'],
    notes: ['Provider-managed models are selected through Claude Agent capabilities.'],
  },
  'openai-codex': {
    provider: 'openai-codex',
    label: 'OpenAI Codex',
    abstractAgents: ['codex', 'mixed'],
    supportedRoles: ['planner', 'implementer', 'reviewer', 'verifier', 'frontend-inspector'],
    supportsExplicitModel: true,
    supportsReasoning: true,
    reasoningLevels: ['auto', 'low', 'medium', 'high', 'max'],
    notes: ['Reasoning effort maps to Codex model reasoning effort.'],
  },
  'openai-codex-acp': {
    provider: 'openai-codex-acp',
    label: 'Codex ACP',
    abstractAgents: ['codex', 'mixed'],
    supportedRoles: ['planner', 'implementer', 'reviewer', 'verifier', 'frontend-inspector'],
    supportsExplicitModel: true,
    supportsReasoning: true,
    reasoningLevels: ['auto', 'low', 'medium', 'high', 'max'],
    notes: ['Experimental ACP transport reuses the Codex model catalog.'],
  },
  opencode: {
    provider: 'opencode',
    label: 'OpenCode',
    abstractAgents: ['codex', 'mixed', 'research-only'],
    supportedRoles: ['planner', 'implementer', 'reviewer', 'verifier', 'researcher'],
    supportsExplicitModel: true,
    supportsReasoning: false,
    reasoningLevels: ['auto'],
    notes: ['Model and reasoning behavior are delegated to OpenCode provider configuration.'],
  },
  'copilot-cli': {
    provider: 'copilot-cli',
    label: 'GitHub Copilot',
    abstractAgents: ['codex', 'mixed'],
    supportedRoles: ['implementer', 'reviewer', 'verifier'],
    supportsExplicitModel: false,
    supportsReasoning: false,
    reasoningLevels: ['auto'],
    notes: ['Uses CLI-managed model selection.'],
  },
};

export const AGENT_WORK_OS_CONCRETE_PROVIDERS = Object.keys(
  AGENT_WORK_OS_PROVIDER_CAPABILITIES,
) as AgentWorkOSConcreteProvider[];

export function getAgentWorkOSProviderCapability(
  provider: string | null | undefined,
): AgentWorkOSProviderCapability | null {
  if (!provider) return null;
  return AGENT_WORK_OS_PROVIDER_CAPABILITIES[provider as AgentWorkOSConcreteProvider] ?? null;
}

export function resolveConcreteProvidersForChoice(
  choice: AgentWorkOSProviderChoice,
): AgentWorkOSConcreteProvider[] {
  if (choice === 'auto') return AGENT_WORK_OS_CONCRETE_PROVIDERS;
  if (choice === 'mixed') {
    return AGENT_WORK_OS_CONCRETE_PROVIDERS.filter(provider =>
      AGENT_WORK_OS_PROVIDER_CAPABILITIES[provider].abstractAgents.includes('mixed'));
  }
  if (choice === 'research-only') {
    return AGENT_WORK_OS_CONCRETE_PROVIDERS.filter(provider =>
      AGENT_WORK_OS_PROVIDER_CAPABILITIES[provider].abstractAgents.includes('research-only'));
  }
  return AGENT_WORK_OS_CONCRETE_PROVIDERS.filter(provider =>
    AGENT_WORK_OS_PROVIDER_CAPABILITIES[provider].abstractAgents.includes(choice));
}

export function getReasoningLevelsForProviderChoice(
  choice: AgentWorkOSProviderChoice,
): AgentWorkOSReasoningLevel[] {
  if (choice === 'auto' || choice === 'mixed' || choice === 'research-only') return ['auto'];
  const providers = resolveConcreteProvidersForChoice(choice);
  const levels = new Set<AgentWorkOSReasoningLevel>(['auto']);
  for (const provider of providers) {
    const capability = AGENT_WORK_OS_PROVIDER_CAPABILITIES[provider];
    for (const level of capability.reasoningLevels) levels.add(level);
  }
  return ['auto', 'low', 'medium', 'high', 'max'].filter(level => levels.has(level as AgentWorkOSReasoningLevel)) as AgentWorkOSReasoningLevel[];
}

export function getModelOptionsForProviderChoice(
  choice: AgentWorkOSProviderChoice,
  availableModels: Record<string, Array<{ id: string; name?: string; provider?: string }>>,
): AgentWorkOSModelOption[] {
  if (choice === 'auto' || choice === 'mixed' || choice === 'research-only') {
    return [{ value: 'auto', label: 'Auto model' }];
  }

  const options: AgentWorkOSModelOption[] = [{ value: 'auto', label: 'Auto model' }];
  for (const provider of resolveConcreteProvidersForChoice(choice)) {
    const capability = AGENT_WORK_OS_PROVIDER_CAPABILITIES[provider];
    if (!capability.supportsExplicitModel) continue;
    for (const model of availableModels[provider] ?? []) {
      options.push({
        value: model.id,
        label: model.name || model.id,
      });
    }
  }
  return options;
}

export function normalizeReasoningForProviderChoice(
  choice: AgentWorkOSProviderChoice,
  reasoning: AgentWorkOSReasoningLevel,
): AgentWorkOSReasoningLevel {
  const supported = getReasoningLevelsForProviderChoice(choice);
  return supported.includes(reasoning) ? reasoning : 'auto';
}

export function normalizeModelForProviderChoice(
  choice: AgentWorkOSProviderChoice,
  model: string,
  availableModels: Record<string, Array<{ id: string; name?: string; provider?: string }>>,
): string {
  if (model === 'auto') return 'auto';
  const options = getModelOptionsForProviderChoice(choice, availableModels);
  return options.some(option => option.value === model) ? model : 'auto';
}
