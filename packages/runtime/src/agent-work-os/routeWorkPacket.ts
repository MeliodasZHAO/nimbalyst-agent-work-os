export type WorkPacketComplexity = 'tiny' | 'small' | 'medium' | 'large' | 'risky';
export type WorkPacketRecommendedAgent = 'codex' | 'claude-code' | 'mixed' | 'research-only';
export type WorkPacketCapabilityRoute =
  | 'default'
  | 'plan-first'
  | 'pursue-goal'
  | 'high-reasoning'
  | 'second-agent-review';

export type CapabilityRouteProvider = 'codex' | 'claude-code' | 'mixed' | 'research-only';
export type CapabilityRouteSessionMode = 'normal' | 'plan-first' | 'reviewer-only' | 'research-only';

export interface WorkPacketRouteInput {
  complexity?: WorkPacketComplexity | string | null;
  risks?: string | string[] | null;
  recommendedAgent?: WorkPacketRecommendedAgent | string | null;
  capabilityRoute?: WorkPacketCapabilityRoute | string | null;
  requiredSkills?: string[] | null;
  providerAvailability?: Partial<Record<Exclude<CapabilityRouteProvider, 'mixed' | 'research-only'>, boolean>>;
}

export interface CapabilityRouteRecommendation {
  provider: CapabilityRouteProvider;
  sessionMode: CapabilityRouteSessionMode;
  worktreeRecommended: boolean;
  secondAgentReviewRequired: boolean;
  docsGateRequired: boolean;
  humanApprovalRequired: boolean;
  highReasoningRecommended: boolean;
  pursueGoalRecommended: boolean;
  reviewerProvider?: Exclude<CapabilityRouteProvider, 'mixed' | 'research-only'>;
  warnings: string[];
  approvalReasons: string[];
  routingNotes: string[];
}

const RISK_PATTERNS: Array<[RegExp, string]> = [
  [/\b(database|db|schema|migration|migrations?|index|indexes|seed|backfill|truncate|delete|cleanup|stored data|data semantics)\b/i, 'database'],
  [/\b(security|auth|authentication|authorization|permission|secret|token|key|credential)\b/i, 'security'],
  [/\b(ci|release|deploy|deployment|production|runtime|server)\b/i, 'runtime'],
  [/\b(destructive|remove|delete|reset|force|overwrite)\b/i, 'destructive'],
];

function normalizeRiskText(risks: WorkPacketRouteInput['risks']): string {
  if (Array.isArray(risks)) return risks.join('\n');
  return risks ?? '';
}

function hasRisk(riskText: string, risk: string): boolean {
  return RISK_PATTERNS.some(([pattern, label]) => label === risk && pattern.test(riskText));
}

function normalizeComplexity(complexity: WorkPacketRouteInput['complexity']): WorkPacketComplexity {
  const value = complexity ?? 'medium';
  if (value === 'tiny' || value === 'small' || value === 'medium' || value === 'large' || value === 'risky') {
    return value;
  }
  return 'medium';
}

function normalizeRecommendedAgent(agent: WorkPacketRouteInput['recommendedAgent']): WorkPacketRecommendedAgent {
  const value = agent ?? 'codex';
  if (value === 'codex' || value === 'claude-code' || value === 'mixed' || value === 'research-only') {
    return value;
  }
  return 'codex';
}

function normalizeCapabilityRoute(route: WorkPacketRouteInput['capabilityRoute']): WorkPacketCapabilityRoute {
  const value = route ?? 'default';
  if (
    value === 'default' ||
    value === 'plan-first' ||
    value === 'pursue-goal' ||
    value === 'high-reasoning' ||
    value === 'second-agent-review'
  ) {
    return value;
  }
  return 'default';
}

function chooseFallbackProvider(
  preferred: Exclude<CapabilityRouteProvider, 'mixed' | 'research-only'>,
  availability: WorkPacketRouteInput['providerAvailability'],
): Exclude<CapabilityRouteProvider, 'mixed' | 'research-only'> {
  if (!availability || availability[preferred] !== false) return preferred;
  const fallback = preferred === 'codex' ? 'claude-code' : 'codex';
  return availability[fallback] !== false ? fallback : preferred;
}

