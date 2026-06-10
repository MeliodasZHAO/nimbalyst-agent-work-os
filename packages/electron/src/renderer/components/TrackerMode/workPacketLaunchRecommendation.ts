import {
  buildWorkPacketPrompt,
  mergeAgentWorkOSConfigs,
  normalizeModelForProviderChoice,
  normalizeReasoningForProviderChoice,
  recommendWorkPacketExecution,
  type AgentWorkOSConfig,
  type AgentWorkOSProviderPreference,
  type WorkPacketExecutionRecommendation,
} from '@nimbalyst/runtime/agent-work-os';
import type { TrackerRecord } from '@nimbalyst/runtime/core/TrackerRecord';
import type { AIProviderType } from '@nimbalyst/runtime/ai/server/types';
import { isAgentProvider, ModelIdentifier } from '@nimbalyst/runtime/ai/server/types';
import type { AIProviderSettings } from '../../store/atoms/appSettings';

export type AgentSessionProvider = Extract<
  AIProviderType,
  'claude-code' | 'openai-codex' | 'openai-codex-acp' | 'opencode' | 'copilot-cli'
>;

export interface WorkPacketLaunchPlanInput {
  trackerItem: TrackerRecord;
  systemConfig?: unknown;
  projectConfig?: unknown;
  aiProviderSettings: Pick<AIProviderSettings, 'providers' | 'availableModels'>;
  defaultModel?: string | null;
  extraFields?: Record<string, unknown>;
}

export interface WorkPacketLaunchPlan {
  config: AgentWorkOSConfig;
  recommendation: WorkPacketExecutionRecommendation;
  provider: AgentSessionProvider;
  model?: string;
  effortLevel?: 'low' | 'medium' | 'high' | 'max';
  metadata: Record<string, unknown>;
  prompt: string;
  reviewerProvider?: AgentSessionProvider;
  reviewerModel?: string;
  reviewerEffortLevel?: 'low' | 'medium' | 'high' | 'max';
  reviewerPrompt?: string;
  shouldCreateReviewerSession: boolean;
}

const CODEX_AGENT_PROVIDERS: AgentSessionProvider[] = ['openai-codex', 'openai-codex-acp'];
const FALLBACK_AGENT_PROVIDERS: AgentSessionProvider[] = [
  'claude-code',
  'openai-codex',
  'openai-codex-acp',
  'opencode',
  'copilot-cli',
];

