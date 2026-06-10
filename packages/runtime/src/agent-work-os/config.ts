import type {
  WorkPacketCapabilityRoute,
  WorkPacketRecommendedAgent,
} from './routeWorkPacket';

export type AgentWorkOSConfigScope = 'system' | 'project';
export type AgentWorkOSControlMode = 'manual' | 'assisted' | 'autopilot';
export type AgentWorkOSReasoningLevel = 'auto' | 'low' | 'medium' | 'high' | 'max';
export type AgentWorkOSMobilePolicyMode = 'strict' | 'balanced' | 'flexible' | 'custom';
export type AgentWorkOSCollaborationMode =
  | 'solo'
  | 'plan-implement'
  | 'implement-review'
  | 'frontend-repair'
  | 'risky-change'
  | 'research-only';

export type AgentWorkOSAgentRole =
  | 'planner'
  | 'implementer'
  | 'reviewer'
  | 'verifier'
  | 'frontend-inspector'
  | 'researcher';

export interface AgentWorkOSProviderPreference {
  provider: WorkPacketRecommendedAgent | 'auto';
  model: string | 'auto';
  reasoning: AgentWorkOSReasoningLevel;
}

export interface AgentWorkOSMobilePermissionPolicy {
  mode: AgentWorkOSMobilePolicyMode;
  allowPlanApproval: boolean;
  allowToolPermissionApproval: boolean;
  allowCommitApproval: boolean;
  allowDatabaseRiskApproval: boolean;
  allowSecurityRiskApproval: boolean;
  allowDestructiveRiskApproval: boolean;
  requireDesktopForShipped: boolean;
}

export interface AgentWorkOSAutomationPolicy {
  controlMode: AgentWorkOSControlMode;
  defaultAgent: WorkPacketRecommendedAgent | 'auto';
  defaultCapabilityRoute: WorkPacketCapabilityRoute | 'auto';
  defaultCollaborationMode: AgentWorkOSCollaborationMode;
  defaultReasoning: AgentWorkOSReasoningLevel;
  preferWorktreesForMediumRisk: boolean;
  requireFrontendVisualEvidence: boolean;
  allowAgentToUpdateWorkPackets: boolean;
}

export interface AgentWorkOSConfig {
  version: 1;
  automation: AgentWorkOSAutomationPolicy;
  mobilePermissions: AgentWorkOSMobilePermissionPolicy;
  providerPreferences: Partial<Record<AgentWorkOSAgentRole, AgentWorkOSProviderPreference>>;
}

export interface AgentWorkOSValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: AgentWorkOSConfig;
}

const AGENTS = new Set(['auto', 'codex', 'claude-code', 'mixed', 'research-only']);
const ROUTES = new Set(['auto', 'default', 'plan-first', 'pursue-goal', 'high-reasoning', 'second-agent-review']);
const REASONING = new Set(['auto', 'low', 'medium', 'high', 'max']);
const CONTROL_MODES = new Set(['manual', 'assisted', 'autopilot']);
const MOBILE_MODES = new Set(['strict', 'balanced', 'flexible', 'custom']);
const COLLABORATION_MODES = new Set([
  'solo',
  'plan-implement',
  'implement-review',
  'frontend-repair',
  'risky-change',
  'research-only',
]);
const AGENT_ROLES = new Set([
  'planner',
  'implementer',
  'reviewer',
  'verifier',
  'frontend-inspector',
  'researcher',
]);

export const DEFAULT_AGENT_WORK_OS_MOBILE_POLICY: AgentWorkOSMobilePermissionPolicy = {
  mode: 'balanced',
  allowPlanApproval: true,
  allowToolPermissionApproval: true,
  allowCommitApproval: false,
  allowDatabaseRiskApproval: false,
  allowSecurityRiskApproval: false,
  allowDestructiveRiskApproval: false,
  requireDesktopForShipped: true,
};

export function resolveMobilePermissionPolicyForMode(
  mode: AgentWorkOSMobilePolicyMode,
  custom?: Partial<AgentWorkOSMobilePermissionPolicy>,
): AgentWorkOSMobilePermissionPolicy {
  const presets: Record<AgentWorkOSMobilePolicyMode, AgentWorkOSMobilePermissionPolicy> = {
    strict: {
      mode: 'strict',
      allowPlanApproval: false,
      allowToolPermissionApproval: false,
      allowCommitApproval: false,
      allowDatabaseRiskApproval: false,
      allowSecurityRiskApproval: false,
      allowDestructiveRiskApproval: false,
      requireDesktopForShipped: true,
    },
    balanced: DEFAULT_AGENT_WORK_OS_MOBILE_POLICY,
    flexible: {
      mode: 'flexible',
      allowPlanApproval: true,
      allowToolPermissionApproval: true,
      allowCommitApproval: true,
      allowDatabaseRiskApproval: false,
      allowSecurityRiskApproval: false,
      allowDestructiveRiskApproval: false,
      requireDesktopForShipped: true,
    },
    custom: {
      ...DEFAULT_AGENT_WORK_OS_MOBILE_POLICY,
      mode: 'custom',
      ...custom,
    },
  };

  return presets[mode];
}

