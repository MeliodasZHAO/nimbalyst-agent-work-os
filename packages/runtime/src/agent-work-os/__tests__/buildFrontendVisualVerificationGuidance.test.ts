import { describe, expect, it } from 'vitest';
import type { TrackerRecord } from '../../core/TrackerRecord';
import {
  buildFrontendVisualCheckCommand,
  buildFrontendVisualVerificationGuidance,
  formatFrontendVisualVerificationGuidance,
} from '../buildFrontendVisualVerificationGuidance';

function makeRecord(fields: Record<string, unknown>): TrackerRecord {
  return {
    id: 'fm:work-packet:plans/runtime-fix.md',
    primaryType: 'work-packet',
    typeTags: ['work-packet'],
    issueKey: 'WPKT-42',
    source: 'frontmatter',
    sourceRef: 'plans/runtime-fix.md',
    archived: false,
    syncStatus: 'local',
    system: {
      workspace: '/workspace',
      documentPath: 'plans/runtime-fix.md',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    fields: {
      title: 'Repair settings layout',
      gate: 'verification',
      ...fields,
    },
  };
}

describe('buildFrontendVisualVerificationGuidance', () => {
  it('requires visual evidence when Work Packet fields mention UI behavior', () => {
    const guidance = buildFrontendVisualVerificationGuidance(makeRecord({
      successCriteria: 'The mobile settings panel does not overlap at narrow widths.',
      verification: 'Use Playwright screenshots at desktop and mobile viewports.',
    }));

    expect(guidance.required).toBe(true);
    expect(guidance.reasons).toContain('Work Packet fields mention frontend or visual behavior');
    expect(guidance.evidenceFields).toContain('runtimeEvidence');
    expect(guidance.instructions.join('\n')).toContain('desktop and mobile-sized viewports');
    expect(guidance.instructions.join('\n')).toContain('agent-work-os:visual-check');
    expect(guidance.command).toContain('--label WPKT-42');
  });

  it('formats no prompt section when no frontend signal exists', () => {
    expect(formatFrontendVisualVerificationGuidance(makeRecord({
      title: 'Update runtime parser',
      successCriteria: 'Parser handles extensionless uploads.',
      verification: 'Run unit tests.',
    }))).toBeNull();
  });

  it('builds a shell-safe visual check command label', () => {
    expect(buildFrontendVisualCheckCommand('WPKT-42')).toBe(
      'npm run agent-work-os:visual-check -- --label WPKT-42',
    );
    expect(buildFrontendVisualCheckCommand('work packet 42')).toBe(
      'npm run agent-work-os:visual-check -- --label "work packet 42"',
    );
  });
});
