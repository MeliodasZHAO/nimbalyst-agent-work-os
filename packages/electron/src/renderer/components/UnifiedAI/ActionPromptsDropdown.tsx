import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { usePostHog } from 'posthog-js/react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { isAgentProvider } from '@nimbalyst/runtime/ai/server/types';
import { FloatingPortal, useFloatingMenu } from '../../hooks/useFloatingMenu';
import {
  actionPromptsAtomFamily,
  type ActionPrompt,
} from '../../store/atoms/actionPrompts';

interface ActionPromptsDropdownProps {
  workspacePath: string;
  /**
   * Called with the action body when the user picks an action whose config is
   * `launch: same-session` (or has no config at all). The composer should
   * replace its draft with this string and push an undo snapshot.
   */
  onInsert: (body: string) => void;
  /**
   * Called when the user picks an action whose config is `launch: new-session`.
   * If omitted, the dropdown falls back to the same-session insert path so
   * the action still does something useful.
   */
  onLaunchNewSession?: (action: ActionPrompt) => void | Promise<void>;
  /**
   * Provider of the current session. Used by the built-in cross-model review
   * action to pick a reviewer from a DIFFERENT provider (writer blind spots
   * don't transfer across models).
   */
  currentProvider?: string | null;
}

/**
 * Prompt body for the built-in cross-model review action. The launch handler
 * appends an "Originating session: @@[...]" reference so the reviewer can pull
 * context from the session under review.
 */
const CROSS_MODEL_REVIEW_BODY = `Act as an independent code reviewer for work done by another agent session (referenced below).

1. Run \`git status\` and \`git diff\` (plus \`git log\` for recent commits on this branch) to see exactly what changed.
2. Review the changes for: correctness bugs, missed edge cases, data-consistency problems, security issues, and deviations from this project's conventions (check CLAUDE.md and the docs it references).
3. Be adversarial: try to refute the implementation's assumptions rather than confirm them.
4. Do NOT modify any code. Deliver a review report -- findings ordered by severity, each with file:line references and a concrete suggested fix. End with a clear verdict: approve, approve-with-nits, or request-changes.`;

/**
 * Pick a reviewer model from a different agent provider than the writer.
 * Falls back to the writer's provider default (still useful -- fresh context)
 * when no other agent provider is configured.
 */
async function pickCrossModelReviewModel(currentProvider?: string | null): Promise<string | undefined> {
  try {
    const response = await window.electronAPI.aiGetModels();
    if (response?.success && response.grouped) {
      for (const [provider, models] of Object.entries(response.grouped as Record<string, Array<{ id: string }>>)) {
        if (provider !== currentProvider && isAgentProvider(provider) && models.length > 0) {
          return models[0].id;
        }
      }
    }
  } catch (err) {
    console.error('[ActionPromptsDropdown] Failed to pick cross-model reviewer:', err);
  }
  // Same provider, default model -- a fresh session still avoids the
  // writer-session's accumulated context bias.
  return undefined;
}

function firstLinePreview(body: string, maxLen = 80): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? '';
  const trimmed = firstLine.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 1) + '…';
}

