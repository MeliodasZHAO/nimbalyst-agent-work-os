import { describe, expect, it } from 'vitest';
import type { TrackerRecord } from '@nimbalyst/runtime/core/TrackerRecord';
import { getLinkedTrackerRecordsForReferences } from '../voiceWorkPacketLinks';

function makeRecord(overrides: Partial<TrackerRecord>): TrackerRecord {
  return {
    id: 'wpkt-1',
    primaryType: 'work-packet',
    typeTags: ['work-packet'],
    source: 'native',
    archived: false,
    syncStatus: 'local',
    fields: { title: 'Work Packet' },
    ...overrides,
    system: {
      workspace: '/workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      ...overrides.system,
    },
  };
}

describe('getLinkedTrackerRecordsForReferences', () => {
  it('matches linked tracker records by tracker id', () => {
    const record = makeRecord({ id: 'wpkt-1' });
    const result = getLinkedTrackerRecordsForReferences(
      new Map([[record.id, record]]),
      ['wpkt-1'],
    );

    expect(result).toEqual([record]);
  });

  it('matches file-backed tracker records by document path or source ref', () => {
    const documentPathRecord = makeRecord({
      id: 'frontmatter:work-packet:docs/one.md',
      source: 'frontmatter',
      system: {
        workspace: '/workspace',
        documentPath: 'docs/one.md',
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    });
    const sourceRefRecord = makeRecord({
      id: 'frontmatter:work-packet:docs/two.md',
      source: 'frontmatter',
      sourceRef: 'docs/two.md',
    });

    const result = getLinkedTrackerRecordsForReferences(
      new Map([
        [documentPathRecord.id, documentPathRecord],
        [sourceRefRecord.id, sourceRefRecord],
      ]),
      ['file:docs/one.md', 'file:docs/two.md'],
    );

    expect(result).toEqual([documentPathRecord, sourceRefRecord]);
  });
});
