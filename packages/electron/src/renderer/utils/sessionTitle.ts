/**
 * Session title display helpers.
 *
 * New sessions are stored with the provider-agnostic default title
 * 'New conversation' (SessionManager.ts) until auto-naming renames them.
 * Map that default (and legacy casings) to the localized label at display
 * time -- the stored title is data and must not be rewritten per-locale.
 */
import i18n from '../i18n';

const DEFAULT_SESSION_TITLE_RE = /^new conversation$/i;

export function isDefaultSessionTitle(title?: string | null): boolean {
  return !title || DEFAULT_SESSION_TITLE_RE.test(title.trim());
}

/** Returns the localized label for default-titled sessions, the title otherwise. */
export function displaySessionTitle(title?: string | null): string {
  if (title && !DEFAULT_SESSION_TITLE_RE.test(title.trim())) return title;
  return i18n.t('newConversation', { ns: 'agent' });
}