export function ActionPromptsDropdown({ workspacePath, onInsert, onLaunchNewSession, currentProvider }: ActionPromptsDropdownProps) {
  const { t } = useTranslation('agent');
  const state = useAtomValue(actionPromptsAtomFamily(workspacePath));
  const setState = useSetAtom(actionPromptsAtomFamily(workspacePath));
  const posthog = usePostHog();

  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const menu = useFloatingMenu({
    placement: 'top-end',
    offsetPx: 6,
    constrainHeight: false,
  });

  // First-load fetch when the workspace changes. We always (re)load on mount
  // for the current workspace so the dropdown reflects fresh state without
  // relying on a broadcast that only fires on subsequent changes.
  useEffect(() => {
    if (!workspacePath) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await window.electronAPI?.invoke?.('action-prompts:list', { workspacePath });
        if (cancelled || !result) return;
        setState({
          actions: result.actions ?? [],
          diagnostics: result.diagnostics ?? [],
          filePath: result.filePath ?? null,
          fileExists: result.fileExists ?? false,
          loaded: true,
        });
      } catch (err) {
        console.error('[ActionPromptsDropdown] Failed to load action prompts:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspacePath, setState]);

  const actions = state.actions;
  const hasActions = actions.length > 0;
  const showSeedCta = state.loaded && !state.fileExists;

  // Reset highlight when opening or when the list changes.
  useEffect(() => {
    if (menu.isOpen) {
      setHighlightedIndex(0);
    }
  }, [menu.isOpen, actions.length]);

  const handleSelect = useCallback(
    (action: ActionPrompt) => {
      const isLauncher = action.config?.launch === 'new-session';
      if (isLauncher && onLaunchNewSession) {
        void onLaunchNewSession(action);
        menu.setIsOpen(false);
        try {
          posthog?.capture('action_prompt_launched_new_session', {
            actionCount: actions.length,
            bodyLength: action.body.length,
            model: action.config?.model ?? null,
            foreground: action.config?.foreground ?? true,
            autoSubmit: action.config?.autoSubmit ?? true,
            worktree: action.config?.worktree ?? false,
          });
        } catch {
          // analytics is best-effort
        }
        return;
      }

      onInsert(action.body);
      menu.setIsOpen(false);
      try {
        posthog?.capture('action_prompt_inserted', {
          actionCount: actions.length,
          bodyLength: action.body.length,
        });
      } catch {
        // analytics is best-effort
      }
    },
    [onInsert, onLaunchNewSession, menu, posthog, actions.length]
  );

  /**
   * Built-in: launch a review session on a different provider/model than the
   * one that wrote the changes. Model is resolved at click time so it always
   * reflects the currently-enabled providers.
   */
  const handleCrossModelReview = useCallback(async () => {
    menu.setIsOpen(false);
    if (!onLaunchNewSession) {
      // No launcher wired up -- fall back to inserting the prompt body.
      onInsert(CROSS_MODEL_REVIEW_BODY);
      return;
    }
    const model = await pickCrossModelReviewModel(currentProvider);
    const action: ActionPrompt = {
      id: 'builtin-cross-model-review',
      label: 'Cross-model review',
      body: CROSS_MODEL_REVIEW_BODY,
      config: { launch: 'new-session', model, foreground: true, autoSubmit: true, worktree: false },
    };
    void onLaunchNewSession(action);
    try {
      posthog?.capture('cross_model_review_launched', {
        writerProvider: currentProvider ?? null,
        reviewerModel: model ?? null,
      });
    } catch {
      // analytics is best-effort
    }
  }, [onLaunchNewSession, onInsert, menu, currentProvider, posthog]);

  const handleSeed = useCallback(async () => {    try {
      await window.electronAPI?.invoke?.('action-prompts:open-file', { workspacePath });
      // Refresh list — the file watcher will also broadcast, but we kick a
      // refresh now so the dropdown reflects the seeded content immediately.
      const result = await window.electronAPI?.invoke?.('action-prompts:list', { workspacePath });
      if (result) {
        setState({
          actions: result.actions ?? [],
          diagnostics: result.diagnostics ?? [],
          filePath: result.filePath ?? null,
          fileExists: result.fileExists ?? false,
          loaded: true,
        });
      }
    } catch (err) {
      console.error('[ActionPromptsDropdown] Failed to seed ai-actions.md:', err);
    } finally {
      menu.setIsOpen(false);
    }
  }, [workspacePath, setState, menu]);

  const handleEditFile = useCallback(async () => {
    try {
      await window.electronAPI?.invoke?.('action-prompts:open-file', { workspacePath });
    } catch (err) {
      console.error('[ActionPromptsDropdown] Failed to open ai-actions.md:', err);
    } finally {
      menu.setIsOpen(false);
    }
  }, [workspacePath, menu]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!hasActions) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % actions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + actions.length) % actions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const action = actions[highlightedIndex];
        if (action) handleSelect(action);
      }
    },
    [hasActions, actions, highlightedIndex, handleSelect]
  );

  // Scroll the highlighted item into view as the user navigates with arrows.
  useEffect(() => {
    if (!menu.isOpen) return;
    const el = itemRefs.current[highlightedIndex];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, menu.isOpen]);

  const buttonLabel = t('actions');

  return (
    <>
      <button
        ref={menu.refs.setReference as React.RefCallback<HTMLButtonElement>}
        {...menu.getReferenceProps()}
        type="button"
        data-testid="action-prompts-dropdown"
        className="action-prompts-dropdown-button flex items-center gap-1 px-2 py-[3px] rounded-xl text-[11px] font-medium cursor-pointer transition-all duration-200 outline-none whitespace-nowrap bg-[var(--nim-bg-secondary)] text-[var(--nim-text-muted)] border border-[var(--nim-border)] hover:bg-[var(--nim-bg-hover)] hover:border-[var(--nim-primary)]"
        onClick={() => menu.setIsOpen(!menu.isOpen)}
        aria-label={`${buttonLabel} (${actions.length})`}
      >
        <MaterialSymbol icon="bolt" size={12} />
        <span>{buttonLabel}</span>
        <MaterialSymbol
          icon="expand_more"
          size={14}
          className={`transition-transform duration-200 shrink-0 ${menu.isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {menu.isOpen && (
        <FloatingPortal>
          <div
            ref={menu.refs.setFloating as React.RefCallback<HTMLDivElement>}
            style={menu.floatingStyles}
            {...menu.getFloatingProps()}
            onKeyDown={handleKeyDown}
            tabIndex={-1}
            data-testid="action-prompts-dropdown-panel"
            className="action-prompts-dropdown-panel z-[1000] min-w-[260px] max-w-[360px] rounded-lg p-1 bg-[var(--nim-bg)] border border-[var(--nim-border)] shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
          >
            <div className="action-prompts-dropdown-header px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--nim-text-faint)] flex items-center justify-between">
              <span>{state.fileExists ? t('fromAiActions') : t('actionPrompts')}</span>
              {state.fileExists && (
                <span className="text-[10px] text-[var(--nim-text-disabled)]">
                  {actions.length}
                </span>
              )}
            </div>

            {/* Built-in actions */}
            <div className="action-prompts-dropdown-builtins py-1">
              <button
                type="button"
                onClick={() => void handleCrossModelReview()}
                data-testid="action-prompt-cross-model-review"
                className="action-prompts-dropdown-item flex items-start gap-2 w-full text-left px-2 py-1.5 rounded border-none cursor-pointer text-[var(--nim-text)] bg-transparent hover:bg-[var(--nim-bg-hover)]"
              >
                <span className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                  <span className="text-[12px] font-medium leading-tight">{t('crossModelReview')}</span>
                  <span className="text-[11px] text-[var(--nim-text-muted)] leading-tight truncate w-full">
                    {t('crossModelReviewDesc')}
                  </span>
                </span>
                <MaterialSymbol
                  icon="rate_review"
                  size={14}
                  className="shrink-0 mt-0.5 text-[var(--nim-text-faint)]"
                />
              </button>
            </div>
            <div className="h-px my-1 bg-[var(--nim-border)]" />

            {showSeedCta && (
              <div className="px-2 py-2 flex flex-col gap-2">
                <p className="text-xs text-[var(--nim-text-muted)] leading-snug">
                  {t('noAiActionsYet')}
                </p>
                <button
                  type="button"
                  className="text-[11px] font-medium text-left px-2 py-1.5 rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] hover:bg-[var(--nim-bg-hover)] hover:border-[var(--nim-primary)] text-[var(--nim-text)] cursor-pointer"
                  onClick={handleSeed}
                  data-testid="action-prompts-seed-button"
                >
                  {t('createAiActionsWithExamples')}
                </button>
              </div>
            )}

            {state.fileExists && !hasActions && (
              <div className="px-2 py-3 text-xs text-[var(--nim-text-muted)] leading-snug">
                {t('aiActionsNoSections')}
              </div>
            )}

            {hasActions && (
              <div className="action-prompts-dropdown-list max-h-[320px] overflow-y-auto py-1">
                {actions.map((action, idx) => {
                  const isLauncher = action.config?.launch === 'new-session';
                  const launcherSubtitle = isLauncher
                    ? `${t('opensNewSession')}${action.config?.model ? ` · ${action.config.model}` : ''}`
                    : null;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      onClick={() => handleSelect(action)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      data-testid={`action-prompt-item-${action.id}`}
                      data-action-launch={isLauncher ? 'new-session' : 'same-session'}
                      className={`action-prompts-dropdown-item flex items-start gap-2 w-full text-left px-2 py-1.5 rounded border-none cursor-pointer text-[var(--nim-text)] ${
                        idx === highlightedIndex ? 'bg-[var(--nim-bg-hover)]' : 'bg-transparent'
                      }`}
                    >
                      <span className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                        <span className="text-[12px] font-medium leading-tight">{action.label}</span>
                        <span className="text-[11px] text-[var(--nim-text-muted)] leading-tight truncate w-full">
                          {launcherSubtitle ?? firstLinePreview(action.body)}
                        </span>
                      </span>
                      {isLauncher && (
                        <MaterialSymbol
                          icon="open_in_new"
                          size={14}
                          className="shrink-0 mt-0.5 text-[var(--nim-text-faint)]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="action-prompts-dropdown-footer mt-1 border-t border-[var(--nim-border)] pt-1">
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-[11px] text-[var(--nim-text-muted)] hover:text-[var(--nim-text)] hover:bg-[var(--nim-bg-hover)] rounded cursor-pointer flex items-center gap-1.5 border-none bg-transparent"
                onClick={handleEditFile}
                data-testid="action-prompts-edit-link"
              >
                <MaterialSymbol icon="edit" size={12} />
                <span>{state.fileExists ? t('editActions') : t('openAiActions')}</span>
              </button>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