export const DEFAULT_AGENT_WORK_OS_CONFIG: AgentWorkOSConfig = {
  version: 1,
  automation: {
    controlMode: 'assisted',
    defaultAgent: 'auto',
    defaultCapabilityRoute: 'auto',
    defaultCollaborationMode: 'solo',
    defaultReasoning: 'auto',
    preferWorktreesForMediumRisk: true,
    requireFrontendVisualEvidence: true,
    allowAgentToUpdateWorkPackets: true,
  },
  mobilePermissions: DEFAULT_AGENT_WORK_OS_MOBILE_POLICY,
  providerPreferences: {
    planner: { provider: 'auto', model: 'auto', reasoning: 'high' },
    implementer: { provider: 'auto', model: 'auto', reasoning: 'auto' },
    reviewer: { provider: 'auto', model: 'auto', reasoning: 'high' },
    verifier: { provider: 'codex', model: 'auto', reasoning: 'medium' },
    'frontend-inspector': { provider: 'claude-code', model: 'auto', reasoning: 'medium' },
    researcher: { provider: 'research-only', model: 'auto', reasoning: 'medium' },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boolOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringInSet<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? value as T : fallback;
}

export function normalizeAgentWorkOSConfig(input: unknown): AgentWorkOSConfig {
  if (!isRecord(input)) return DEFAULT_AGENT_WORK_OS_CONFIG;

  const automation = isRecord(input.automation) ? input.automation : {};
  const mobilePermissions = isRecord(input.mobilePermissions) ? input.mobilePermissions : {};
  const providerPreferences = isRecord(input.providerPreferences) ? input.providerPreferences : {};

  const normalizedProviderPreferences: AgentWorkOSConfig['providerPreferences'] = {};
  for (const [role, preference] of Object.entries(providerPreferences)) {
    if (!AGENT_ROLES.has(role) || !isRecord(preference)) continue;
    normalizedProviderPreferences[role as AgentWorkOSAgentRole] = {
      provider: stringInSet(preference.provider, AGENTS, 'auto'),
      model: typeof preference.model === 'string' && preference.model.trim().length > 0
        ? preference.model
        : 'auto',
      reasoning: stringInSet(preference.reasoning, REASONING, 'auto'),
    };
  }

  return {
    version: 1,
    automation: {
      controlMode: stringInSet(automation.controlMode, CONTROL_MODES, DEFAULT_AGENT_WORK_OS_CONFIG.automation.controlMode),
      defaultAgent: stringInSet(automation.defaultAgent, AGENTS, DEFAULT_AGENT_WORK_OS_CONFIG.automation.defaultAgent),
      defaultCapabilityRoute: stringInSet(
        automation.defaultCapabilityRoute,
        ROUTES,
        DEFAULT_AGENT_WORK_OS_CONFIG.automation.defaultCapabilityRoute,
      ),
      defaultCollaborationMode: stringInSet(
        automation.defaultCollaborationMode,
        COLLABORATION_MODES,
        DEFAULT_AGENT_WORK_OS_CONFIG.automation.defaultCollaborationMode,
      ),
      defaultReasoning: stringInSet(automation.defaultReasoning, REASONING, DEFAULT_AGENT_WORK_OS_CONFIG.automation.defaultReasoning),
      preferWorktreesForMediumRisk: boolOrDefault(
        automation.preferWorktreesForMediumRisk,
        DEFAULT_AGENT_WORK_OS_CONFIG.automation.preferWorktreesForMediumRisk,
      ),
      requireFrontendVisualEvidence: boolOrDefault(
        automation.requireFrontendVisualEvidence,
        DEFAULT_AGENT_WORK_OS_CONFIG.automation.requireFrontendVisualEvidence,
      ),
      allowAgentToUpdateWorkPackets: boolOrDefault(
        automation.allowAgentToUpdateWorkPackets,
        DEFAULT_AGENT_WORK_OS_CONFIG.automation.allowAgentToUpdateWorkPackets,
      ),
    },
    mobilePermissions: {
      mode: stringInSet(mobilePermissions.mode, MOBILE_MODES, DEFAULT_AGENT_WORK_OS_MOBILE_POLICY.mode),
      allowPlanApproval: boolOrDefault(mobilePermissions.allowPlanApproval, DEFAULT_AGENT_WORK_OS_MOBILE_POLICY.allowPlanApproval),
      allowToolPermissionApproval: boolOrDefault(
        mobilePermissions.allowToolPermissionApproval,
        DEFAULT_AGENT_WORK_OS_MOBILE_POLICY.allowToolPermissionApproval,
      ),
      allowCommitApproval: boolOrDefault(mobilePermissions.allowCommitApproval, DEFAULT_AGENT_WORK_OS_MOBILE_POLICY.allowCommitApproval),
      allowDatabaseRiskApproval: boolOrDefault(
        mobilePermissions.allowDatabaseRiskApproval,
        DEFAULT_AGENT_WORK_OS_MOBILE_POLICY.allowDatabaseRiskApproval,
      ),
      allowSecurityRiskApproval: boolOrDefault(
        mobilePermissions.allowSecurityRiskApproval,
        DEFAULT_AGENT_WORK_OS_MOBILE_POLICY.allowSecurityRiskApproval,
      ),
      allowDestructiveRiskApproval: boolOrDefault(
        mobilePermissions.allowDestructiveRiskApproval,
        DEFAULT_AGENT_WORK_OS_MOBILE_POLICY.allowDestructiveRiskApproval,
      ),
      requireDesktopForShipped: boolOrDefault(
        mobilePermissions.requireDesktopForShipped,
        DEFAULT_AGENT_WORK_OS_MOBILE_POLICY.requireDesktopForShipped,
      ),
    },
    providerPreferences: {
      ...DEFAULT_AGENT_WORK_OS_CONFIG.providerPreferences,
      ...normalizedProviderPreferences,
    },
  };
}

export function mergeAgentWorkOSConfigs(
  baseInput?: unknown,
  overrideInput?: unknown,
): AgentWorkOSConfig {
  const base = normalizeAgentWorkOSConfig(baseInput);
  if (!isRecord(overrideInput)) return base;

  const automationOverride = isRecord(overrideInput.automation) ? overrideInput.automation : {};
  const mobilePermissionsOverride = isRecord(overrideInput.mobilePermissions) ? overrideInput.mobilePermissions : {};
  const providerPreferencesOverride = isRecord(overrideInput.providerPreferences) ? overrideInput.providerPreferences : {};
  return normalizeAgentWorkOSConfig({
    ...base,
    ...overrideInput,
    automation: {
      ...base.automation,
      ...automationOverride,
    },
    mobilePermissions: {
      ...base.mobilePermissions,
      ...mobilePermissionsOverride,
    },
    providerPreferences: {
      ...base.providerPreferences,
      ...providerPreferencesOverride,
    },
  });
}

export function validateAgentWorkOSConfig(input: unknown): AgentWorkOSValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      errors: ['Configuration must be a JSON object.'],
    };
  }

  if (input.version !== undefined && input.version !== 1) {
    errors.push('version must be 1.');
  }

  const automation = isRecord(input.automation) ? input.automation : undefined;
  if (!automation) {
    errors.push('automation must be an object.');
  } else {
    if (automation.controlMode !== undefined && !CONTROL_MODES.has(String(automation.controlMode))) {
      errors.push('automation.controlMode is invalid.');
    }
    if (automation.defaultAgent !== undefined && !AGENTS.has(String(automation.defaultAgent))) {
      errors.push('automation.defaultAgent is invalid.');
    }
    if (automation.defaultCapabilityRoute !== undefined && !ROUTES.has(String(automation.defaultCapabilityRoute))) {
      errors.push('automation.defaultCapabilityRoute is invalid.');
    }
    if (automation.defaultCollaborationMode !== undefined && !COLLABORATION_MODES.has(String(automation.defaultCollaborationMode))) {
      errors.push('automation.defaultCollaborationMode is invalid.');
    }
    if (automation.defaultReasoning !== undefined && !REASONING.has(String(automation.defaultReasoning))) {
      errors.push('automation.defaultReasoning is invalid.');
    }
  }

  const mobilePermissions = isRecord(input.mobilePermissions) ? input.mobilePermissions : undefined;
  if (!mobilePermissions) {
    errors.push('mobilePermissions must be an object.');
  } else if (mobilePermissions.mode !== undefined && !MOBILE_MODES.has(String(mobilePermissions.mode))) {
    errors.push('mobilePermissions.mode is invalid.');
  }

  const providerPreferences = isRecord(input.providerPreferences) ? input.providerPreferences : undefined;
  if (!providerPreferences) {
    errors.push('providerPreferences must be an object.');
  } else {
    for (const [role, preference] of Object.entries(providerPreferences)) {
      if (!AGENT_ROLES.has(role)) {
        errors.push(`providerPreferences.${role} is not a supported agent role.`);
        continue;
      }
      if (!isRecord(preference)) {
        errors.push(`providerPreferences.${role} must be an object.`);
        continue;
      }
      if (preference.provider !== undefined && !AGENTS.has(String(preference.provider))) {
        errors.push(`providerPreferences.${role}.provider is invalid.`);
      }
      if (preference.reasoning !== undefined && !REASONING.has(String(preference.reasoning))) {
        errors.push(`providerPreferences.${role}.reasoning is invalid.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: errors.length === 0 ? normalizeAgentWorkOSConfig(input) : undefined,
  };
}
