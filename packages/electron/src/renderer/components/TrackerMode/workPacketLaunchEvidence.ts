import type { TrackerRecord } from '@nimbalyst/runtime/core/TrackerRecord';
import type { SessionMeta } from '../../store/atoms/sessions';

export interface WorkPacketLaunchEvidenceSession {
  id: string;
  session: SessionMeta | null;
}

export interface WorkPacketLaunchEvidence {
  implementationSession: WorkPacketLaunchEvidenceSession | null;
  reviewerSession: WorkPacketLaunchEvidenceSession | null;
  reviewerStatus: WorkPacketReviewerStatus;
  worktreeId: string | null;
  worktreePath: string | null;
  sessionIds: string[];
  hasEvidence: boolean;
}

export type WorkPacketReviewerStatus =
  | 'not-required'
  | 'required'
  | 'session-recorded'
  | 'active'
  | 'recorded';

function getStringField(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveSession(
  sessionId: string | null,
  sessionRegistry: ReadonlyMap<string, SessionMeta>,
): WorkPacketLaunchEvidenceSession | null {
  if (!sessionId) return null;
  return {
    id: sessionId,
    session: sessionRegistry.get(sessionId) ?? null,
  };
}

export function getWorkPacketLaunchEvidence(
  item: TrackerRecord | null | undefined,
  sessionRegistry: ReadonlyMap<string, SessionMeta>,
): WorkPacketLaunchEvidence {
  if (!item || item.primaryType !== 'work-packet') {
    return {
      implementationSession: null,
      reviewerSession: null,
      reviewerStatus: 'not-required',
      worktreeId: null,
      worktreePath: null,
      sessionIds: [],
      hasEvidence: false,
    };
  }

  const implementationSession = resolveSession(getStringField(item.fields, 'linkedSession'), sessionRegistry);
  const reviewerSession = resolveSession(getStringField(item.fields, 'reviewerSession'), sessionRegistry);
  const secondAgentReview = getStringField(item.fields, 'secondAgentReview');
  const worktreeId = getStringField(item.fields, 'worktreeId');
  const worktreePath = getStringField(item.fields, 'worktreePath');
  const sessionIds = Array.from(new Set([
    implementationSession?.id,
    reviewerSession?.id,
  ].filter((sessionId): sessionId is string => Boolean(sessionId))));

  const reviewerStatus = getReviewerStatus(item, reviewerSession, secondAgentReview);
  return {
    implementationSession,
    reviewerSession,
    reviewerStatus,
    worktreeId,
    worktreePath,
    sessionIds,
    hasEvidence: sessionIds.length > 0 || Boolean(worktreeId || worktreePath) || reviewerStatus === 'required',
  };
}

function getReviewerStatus(
  item: TrackerRecord,
  reviewerSession: WorkPacketLaunchEvidenceSession | null,
  secondAgentReview: string | null,
): WorkPacketReviewerStatus {
  if (secondAgentReview) return 'recorded';

  const reviewRequired =
    item.fields.capabilityRoute === 'second-agent-review' ||
    item.fields.recommendedAgent === 'mixed' ||
    item.fields.complexity === 'risky' ||
    /\b(database|db|schema|migration|security|auth|destructive|runtime|production)\b/i.test(getStringField(item.fields, 'risks') ?? '');

  if (!reviewRequired && !reviewerSession) return 'not-required';
  if (!reviewerSession) return 'required';
  if ((reviewerSession.session?.messageCount ?? 0) > 0) return 'active';
  return 'session-recorded';
}
