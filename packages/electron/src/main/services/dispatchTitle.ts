/**
 * deriveDispatchTitle — produce a readable, scannable session title for a
 * dispatched task.
 *
 * Parallel dispatch sessions land side-by-side on the kanban; weak titles
 * ("Task", "Untitled") make the board unreadable. The dispatch tool prompt
 * asks the agent to supply a good title, but we cannot trust that, so this
 * is the main-process fallback: keep a strong agent title, otherwise derive
 * one from the task description.
 *
 * Note: renderer/utils/sessionTitle.ts is renderer-only (depends on i18n), so
 * it cannot be reused here — this is the main-process counterpart.
 */

const WEAK_TITLE_RE = /^(untitled|untitled task|task|new task|todo|tbd|wip|fix|change|update)\s*\d*$/i;
const MIN_STRONG_LENGTH = 6;
const MAX_DERIVED_LENGTH = 60;

/** True when the agent-supplied title is too weak to show on the board. */
function isWeakTitle(title: string): boolean {
  const trimmed = title.trim();
  if (trimmed.length < MIN_STRONG_LENGTH) return true;
  if (WEAK_TITLE_RE.test(trimmed)) return true;
  return false;
}

/** Strip markdown noise and collapse whitespace from a description fragment. */
function cleanFragment(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/[#*_>`~\-]+/g, ' ') // markdown markers
    .replace(/\s+/g, ' ')
    .trim();
}

/** Take the first sentence / first line, truncated to a board-friendly length. */
function deriveFromDescription(description: string): string {
  const cleaned = cleanFragment(description);
  if (!cleaned) return '';

  // Prefer the first sentence boundary; fall back to first line.
  const firstSentence = cleaned.split(/(?<=[.!?。！？])\s/)[0] ?? cleaned;
  const candidate = firstSentence.length > 0 ? firstSentence : cleaned;

  if (candidate.length <= MAX_DERIVED_LENGTH) return candidate;
  // Truncate on a word boundary where possible.
  const truncated = candidate.slice(0, MAX_DERIVED_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > MAX_DERIVED_LENGTH * 0.6 ? truncated.slice(0, lastSpace) : truncated).trim() + '…';
}

export function deriveDispatchTitle(opts: {
  agentTitle?: string | null;
  taskDescription?: string | null;
}): string {
  const agentTitle = opts.agentTitle?.trim() ?? '';
  if (agentTitle && !isWeakTitle(agentTitle)) {
    return agentTitle;
  }

  const derived = deriveFromDescription(opts.taskDescription ?? '');
  if (derived) return derived;

  // Last resort: keep whatever the agent gave (even if weak) over nothing.
  return agentTitle || 'Task';
}
