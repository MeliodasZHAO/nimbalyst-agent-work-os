/**
 * Regression tests for the AskUserQuestion answer/cancel dispatch chain.
 *
 * Bug (2026-06-11): after an app restart, ProviderFactory has no provider
 * instance for the session, and the dispatch early-returned "Provider not
 * found" BEFORE reaching the auto-resume fallback. The renderer didn't check
 * the failed result either, so Submit silently did nothing while the card
 * showed "Submitted". These tests pin the post-restart paths.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  dispatchAskUserQuestionAnswer,
  dispatchAskUserQuestionCancel,
  formatAnswersAsResumeMessage,
  specificQuestionChannel,
  sessionQuestionChannel,
  type AskUserQuestionDispatchDeps,
} from '../askUserQuestionDispatch';

const SESSION_ID = 'session-1234';
const QUESTION_ID = 'toolu_01Question';
const ANSWERS = { '导出格式': '拼进商品列' };

function makeDeps(overrides: Partial<AskUserQuestionDispatchDeps> = {}): AskUserQuestionDispatchDeps & {
  emitted: Array<{ channel: string; payload: unknown }>;
  persisted: unknown[];
} {
  const emitted: Array<{ channel: string; payload: unknown }> = [];
  const persisted: unknown[] = [];
  return {
    emitted,
    persisted,
    getProvider: () => null,
    listenerCount: () => 0,
    emitToChannel: (channel, payload) => emitted.push({ channel, payload }),
    persistResponse: (payload) => persisted.push(payload),
    log: { info: () => {}, warn: () => {} },
    ...overrides,
  };
}

describe('dispatchAskUserQuestionAnswer', () => {
  it('resolves via provider pending map when the provider holds the question', () => {
    const resolveAskUserQuestion = vi.fn().mockReturnValue(true);
    const deps = makeDeps({ getProvider: () => ({ resolveAskUserQuestion }) });

    const result = dispatchAskUserQuestionAnswer(
      { questionId: QUESTION_ID, answers: ANSWERS, sessionId: SESSION_ID },
      deps
    );

    expect(result).toEqual({ success: true, resolution: 'provider' });
    expect(resolveAskUserQuestion).toHaveBeenCalledWith(QUESTION_ID, ANSWERS, SESSION_ID, 'desktop');
    expect(deps.persisted).toHaveLength(0);
  });

  it('emits on the MCP channel and persists when the provider map misses (MCP path)', () => {
    const deps = makeDeps({
      getProvider: () => ({ resolveAskUserQuestion: () => false }),
      listenerCount: (channel) => (channel === specificQuestionChannel(SESSION_ID, QUESTION_ID) ? 1 : 0),
    });

    const result = dispatchAskUserQuestionAnswer(
      { questionId: QUESTION_ID, answers: ANSWERS, sessionId: SESSION_ID },
      deps
    );

    expect(result).toEqual({ success: true, resolution: 'mcp-ipc' });
    expect(deps.emitted).toHaveLength(1);
    expect(deps.emitted[0].channel).toBe(specificQuestionChannel(SESSION_ID, QUESTION_ID));
    expect(deps.persisted).toHaveLength(1);
  });

  it('REGRESSION: auto-resumes when the provider instance is gone after a restart', () => {
    // Post-restart state: ProviderFactory.getProvider returns null, no MCP
    // listeners exist. The user's answers must still reach the session via
    // the auto-resume fallback instead of failing with "Provider not found".
    const autoResume = vi.fn();
    const deps = makeDeps({ getProvider: () => null, autoResume });

    const result = dispatchAskUserQuestionAnswer(
      { questionId: QUESTION_ID, answers: ANSWERS, sessionId: SESSION_ID },
      deps
    );

    expect(result.success).toBe(true);
    expect(result.resolution).toBe('auto-resume');
    expect(autoResume).toHaveBeenCalledWith(formatAnswersAsResumeMessage(ANSWERS));
    // The response is also persisted so a recovered MCP poller can find it.
    expect(deps.persisted).toHaveLength(1);
  });

  it('auto-resumes when a fresh (empty) provider instance exists but holds no pending question', () => {
    const autoResume = vi.fn();
    const deps = makeDeps({
      getProvider: () => ({ resolveAskUserQuestion: () => false }),
      autoResume,
    });

    const result = dispatchAskUserQuestionAnswer(
      { questionId: QUESTION_ID, answers: ANSWERS, sessionId: SESSION_ID },
      deps
    );

    expect(result.success).toBe(true);
    expect(result.resolution).toBe('auto-resume');
    expect(autoResume).toHaveBeenCalledOnce();
  });

  it('fails loudly (success: false) when nothing can take the answer', () => {
    const deps = makeDeps({ getProvider: () => null, autoResume: undefined });

    const result = dispatchAskUserQuestionAnswer(
      { questionId: QUESTION_ID, answers: ANSWERS, sessionId: SESSION_ID },
      deps
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('formats multi-question answers into a readable resume message', () => {
    const message = formatAnswersAsResumeMessage({ Q1: 'A1', Q2: 'A2' });
    expect(message).toContain('Q1: A1');
    expect(message).toContain('Q2: A2');
    expect(message.startsWith('[Resuming after answering a question]')).toBe(true);
  });
});

describe('dispatchAskUserQuestionCancel', () => {
  it('rejects via the provider when available and aborts when no MCP waiter exists', () => {
    const rejectAskUserQuestion = vi.fn();
    const abort = vi.fn();
    const deps = makeDeps({ getProvider: () => ({ rejectAskUserQuestion, abort }) });

    const result = dispatchAskUserQuestionCancel(
      { questionId: QUESTION_ID, sessionId: SESSION_ID },
      deps
    );

    expect(result.success).toBe(true);
    expect(rejectAskUserQuestion).toHaveBeenCalledOnce();
    expect(abort).toHaveBeenCalledOnce();
  });

  it('REGRESSION: cancel after a restart is a tolerated no-op, not a hard failure', () => {
    // Post-restart there is nothing to cancel -- the session is not running.
    // The card should settle as cancelled instead of silently failing.
    const deps = makeDeps({ getProvider: () => null });

    const result = dispatchAskUserQuestionCancel(
      { questionId: QUESTION_ID, sessionId: SESSION_ID },
      deps
    );

    expect(result.success).toBe(true);
    expect(result.resolution).toBe('noop-cancel');
    // Persisted so an MCP poller that comes back can observe the cancellation.
    expect(deps.persisted).toHaveLength(1);
  });

  it('resolves via MCP channel without aborting the provider', () => {
    const abort = vi.fn();
    const deps = makeDeps({
      getProvider: () => ({ abort }),
      listenerCount: (channel) => (channel === sessionQuestionChannel(SESSION_ID) ? 1 : 0),
    });

    const result = dispatchAskUserQuestionCancel(
      { questionId: QUESTION_ID, sessionId: SESSION_ID },
      deps
    );

    expect(result.success).toBe(true);
    expect(abort).not.toHaveBeenCalled();
    expect(deps.emitted).toHaveLength(1);
  });
});
