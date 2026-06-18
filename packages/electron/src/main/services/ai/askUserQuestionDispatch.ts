/**
 * Dispatch logic for AskUserQuestion answers/cancellations arriving from the renderer
 * (`claude-code:answer-question` / `claude-code:cancel-question` IPC handlers).
 *
 * Extracted from AIService.ts so the resolution chain
 * (provider pending map -> MCP IPC channels -> DB fallback -> auto-resume)
 * is unit testable. AIService wires the real dependencies via closures.
 */

export interface AskUserQuestionResponsePayload {
  questionId: string;
  answers: Record<string, string>;
  cancelled: boolean;
  respondedBy: 'desktop';
  sessionId: string;
}

/** Minimal shape of a provider that may hold a pending AskUserQuestion. */
export interface AskCapableProviderLike {
  resolveAskUserQuestion?: (
    questionId: string,
    answers: Record<string, string>,
    sessionId: string,
    respondedBy: 'desktop'
  ) => boolean;
  rejectAskUserQuestion?: (questionId: string, error: Error) => void;
  abort?: () => void;
}

export interface AskUserQuestionDispatchDeps {
  /** Live provider instance for the session, or null (e.g., after an app restart). */
  getProvider: () => AskCapableProviderLike | null;
  listenerCount: (channel: string) => number;
  emitToChannel: (channel: string, payload: AskUserQuestionResponsePayload) => void;
  /** Fire-and-forget persistence for the MCP server's database polling fallback. */
  persistResponse: (payload: AskUserQuestionResponsePayload) => void;
  /**
   * Resume a session whose SDK subprocess is gone by sending the answers as a
   * new user message. Undefined when the send-message pipeline is unavailable.
   */
  autoResume?: (message: string) => void;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
}

export type AskUserQuestionResolution =
  | 'provider'
  | 'mcp-ipc'
  | 'session-ipc'
  | 'auto-resume'
  | 'noop-cancel'
  | 'none';

export interface AskUserQuestionDispatchResult {
  success: boolean;
  error?: string;
  resolution: AskUserQuestionResolution;
}

export function specificQuestionChannel(sessionId: string, questionId: string): string {
  return `ask-user-question-response:${sessionId}:${questionId}`;
}

export function sessionQuestionChannel(sessionId: string): string {
  return `ask-user-question:${sessionId}`;
}

export function formatAnswersAsResumeMessage(answers: Record<string, string>): string {
  const answerText = Object.entries(answers)
    .map(([question, answer]) => `${question}: ${answer}`)
    .join('\n');
  return `[Resuming after answering a question]\n\n${answerText}`;
}