export function routeWorkPacket(packet: WorkPacketRouteInput): CapabilityRouteRecommendation {
  const complexity = normalizeComplexity(packet.complexity);
  const recommendedAgent = normalizeRecommendedAgent(packet.recommendedAgent);
  const capabilityRoute = normalizeCapabilityRoute(packet.capabilityRoute);
  const riskText = normalizeRiskText(packet.risks);

  const isMediumOrLarger = complexity === 'medium' || complexity === 'large' || complexity === 'risky';
  const isRisky = complexity === 'risky';
  const hasDatabaseRisk = hasRisk(riskText, 'database');
  const hasSecurityRisk = hasRisk(riskText, 'security');
  const hasRuntimeRisk = hasRisk(riskText, 'runtime');
  const hasDestructiveRisk = hasRisk(riskText, 'destructive');
  const hasHighImpactRisk = hasDatabaseRisk || hasSecurityRisk || hasRuntimeRisk || hasDestructiveRisk;

  const warnings: string[] = [];
  const approvalReasons: string[] = [];
  const routingNotes: string[] = [];

  let provider: CapabilityRouteProvider = recommendedAgent;
  if (recommendedAgent !== 'mixed' && recommendedAgent !== 'research-only') {
    provider = chooseFallbackProvider(recommendedAgent, packet.providerAvailability);
    if (provider !== recommendedAgent) {
      warnings.push(`${recommendedAgent} is unavailable; ${provider} is recommended instead.`);
    }
  }

  let sessionMode: CapabilityRouteSessionMode = 'normal';
  if (recommendedAgent === 'research-only') {
    sessionMode = 'research-only';
    routingNotes.push('Research-only packets should gather findings without starting a code-writing agent.');
  } else if (capabilityRoute === 'second-agent-review') {
    sessionMode = 'reviewer-only';
  } else if (isMediumOrLarger || capabilityRoute === 'plan-first' || isRisky || hasHighImpactRisk) {
    sessionMode = 'plan-first';
  }

  const secondAgentReviewRequired = isRisky || hasHighImpactRisk || capabilityRoute === 'second-agent-review';
  const worktreeRecommended = recommendedAgent !== 'research-only' && (isMediumOrLarger || hasHighImpactRisk);
  const docsGateRequired = isMediumOrLarger || hasHighImpactRisk || (packet.requiredSkills?.length ?? 0) > 0;
  const highReasoningRecommended = capabilityRoute === 'high-reasoning' || isRisky || hasSecurityRisk || hasDatabaseRisk;
  const pursueGoalRecommended = capabilityRoute === 'pursue-goal';
  const humanApprovalRequired = isRisky || hasDatabaseRisk || hasSecurityRisk || hasDestructiveRisk;

  if (isMediumOrLarger && sessionMode === 'plan-first') {
    routingNotes.push('Medium, large, and risky Work Packets should start with a plan-first prompt.');
  }
  if (worktreeRecommended) {
    routingNotes.push('Use a worktree session to isolate code changes from the main workspace.');
  }
  if (recommendedAgent === 'mixed') {
    routingNotes.push('Use one agent for implementation and a second agent for review or verification.');
  }
  if (secondAgentReviewRequired) {
    routingNotes.push('A second-agent review is required before Verification Gate.');
  }

  if (hasDatabaseRisk) approvalReasons.push('Database impact requires explicit human approval.');
  if (hasSecurityRisk) approvalReasons.push('Security/auth impact requires explicit human approval.');
  if (hasDestructiveRisk) approvalReasons.push('Destructive command or data-change risk requires explicit human approval.');
  if (isRisky && approvalReasons.length === 0) approvalReasons.push('Risky Work Packet requires explicit human approval.');

  let reviewerProvider: CapabilityRouteRecommendation['reviewerProvider'];
  if (secondAgentReviewRequired) {
    const implementer = provider === 'claude-code' ? 'claude-code' : 'codex';
    reviewerProvider = chooseFallbackProvider(implementer === 'codex' ? 'claude-code' : 'codex', packet.providerAvailability);
  }

  return {
    provider,
    sessionMode,
    worktreeRecommended,
    secondAgentReviewRequired,
    docsGateRequired,
    humanApprovalRequired,
    highReasoningRecommended,
    pursueGoalRecommended,
    reviewerProvider,
    warnings,
    approvalReasons,
    routingNotes,
  };
}