function stringifyField(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(stringifyField).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getEnabledAgentProviders(settings: Pick<AIProviderSettings, 'providers'>): Set<AgentSessionProvider> {
  const enabled = new Set<AgentSessionProvider>();
  for (const provider of FALLBACK_AGENT_PROVIDERS) {
    if (settings.providers[provider]?.enabled === true) {
      enabled.add(provider);
    }
  }
  return enabled;
}

function firstEnabledProvider(
  enabled: Set<AgentSessionProvider>,
  candidates: AgentSessionProvider[],
): AgentSessionProvider | undefined {
  return candidates.find(provider => enabled.has(provider));
}

export function getWorkPacketProviderAvailability(
  settings: Pick<AIProviderSettings, 'providers'>,
) {
  const enabled = getEnabledAgentProviders(settings);
  return {
    codex: CODEX_AGENT_PROVIDERS.some(provider => enabled.has(provider)),
    'claude-code': enabled.has('claude-code'),
  };
}

function parseDefaultAgentProvider(defaultModel?: string | null): AgentSessionProvider | undefined {
  const parsed = defaultModel ? ModelIdentifier.tryParse(defaultModel) : null;
  return isAgentProvider(parsed?.provider) ? parsed.provider : undefined;
}

function providerFromPreference(preference?: AgentWorkOSProviderPreference): 'codex' | 'claude-code' | undefined {
  if (preference?.provider === 'codex' || preference?.provider === 'claude-code') {
    return preference.provider;
  }
  return undefined;
}

function abstractAgentForProvider(provider: AgentSessionProvider): 'codex' | 'claude-code' {
  return provider === 'claude-code' ? 'claude-code' : 'codex';
}

function resolveProviderForAbstractAgent(
  agent: WorkPacketExecutionRecommendation['route']['provider'],
  config: AgentWorkOSConfig,
  settings: Pick<AIProviderSettings, 'providers'>,
  defaultModel?: string | null,
): AgentSessionProvider {
  const enabled = getEnabledAgentProviders(settings);
  const defaultProvider = parseDefaultAgentProvider(defaultModel);
  const implementerPreference = providerFromPreference(config.providerPreferences.implementer);

  if (agent === 'claude-code') {
    return enabled.has('claude-code')
      ? 'claude-code'
      : firstEnabledProvider(enabled, FALLBACK_AGENT_PROVIDERS) ?? 'claude-code';
  }

  if (agent === 'codex') {
    if (defaultProvider && CODEX_AGENT_PROVIDERS.includes(defaultProvider) && enabled.has(defaultProvider)) {
      return defaultProvider;
    }
    return firstEnabledProvider(enabled, CODEX_AGENT_PROVIDERS)
      ?? firstEnabledProvider(enabled, FALLBACK_AGENT_PROVIDERS)
      ?? 'openai-codex';
  }

  if (agent === 'mixed') {
    if (implementerPreference === 'claude-code' && enabled.has('claude-code')) return 'claude-code';
    if (implementerPreference === 'codex') {
      const preferredCodex = firstEnabledProvider(enabled, CODEX_AGENT_PROVIDERS);
      if (preferredCodex) return preferredCodex;
    }
    if (defaultProvider && enabled.has(defaultProvider)) return defaultProvider;
    return firstEnabledProvider(enabled, FALLBACK_AGENT_PROVIDERS) ?? 'claude-code';
  }

  if (defaultProvider && enabled.has(defaultProvider)) return defaultProvider;
  return firstEnabledProvider(enabled, FALLBACK_AGENT_PROVIDERS) ?? 'claude-code';
}

function resolveReviewerProvider(
  recommendation: WorkPacketExecutionRecommendation,
  primaryProvider: AgentSessionProvider,
  settings: Pick<AIProviderSettings, 'providers'>,
): AgentSessionProvider | undefined {
  if (!recommendation.route.secondAgentReviewRequired) return undefined;
  const enabled = getEnabledAgentProviders(settings);
  const abstractReviewer = recommendation.route.reviewerProvider;
  if (abstractReviewer === 'claude-code' && enabled.has('claude-code')) return 'claude-code';
  if (abstractReviewer === 'codex') {
    const codex = firstEnabledProvider(enabled, CODEX_AGENT_PROVIDERS);
    if (codex) return codex;
  }

  const opposite = primaryProvider === 'claude-code'
    ? firstEnabledProvider(enabled, CODEX_AGENT_PROVIDERS)
    : enabled.has('claude-code') ? 'claude-code' : undefined;
  return opposite ?? primaryProvider;
}

function resolveModelForProvider(
  provider: AgentSessionProvider,
  config: AgentWorkOSConfig,
  settings: Pick<AIProviderSettings, 'availableModels'>,
  defaultModel?: string | null,
  role: 'implementer' | 'reviewer' = 'implementer',
): string | undefined {
  const preference = config.providerPreferences[role];
  if (preference?.model && preference.model !== 'auto') {
    const normalizedPreferenceModel = normalizeModelForProviderChoice(
      abstractAgentForProvider(provider),
      preference.model,
      settings.availableModels,
    );
    if (normalizedPreferenceModel === 'auto') {
      // Ignore stale/incompatible saved preferences and continue to the
      // default-model and provider-catalog fallbacks below.
    } else {
      const parsedPreference = ModelIdentifier.tryParse(preference.model);
      if (!parsedPreference || parsedPreference.provider === provider) {
        return preference.model;
      }
    }
  }

  const parsedDefault = defaultModel ? ModelIdentifier.tryParse(defaultModel) : null;
  if (parsedDefault?.provider === provider && defaultModel) {
    return defaultModel;
  }

  return settings.availableModels[provider]?.[0]?.id;
}

function resolveEffortLevel(recommendation: WorkPacketExecutionRecommendation): WorkPacketLaunchPlan['effortLevel'] {
  const reasoning = recommendation.reasoning === 'auto' && recommendation.route.highReasoningRecommended
    ? 'high'
    : recommendation.reasoning;
  const normalized = normalizeReasoningForProviderChoice(recommendation.route.provider, reasoning);
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'max') {
    return normalized;
  }
  return undefined;
}

function shouldCreateReviewerSession(recommendation: WorkPacketExecutionRecommendation): boolean {
  return recommendation.route.secondAgentReviewRequired
    || recommendation.route.provider === 'mixed'
    || recommendation.collaborationMode === 'implement-review'
    || recommendation.collaborationMode === 'frontend-repair'
    || recommendation.collaborationMode === 'risky-change';
}

