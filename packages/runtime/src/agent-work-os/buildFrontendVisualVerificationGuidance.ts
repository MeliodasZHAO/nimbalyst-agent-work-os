import type { TrackerRecord } from '../core/TrackerRecord';
import type { WorkPacketExecutionRecommendation } from './recommendWorkPacketExecution';

export interface FrontendVisualVerificationGuidance {
  required: boolean;
  reasons: string[];
  evidenceFields: string[];
  instructions: string[];
  command: string;
}

function stringifyField(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(stringifyField).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function textIncludesFrontendSignals(record: TrackerRecord): boolean {
  const text = [
    record.fields.title,
    record.fields.intent,
    record.fields.scope,
    record.fields.successCriteria,
    record.fields.verification,
    record.fields.risks,
    record.fields.requiredSkills,
    record.system.documentPath,
    record.sourceRef,
  ].map(stringifyField).join('\n');

  return /\b(frontend|front-end|ui|ux|layout|css|style|visual|screenshot|browser|playwright|responsive|mobile|desktop|dom)\b/i.test(text);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9._:/\\-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function buildFrontendVisualCheckCommand(label: string): string {
  const safeLabel = label.trim() || 'work-packet';
  return `npm run agent-work-os:visual-check -- --label ${shellQuote(safeLabel)}`;
}

export function buildFrontendVisualVerificationGuidance(
  record: TrackerRecord,
  recommendation?: WorkPacketExecutionRecommendation,
): FrontendVisualVerificationGuidance {
  const reasons: string[] = [];
  if (recommendation?.collaborationMode === 'frontend-repair') {
    reasons.push('collaboration mode is frontend-repair');
  }
  if (recommendation?.notes.some(note => /frontend|visual/i.test(note))) {
    reasons.push('Agent Work OS requires frontend visual evidence');
  }
  if (textIncludesFrontendSignals(record)) {
    reasons.push('Work Packet fields mention frontend or visual behavior');
  }

  const required = reasons.length > 0;
  const command = buildFrontendVisualCheckCommand(record.issueKey || record.id);
  return {
    required,
    reasons,
    evidenceFields: [
      'verificationEvidence',
      'runtimeEvidence',
      'reviewEvidence',
      'testsRun',
    ],
    command,
    instructions: required
      ? [
        'Before Verification Gate, inspect the rendered UI with an available browser, screenshot, DOM, or Playwright-capable tool.',
        `When the Nimbalyst desktop app is already running in dev mode, prefer \`${command}\` to capture desktop and mobile screenshots from the live app.`,
        'Check both desktop and mobile-sized viewports when the change affects layout or interaction.',
        'Record what was inspected, what changed, and any remaining visual risk in verificationEvidence or runtimeEvidence.',
        'If no visual tool is available, state that limitation in verificationEvidence instead of claiming visual verification.',
      ]
      : [],
  };
}

export function formatFrontendVisualVerificationGuidance(
  record: TrackerRecord,
  recommendation?: WorkPacketExecutionRecommendation,
): string | null {
  const guidance = buildFrontendVisualVerificationGuidance(record, recommendation);
  if (!guidance.required) return null;

  const lines = [
    '## Frontend Visual Verification',
    `- required: yes (${guidance.reasons.join('; ')})`,
    `- evidenceFields: ${guidance.evidenceFields.join(', ')}`,
  ];
  for (const instruction of guidance.instructions) {
    lines.push(`- ${instruction}`);
  }
  return lines.join('\n');
}