export function dispatchAskUserQuestionAnswer(
  params: { questionId: string; answers: Record<string, string>; sessionId: string },
  deps: AskUserQuestionDispatchDeps
): AskUserQuestionDispatchResult {
  const { questionId, answers, sessionId } = params;
  const payload: AskUserQuestionResponsePayload = {
    questionId,
    answers,
    cancelled: false,
    respondedBy: 'desktop',
    sessionId,
  };

  // A missing provider is normal after an app restart -- the pending map died
  // with the process. Fall through to the IPC/DB/auto-resume fallbacks instead
  // of failing here (an early return previously made Submit silently dead).
  const provider = deps.getProvider();
  const providerResolved = provider?.resolveAskUserQuestion
    ? provider.resolveAskUserQuestion(questionId, answers, sessionId, 'desktop')
    : false;

  // MCP interactive tools (Codex path) wait on session-scoped channels. Emit
  // best-effort so pending MCP calls can resolve even if the provider-level
  // pending map is unavailable.
  const specificChannel = specificQuestionChannel(sessionId, questionId);
  const hasMcpWaiter = deps.listenerCount(specificChannel) > 0;
  if (hasMcpWaiter) {
    deps.log.info(`[AIService] AskUserQuestion emitting on MCP channel: ${specificChannel}`);
    deps.emitToChannel(specificChannel, payload);
  }

  const fallbackChannel = sessionQuestionChannel(sessionId);
  const hasSessionFallbackWaiter = deps.listenerCount(fallbackChannel) > 0;
  if (hasSessionFallbackWaiter) {
    deps.log.info(`[AIService] AskUserQuestion emitting on session fallback channel: ${fallbackChannel}`);
    deps.emitToChannel(fallbackChannel, payload);
  }

  // When AskUserQuestion comes through the MCP server path (not the provider's
  // canUseTool path), the provider's pending map won't have the entry. Persist
  // the response so the MCP server's database polling can find it.
  if (!providerResolved) {
    deps.persistResponse(payload);
  }

  deps.log.info(
    `[AIService] AskUserQuestion resolution: providerResolved=${providerResolved}, hasMcpWaiter=${hasMcpWaiter}, hasSessionFallbackWaiter=${hasSessionFallbackWaiter}`
  );

  if (providerResolved) return { success: true, resolution: 'provider' };
  if (hasMcpWaiter) return { success: true, resolution: 'mcp-ipc' };
  if (hasSessionFallbackWaiter) return { success: true, resolution: 'session-ipc' };

  // No live handler exists -- the SDK subprocess is dead (e.g., app restarted
  // while the session was waiting for input). Auto-resume the session with the
  // answers as a new message; the SDK resumes via the stored providerSessionId.
  if (deps.autoResume) {
    deps.log.info(`[AIService] No live handler for AskUserQuestion, auto-resuming session: ${sessionId}`);
    deps.autoResume(formatAnswersAsResumeMessage(answers));
    return { success: true, resolution: 'auto-resume' };
  }

  deps.log.warn(`[AIService] Question not found for provider/session: ${sessionId}`);
  return { success: false, error: 'Question not found', resolution: 'none' };
}

export function dispatchAskUserQuestionCancel(
  params: { questionId: string; sessionId: string },
  deps: AskUserQuestionDispatchDeps
): AskUserQuestionDispatchResult {
  const { questionId, sessionId } = params;
  const payload: AskUserQuestionResponsePayload = {
    questionId,
    answers: {},
    cancelled: true,
    respondedBy: 'desktop',
    sessionId,
  };

  // Tolerate a missing provider (post-restart): there is nothing live to
  // cancel, but the card must still settle instead of silently failing.
  const provider = deps.getProvider();
  const providerSupportsCancel = typeof provider?.rejectAskUserQuestion === 'function';
  if (providerSupportsCancel) {
    provider!.rejectAskUserQuestion!(questionId, new Error('User cancelled'));
  }

  const specificChannel = specificQuestionChannel(sessionId, questionId);
  const hasMcpWaiter = deps.listenerCount(specificChannel) > 0;
  if (hasMcpWaiter) {
    deps.emitToChannel(specificChannel, payload);
  }

  const fallbackChannel = sessionQuestionChannel(sessionId);
  const hasSessionFallbackWaiter = deps.listenerCount(fallbackChannel) > 0;
  if (hasSessionFallbackWaiter) {
    deps.emitToChannel(fallbackChannel, payload);
  }

  // Write cancellation to database as fallback for MCP server polling
  if (!providerSupportsCancel) {
    deps.persistResponse(payload);
  }

  if (!providerSupportsCancel && !hasMcpWaiter && !hasSessionFallbackWaiter) {
    // Nothing live holds the question (e.g., app restarted while waiting).
    // The cancellation was persisted above; treat as a tolerated no-op.
    deps.log.info(`[AIService] Question cancel found no live target, treating as no-op: ${sessionId}`);
    return { success: true, resolution: 'noop-cancel' };
  }

  // For MCP-backed AskUserQuestion (Codex), let the MCP tool call resolve with
  // a cancelled result instead of force-aborting the provider. Immediate abort can
  // interrupt the in-flight MCP request before the cancellation result is delivered.
  if (!hasMcpWaiter && !hasSessionFallbackWaiter && provider?.abort) {
    provider.abort();
  }

  return { success: true, resolution: providerSupportsCancel ? 'provider' : hasMcpWaiter ? 'mcp-ipc' : 'session-ipc' };
}
