import { describe, expect, it } from 'vitest';
import { globalRegistry, type TrackerDataModel } from '../../plugins/TrackerPlugin/models';
import type { TrackerRecord } from '../../core/TrackerRecord';
import { buildWorkPacketPrompt } from '../buildWorkPacketPrompt';

const workPacketModel: TrackerDataModel = {
  type: 'work-packet',
  displayName: 'Work Packet',
  displayNamePlural: 'Work Packets',
  icon: 'assignment',
  color: '#2563eb',
  modes: { inline: true, fullDocument: true },
  idPrefix: 'wpkt',
  idFormat: 'ulid',
  fields: [
    { name: 'title', type: 'string', required: true },
    { name: 'gate', type: 'select' },
    { name: 'priority', type: 'select' },
    { name: 'progress', type: 'number' },
  ],
  roles: {
    title: 'title',
    workflowStatus: 'gate',
    priority: 'priority',
    progress: 'progress',
    tags: 'tags',
  },
};

function makeRecord(): TrackerRecord {
  return {
    id: 'fm:work-packet:plans/runtime-fix.md',
    primaryType: 'work-packet',
    typeTags: ['work-packet'],
    issueKey: 'WPKT-12',
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
      title: 'Runtime import fix',
      gate: 'plan',
      complexity: 'risky',
      priority: 'high',
      recommendedAgent: 'codex',
      capabilityRoute: 'plan-first',
      successCriteria: 'Extensionless upload filenames work.',
      verification: 'Run upload/import tests.',
      risks: 'Database schema and production runtime behavior.',
      requiredSkills: ['source-command-write-tests'],
      projectMemoryUpdates: 'Document runtime upload filename behavior.',
    },
  };
}

describe('buildWorkPacketPrompt', () => {
  it('builds a plan-first Work Packet draft with routing and approval guidance', () => {
    const originalModel = globalRegistry.get('work-packet');
    globalRegistry.register(workPacketModel);
    try {
      const prompt = buildWorkPacketPrompt(makeRecord());

      expect(prompt).toContain('Do not edit files yet.');
      expect(prompt).toContain('# Work Packet: Runtime import fix');
      expect(prompt).toContain('- gate: plan');
      expect(prompt).toContain('- complexity: risky');
      expect(prompt).toContain('## Success Criteria');
      expect(prompt).toContain('Extensionless upload filenames work.');
      expect(prompt).toContain('- provider: codex');
      expect(prompt).toContain('- sessionMode: plan-first');
      expect(prompt).toContain('- worktreeRecommended: yes');
      expect(prompt).toContain('- secondAgentReviewRequired: yes');
      expect(prompt).toContain('- humanApprovalRequired: yes');
      expect(prompt).toContain('Database impact requires explicit human approval.');
      expect(prompt).toContain('Do not make database changes without explicit human approval.');
      expect(prompt).toContain('## Work Packet Update Rules');
      expect(prompt).toContain('allowedEvidenceFields:');
      expect(prompt).toContain('systemManagedFields: linkedSession, reviewerSession, worktreeId, worktreePath, shipped');
      expect(prompt).toContain('Do not set gate to shipped');
    } finally {
      // Keep this test from depending on any prior registry content.
      globalRegistry.unregister('work-packet');
      if (originalModel) globalRegistry.register(originalModel);
    }
  });
});
