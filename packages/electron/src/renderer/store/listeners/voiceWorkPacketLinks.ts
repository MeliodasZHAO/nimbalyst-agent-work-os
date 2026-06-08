import type { TrackerRecord } from '@nimbalyst/runtime/core/TrackerRecord';

export function getLinkedTrackerRecordsForReferences(
  trackerItems: Map<string, TrackerRecord>,
  linkedTrackerItemIds: string[],
): TrackerRecord[] {
  if (linkedTrackerItemIds.length === 0) return [];

  return Array.from(trackerItems.values()).filter((record) => {
    const refs = [
      record.id,
      record.system.documentPath ? `file:${record.system.documentPath}` : null,
      record.sourceRef ? `file:${record.sourceRef}` : null,
    ].filter((value): value is string => Boolean(value));
    return refs.some(ref => linkedTrackerItemIds.includes(ref));
  });
}
