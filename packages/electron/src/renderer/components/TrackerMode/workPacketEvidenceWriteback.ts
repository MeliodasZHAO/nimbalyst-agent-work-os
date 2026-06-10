import type { TrackerRecord } from '@nimbalyst/runtime/core/TrackerRecord';

export interface WorkPacketEvidenceWritebackFieldDefinition {
  name: string;
  label: string;
  description: string;
}

export interface WorkPacketEvidenceWritebackResult {
  allowed: boolean;
  updates: Record<string, string>;
  error?: string;
}

export const WORK_PACKET_EVIDENCE_WRITEBACK_FIELDS: WorkPacketEvidenceWritebackFieldDefinition[] = [
  {
    name: 'planEvidence',
    label: 'Plan evidence',
    description: 'Approved plan notes or planning evidence.',
  },
  {
    name: 'diffSummary',
    label: 'Diff summary',
    description: 'Changed files and behavior summary.',
  },
  {
    name: 'reviewEvidence',
    label: 'Review evidence',
    description: 'Self-review notes or reviewer findings.',
  },
  {
    name: 'successChecklist',
    label: 'Success checklist',
    description: 'Observed success criteria checklist.',
  },
  {
    name: 'secondAgentReview',
    label: 'Second agent review',
    description: 'Independent reviewer notes for risky work.',
  },
  {
    name: 'testsRun',
    label: 'Tests run',
    description: 'Commands, builds, checks, and results.',
  },
  {
    name: 'verificationEvidence',
    label: 'Verification evidence',
    description: 'Manual or runtime verification notes.',
  },
  {
    name: 'runtimeEvidence',
    label: 'Runtime evidence',
    description: 'Screenshots, logs, traces, or runtime observations.',
  },
  {
    name: 'docsEvidence',
    label: 'Docs evidence',
    description: 'Docs or project memory update result.',
  },
  {
    name: 'unresolvedRisks',
    label: 'Unresolved risks',
    description: 'Known remaining risks or none.',
  },
  {
    name: 'projectMemoryUpdates',
    label: 'Project memory updates',
    description: 'Project-level memory facts that changed.',
  },
];

const ALLOWED_FIELD_NAMES = new Set(WORK_PACKET_EVIDENCE_WRITEBACK_FIELDS.map(field => field.name));

export const WORK_PACKET_GUARDED_WRITEBACK_FIELDS = new Set([
  'gate',
  'humanApproval',
  'status',
  'progress',
  'priority',
  'complexity',
  'recommendedAgent',
  'capabilityRoute',
  'linkedSession',
  'reviewerSession',
  'worktreeId',
  'worktreePath',
  'shipped',
]);

export function getWorkPacketEvidenceWritebackField(
  fieldName: string,
): WorkPacketEvidenceWritebackFieldDefinition | null {
  return WORK_PACKET_EVIDENCE_WRITEBACK_FIELDS.find(field => field.name === fieldName) ?? null;
}

export function buildWorkPacketEvidenceWritebackUpdate(
  record: TrackerRecord | null | undefined,
  fieldName: string,
  value: string,
): WorkPacketEvidenceWritebackResult {
  if (!record || record.primaryType !== 'work-packet') {
    return {
      allowed: false,
      updates: {},
      error: 'Evidence writeback is only available for Work Packets.',
    };
  }

  if (WORK_PACKET_GUARDED_WRITEBACK_FIELDS.has(fieldName)) {
    return {
      allowed: false,
      updates: {},
      error: `${fieldName} is guarded and requires explicit user workflow control.`,
    };
  }

  if (!ALLOWED_FIELD_NAMES.has(fieldName)) {
    return {
      allowed: false,
      updates: {},
      error: `${fieldName} is not an allowed Work Packet evidence field.`,
    };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {
      allowed: false,
      updates: {},
      error: 'Evidence text cannot be empty.',
    };
  }

  return {
    allowed: true,
    updates: {
      [fieldName]: trimmed,
    },
  };
}
