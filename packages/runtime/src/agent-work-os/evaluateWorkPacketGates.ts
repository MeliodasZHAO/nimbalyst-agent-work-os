import type { TrackerRecord } from '../core/TrackerRecord';
import { getRecordStatus } from '../plugins/TrackerPlugin/trackerRecordAccessors';
import { routeWorkPacket } from './routeWorkPacket';

export type WorkPacketGate =
  | 'capability'
  | 'spec'
  | 'plan'
  | 'running'
  | 'review'
  | 'verification'
  | 'docs'
  | 'shipped';

export type WorkPacketGateCheckStatus = 'complete' | 'missing' | 'warning';

export interface WorkPacketGateCheck {
  id: string;
  label: string;
  status: WorkPacketGateCheckStatus;
  required: boolean;
  detail?: string;
}

export interface WorkPacketGateEvaluation {
  gate: WorkPacketGate;
  checks: WorkPacketGateCheck[];
  readyForCurrentGate: boolean;
  blockedReasons: string[];
  warnings: string[];
}

export interface WorkPacketGateTransitionEvaluation {
  allowed: boolean;
  fromGate: WorkPacketGate;
  toGate: WorkPacketGate;
  blockedReasons: string[];
  warnings: string[];
}

const VALID_GATES = new Set<WorkPacketGate>([
  'capability',
  'spec',
  'plan',
  'running',
  'review',
  'verification',
  'docs',
  'shipped',
]);

const GATE_ORDER: WorkPacketGate[] = [
  'capability',
  'spec',
  'plan',
  'running',
  'review',
  'verification',
  'docs',
  'shipped',
];

