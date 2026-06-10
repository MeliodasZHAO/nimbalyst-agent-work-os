import { describe, expect, it } from 'vitest';
import type { TrackerRecord } from '@nimbalyst/runtime/core/TrackerRecord';
import {
  buildWorkPacketEvidenceWritebackUpdate,
  getWorkPacketEvidenceWritebackField,
  WORK_PACKET_GUARDED_WRITEBACK_FIELDS,
} from '../workPacketEvidenceWriteback';

function makeRecord(primaryType = 'work-packet'): TrackerRecord {
  return {
    id: `native:${primaryType}:1`,
    primaryType,
    typeTags: [primaryType],
    source: 'native',
    archived: false,
    syncStatus: 'local',
    system: {
      workspace: '/workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    fields: {
      title: 'Evidence writeback',
    },
  };
}

describe('workPacketEvidenceWriteback', () => {
  it('builds a trimmed update for allowed evidence fields', () => {
    const result = buildWorkPacketEvidenceWritebackUpdate(
      makeRecord(),
      'verificationEvidence',
      '  typecheck and focused tests passed  ',
    );

    expect(result.allowed).toBe(true);
    expect(result.updates).toEqual({
      verificationEvidence: 'typecheck and focused tests passed',
    });
    expect(result.error).toBeUndefined();
  });

  it('blocks guarded workflow and system-managed fields', () => {
    for (const fieldName of WORK_PACKET_GUARDED_WRITEBACK_FIELDS) {
      const result = buildWorkPacketEvidenceWritebackUpdate(makeRecord(), fieldName, 'ship it');

      expect(result.allowed).toBe(false);
      expect(result.updates).toEqual({});
      expect(result.error).toContain('guarded');
    }
  });

  it('blocks unknown fields and non Work Packet records', () => {
    expect(buildWorkPacketEvidenceWritebackUpdate(makeRecord(), 'randomField', 'value').allowed).toBe(false);
    expect(buildWorkPacketEvidenceWritebackUpdate(makeRecord('task'), 'testsRun', 'npm test').allowed).toBe(false);
  });

  it('exposes field metadata for selector labels', () => {
    expect(getWorkPacketEvidenceWritebackField('runtimeEvidence')?.label).toBe('Runtime evidence');
    expect(getWorkPacketEvidenceWritebackField('gate')).toBeNull();
  });
});