function buildReviewerPrompt(
  record: TrackerRecord,
  recommendation: WorkPacketExecutionRecommendation,
  primarySessionId?: string,
): string {
  const fields = record.fields;
  const title = stringifyField(fields.title) || record.issueKey || record.id;
  const source = record.system.documentPath ? `@${record.system.documentPath}` : record.sourceRef;
  const lines: string[] = [
    'Do not edit files. Review the implementation session against this Work Packet. Findings first, ordered by severity. If no issues are found, say that clearly and list any remaining verification gaps.',
    '',
    `# Second-Agent Review: ${title}`,
  ];

  if (record.issueKey || record.id) lines.push(`- id: ${record.issueKey || record.id}`);
  if (source) lines.push(`- source: ${source}`);
  if (primarySessionId) lines.push(`- implementationSession: ${primarySessionId}`);
  lines.push(`- collaborationMode: ${recommendation.collaborationMode}`);
  lines.push(`- required: ${recommendation.route.secondAgentReviewRequired ? 'yes' : 'recommended'}`);
  lines.push(`- primaryProvider: ${recommendation.route.provider}`);
  if (recommendation.route.reviewerProvider) lines.push(`- reviewerProvider: ${recommendation.route.reviewerProvider}`);

  const successCriteria = stringifyField(fields.successCriteria).trim();
  const verification = stringifyField(fields.verification).trim();
  const risks = stringifyField(fields.risks).trim();
  const diffSummary = stringifyField(fields.diffSummary).trim();
  const testsRun = stringifyField(fields.testsRun).trim();

  if (successCriteria) lines.push('', '## Success Criteria', successCriteria);
  if (verification) lines.push('', '## Verification Expected', verification);
  if (risks) lines.push('', '## Risks', risks);
  if (diffSummary) lines.push('', '## Existing Diff Summary', diffSummary);
  if (testsRun) lines.push('', '## Tests Already Run', testsRun);

  lines.push(
    '',
    '## Review Instructions',
    '- Compare the current diff and session output with the Work Packet success criteria.',
    '- Check database, security, destructive, runtime, and frontend visual evidence risks when relevant.',
    '- Do not approve shipping unless Review Gate and Verification Gate evidence are present.',
    '- Write review findings into the Work Packet secondAgentReview or reviewEvidence field when tools are available.',
  );

  return lines.join('\n');
}

export function createWorkPacketLaunchPlan(input: WorkPacketLaunchPlanInput): WorkPacketLaunchPlan {
  const config = mergeAgentWorkOSConfigs(input.systemConfig, input.projectConfig);
  const fields = input.trackerItem.fields;
  const recommendation = recommendWorkPacketExecution({
    complexity: stringifyField(fields.complexity),
    risks: stringifyField(fields.risks),
    recommendedAgent: stringifyField(fields.recommendedAgent),
    capabilityRoute: stringifyField(fields.capabilityRoute),
    requiredSkills: Array.isArray(fields.requiredSkills)
      ? fields.requiredSkills.map(item => stringifyField(item)).filter(Boolean)
      : undefined,
    providerAvailability: getWorkPacketProviderAvailability(input.aiProviderSettings),
  }, config);
  const provider = resolveProviderForAbstractAgent(
    recommendation.route.provider,
    config,
    input.aiProviderSettings,
    input.defaultModel,
  );
  const model = resolveModelForProvider(provider, config, input.aiProviderSettings, input.defaultModel);
  const reviewerProvider = resolveReviewerProvider(recommendation, provider, input.aiProviderSettings);
  const effortLevel = resolveEffortLevel(recommendation);
  const reviewerEffortLevel = resolveEffortLevel({
    ...recommendation,
    reasoning: config.providerPreferences.reviewer?.reasoning ?? recommendation.reasoning,
  });
  const reviewerModel = reviewerProvider
    ? resolveModelForProvider(reviewerProvider, config, input.aiProviderSettings, input.defaultModel, 'reviewer')
    : undefined;
  const createReviewer = shouldCreateReviewerSession(recommendation);
  const promptRecord = input.extraFields
    ? {
      ...input.trackerItem,
      fields: {
        ...input.trackerItem.fields,
        ...input.extraFields,
      },
    }
    : input.trackerItem;

  return {
    config,
    recommendation,
    provider,
    model,
    effortLevel,
    metadata: {
      ...(effortLevel ? { effortLevel } : {}),
      agentWorkOS: {
        controlMode: recommendation.controlMode,
        collaborationMode: recommendation.collaborationMode,
        reasoning: recommendation.reasoning,
        agentSource: recommendation.agentSource,
        routeSource: recommendation.routeSource,
        provider,
        reviewerProvider,
        routeProvider: recommendation.route.provider,
        sessionMode: recommendation.route.sessionMode,
        worktreeRecommended: recommendation.route.worktreeRecommended,
        secondAgentReviewRequired: recommendation.route.secondAgentReviewRequired,
      },
    },
    prompt: buildWorkPacketPrompt(promptRecord, recommendation),
    reviewerProvider,
    reviewerModel,
    reviewerEffortLevel,
    reviewerPrompt: createReviewer
      ? buildReviewerPrompt(promptRecord, recommendation, stringifyField(input.extraFields?.linkedSession) || undefined)
      : undefined,
    shouldCreateReviewerSession: createReviewer,
  };
}