function stringifyField(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(stringifyField).filter(Boolean).join('\n');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function hasText(value: unknown): boolean {
  return stringifyField(value).trim().length > 0;
}

function normalizeGate(value: unknown): WorkPacketGate {
  const gate = stringifyField(value).trim();
  return VALID_GATES.has(gate as WorkPacketGate) ? gate as WorkPacketGate : 'spec';
}

function check(id: string, label: string, complete: boolean, required = true, detail?: string): WorkPacketGateCheck {
  return {
    id,
    label,
    status: complete ? 'complete' : 'missing',
    required,
    detail,
  };
}

function warning(id: string, label: string, detail?: string): WorkPacketGateCheck {
  return {
    id,
    label,
    status: 'warning',
    required: false,
    detail,
  };
}

export function evaluateWorkPacketGates(record: TrackerRecord): WorkPacketGateEvaluation {
  const fields = record.fields;
  const gate = normalizeGate(getRecordStatus(record) || fields.gate);
  const route = routeWorkPacket({
    complexity: stringifyField(fields.complexity),
    risks: stringifyField(fields.risks),
    recommendedAgent: stringifyField(fields.recommendedAgent),
    capabilityRoute: stringifyField(fields.capabilityRoute),
    requiredSkills: Array.isArray(fields.requiredSkills)
      ? fields.requiredSkills.map(item => stringifyField(item)).filter(Boolean)
      : undefined,
  });

  const checks: WorkPacketGateCheck[] = [];

  if (gate === 'capability') {
    checks.push(check('success-criteria', 'Success criteria', hasText(fields.successCriteria)));
    checks.push(check('verification-plan', 'Verification plan', hasText(fields.verification)));
    checks.push(check('risk-notes', 'Risk notes', hasText(fields.risks), false));
    if (route.humanApprovalRequired) {
      checks.push(check('human-approval', 'Human approval', hasText(fields.humanApproval), true, route.approvalReasons.join(' ')));
    }
  }

  if (gate === 'spec') {
    checks.push(check('success-criteria', 'Success criteria', hasText(fields.successCriteria)));
    checks.push(check('verification-plan', 'Verification plan', hasText(fields.verification)));
    checks.push(check('risk-notes', 'Risk notes', hasText(fields.risks), false));
  }

  if (gate === 'plan') {
    checks.push(check('success-criteria', 'Success criteria', hasText(fields.successCriteria)));
    checks.push(check('verification-plan', 'Verification plan', hasText(fields.verification)));
    checks.push(check('plan-evidence', 'Plan evidence', hasText(fields.planEvidence)));
    if (route.humanApprovalRequired) {
      checks.push(check('human-approval', 'Human approval', hasText(fields.humanApproval), true, route.approvalReasons.join(' ')));
    }
  }

  if (gate === 'running') {
    checks.push(check('linked-session', 'Linked agent session', Boolean(record.system.linkedSessions?.length || hasText(fields.linkedSession))));
    if (route.worktreeRecommended) {
      checks.push(check('worktree', 'Worktree isolation', hasText(fields.worktreePath) || hasText(fields.worktreeId), false));
    }
  }

  if (gate === 'review') {
    checks.push(check('diff-summary', 'Diff summary', hasText(fields.diffSummary)));
    checks.push(check('review-evidence', 'Review evidence', hasText(fields.reviewEvidence)));
    checks.push(check('success-checklist', 'Success criteria checklist', hasText(fields.successChecklist), false));
    if (route.secondAgentReviewRequired) {
      checks.push(check('second-agent-review', 'Second-agent review', hasText(fields.secondAgentReview)));
    }
    checks.push(check('unresolved-risks', 'Unresolved risks noted', hasText(fields.unresolvedRisks), false));
  }

  if (gate === 'verification') {
    checks.push(check('tests-run', 'Tests run', hasText(fields.testsRun)));
    checks.push(check('verification-evidence', 'Verification evidence', hasText(fields.verificationEvidence)));
    checks.push(check('runtime-evidence', 'Runtime logs or screenshots', hasText(fields.runtimeEvidence), false));
  }

  if (gate === 'docs') {
    checks.push(check('docs-evidence', 'Docs/project memory decision', hasText(fields.docsEvidence)));
    if (route.docsGateRequired) {
      checks.push(check('project-memory', 'Project memory updates', hasText(fields.projectMemoryUpdates)));
    }
  }

  if (gate === 'shipped') {
    checks.push(check('diff-summary', 'Diff summary', hasText(fields.diffSummary)));
    checks.push(check('review-evidence', 'Review evidence', hasText(fields.reviewEvidence)));
    checks.push(check('tests-run', 'Tests run', hasText(fields.testsRun)));
    checks.push(check('verification-evidence', 'Verification evidence', hasText(fields.verificationEvidence)));
    checks.push(check('docs-evidence', 'Docs/project memory decision', hasText(fields.docsEvidence)));
    checks.push(warning('user-promotion', 'Final shipped promotion remains a user action'));
    if (route.secondAgentReviewRequired) {
      checks.push(check('second-agent-review', 'Second-agent review', hasText(fields.secondAgentReview)));
    }
  }

  const blockedReasons = checks
    .filter(item => item.required && item.status === 'missing')
    .map(item => item.label);
  const warnings = [
    ...route.warnings,
    ...checks.filter(item => item.status === 'warning').map(item => item.label),
  ];

  return {
    gate,
    checks,
    readyForCurrentGate: blockedReasons.length === 0,
    blockedReasons,
    warnings,
  };
}

export function evaluateWorkPacketGateTransition(
  record: TrackerRecord,
  nextGateValue: unknown,
): WorkPacketGateTransitionEvaluation {
  const fromGate = normalizeGate(getRecordStatus(record) || record.fields.gate);
  const toGate = normalizeGate(nextGateValue);
  const fromIndex = GATE_ORDER.indexOf(fromGate);
  const toIndex = GATE_ORDER.indexOf(toGate);

  if (toIndex <= fromIndex) {
    return {
      allowed: true,
      fromGate,
      toGate,
      blockedReasons: [],
      warnings: [],
    };
  }

  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  for (const gate of GATE_ORDER.slice(fromIndex, toIndex)) {
    const evaluation = evaluateWorkPacketGates({
      ...record,
      fields: {
        ...record.fields,
        gate,
      },
    });
    if (!evaluation.readyForCurrentGate) {
      blockedReasons.push(...evaluation.blockedReasons.map(reason => `${gate}: ${reason}`));
    }
    warnings.push(...evaluation.warnings);
  }

  return {
    allowed: blockedReasons.length === 0,
    fromGate,
    toGate,
    blockedReasons,
    warnings,
  };
}
