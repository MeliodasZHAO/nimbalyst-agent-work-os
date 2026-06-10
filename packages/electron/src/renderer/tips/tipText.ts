/**
 * Tip text resolution
 *
 * Single source of truth for turning a tip's content into display strings.
 * When a `*Key` field is present the value is pulled from the `agent` i18n
 * namespace; otherwise the literal field is used as-is. This lets individual
 * tips opt into i18n without forcing every legacy tip to define keys.
 */

import type { TFunction } from 'i18next';
import type { TipAction, TipContent } from './types';

export function resolveTipTitle(content: TipContent, t: TFunction): string {
  return content.titleKey ? t(content.titleKey) : content.title;
}

export function resolveTipBody(content: TipContent, t: TFunction): string {
  return content.bodyKey ? t(content.bodyKey) : content.body;
}

export function resolveTipActionLabel(action: TipAction, t: TFunction): string {
  return action.labelKey ? t(action.labelKey) : action.label;
}
