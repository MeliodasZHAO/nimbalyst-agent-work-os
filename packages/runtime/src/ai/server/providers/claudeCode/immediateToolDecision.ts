export type ToolDecision = { behavior: 'allow' | 'deny'; updatedInput?: any; message?: string };

interface TrustStatus {
  trusted: boolean;
  mode: string | null;
}

interface ResolveImmediateToolDecisionDeps {
  internalMcpTools: readonly string[];
  teamTools: readonly string[];
  trustChecker?: (path: string) => TrustStatus;
  resolveTeamContext: (sessionId: string | undefined) => Promise<string | undefined>;
  handleAskUserQuestion: (
    sessionId: string | undefined,
    input: any,
    options: { signal: AbortSignal; suggestions?: any[]; toolUseID?: string },
    toolUseID?: string
  ) => Promise<ToolDecision>;
  handleExitPlanMode: (
    sessionId: string | undefined,
    input: any,
    options: { signal: AbortSignal; toolUseID?: string },
  ) => Promise<ToolDecision>;
  setCurrentMode: (mode: 'planning' | 'agent') => void;
  logSecurity: (message: string, data?: Record<string, unknown>) => void;
  /** When set, returns the resolved mobile permission policy for auto-approval */
  mobilePermissionPolicyResolver?: () => { allowToolPermissionApproval: boolean } | null;
}

interface ResolveImmediateToolDecisionParams {
  toolName: string;
  input: any;
  options: { signal: AbortSignal; suggestions?: any[]; toolUseID?: string };
  sessionId: string | undefined;
  pathForTrust: string | undefined;
}

const ALLOW_ALL_FILE_EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'Read', 'Glob', 'Grep', 'LS', 'NotebookEdit'];

export async function resolveImmediateToolDecision(
  deps: ResolveImmediateToolDecisionDeps,
  params: ResolveImmediateToolDecisionParams
): Promise<ToolDecision | null> {
  const { toolName, input, options, sessionId, pathForTrust } = params;

  if (deps.internalMcpTools.includes(toolName)) {
    return { behavior: 'allow', updatedInput: input };
  }

  if (toolName === 'AskUserQuestion') {
    return deps.handleAskUserQuestion(sessionId, input, options, options.toolUseID);
  }

  if (toolName === 'EnterPlanMode') {
    deps.setCurrentMode('planning');
    return null; // Let SDK handle natively
  }

  if (toolName === 'ExitPlanMode') {
    return deps.handleExitPlanMode(sessionId, input, options);
  }

  if (deps.teamTools.includes(toolName)) {
    if (toolName === 'TeamDelete') {
      const hasExplicitTeam =
        typeof input?.team_name === 'string' && input.team_name.trim().length > 0;
      if (!hasExplicitTeam) {
        const inferredTeam = await deps.resolveTeamContext(sessionId);
        if (inferredTeam) {
          return {
            behavior: 'allow',
            updatedInput: {
              ...input,
              team_name: inferredTeam,
            }
          };
        }
      }
    }
    return { behavior: 'allow', updatedInput: input };
  }

  if (pathForTrust && deps.trustChecker) {
    const trustStatus = deps.trustChecker(pathForTrust);
    if (!trustStatus.trusted) {
      deps.logSecurity('[canUseTool] Workspace not trusted, denying tool:', { toolName });
      return {
        behavior: 'deny',
        message: 'Workspace is not trusted. Please trust the workspace to use AI tools.'
      };
    }

    if (trustStatus.mode === 'bypass-all') {
      return { behavior: 'allow', updatedInput: input };
    }

    if (trustStatus.mode === 'allow-all' && ALLOW_ALL_FILE_EDIT_TOOLS.includes(toolName)) {
      deps.logSecurity('[canUseTool] Allow-all mode, auto-approving file tool:', { toolName });
      return { behavior: 'allow', updatedInput: input };
    }
  }

  // Auto-approve when the Agent Work OS mobile permission policy allows tool approval.
  // This prevents interactive prompts from being created for sessions where the operator
  // has already granted standing approval, matching the intent of flexible/custom modes.
  const mobilePolicy = deps.mobilePermissionPolicyResolver?.();
  if (mobilePolicy?.allowToolPermissionApproval) {
    deps.logSecurity('[canUseTool] Auto-approving via mobile permission policy:', { toolName });
    return { behavior: 'allow', updatedInput: input };
  }

  return null;
}
