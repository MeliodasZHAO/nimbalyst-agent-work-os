/**
 * sessionMetadataBroadcast — single source for persisting loose session
 * metadata updates AND notifying the renderer.
 *
 * Why this exists: `AISessionsRepository.updateMetadata` only writes the
 * `metadata` JSON blob when the payload carries a `metadata` sub-object
 * (it does a shallow merge of `payload.metadata`). Passing loose fields like
 * `{ phase: 'queued' }` directly is a silent no-op — the store finds nothing
 * to update and returns. The renderer kanban reads `metadata.phase`, so any
 * caller that wants a phase/tag change to actually land MUST wrap fields as
 * `{ metadata: { ... } }` and then broadcast `sessions:session-updated` so the
 * renderer registry patches in place.
 *
 * Both the `sessions:update-session-metadata` IPC handler and main-process
 * callers (the dispatch queue) route through here so the wrap-and-broadcast
 * contract lives in exactly one place.
 */

import { BrowserWindow } from 'electron';
import { AISessionsRepository } from '@nimbalyst/runtime/storage/repositories/AISessionsRepository';

/**
 * Persist loose session metadata fields and broadcast the change.
 *
 * `updates` mirrors the shape the IPC handler receives: `sessionType` (if
 * present) maps to its own column; everything else is shallow-merged into the
 * `metadata` JSON blob. After persisting, `sessions:session-updated` is sent to
 * every window so the renderer registry patches the entry without a full
 * refetch (the renderer's handler only patches entries that already exist).
 */
export async function applySessionMetadataUpdate(
  sessionId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const { sessionType, ...metadataFields } = updates as Record<string, unknown> & {
    sessionType?: unknown;
  };

  const payload: Record<string, unknown> = {};
  if (sessionType !== undefined) payload.sessionType = sessionType;
  if (Object.keys(metadataFields).length > 0) payload.metadata = metadataFields;

  if (Object.keys(payload).length === 0) return;

  await AISessionsRepository.updateMetadata(sessionId, payload as any);

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('sessions:session-updated', sessionId, metadataFields);
    }
  }
}

/**
 * Ask the renderer to refresh its session list for a workspace. Used when new
 * session rows are created directly in the main process (e.g. dispatch child
 * sessions) — there is no `sessions:session-created` listener, so the registry
 * only learns about new rows by re-querying the DB on this signal.
 */
export function requestSessionListRefresh(workspacePath: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('sessions:refresh-list', { workspacePath });
    }
  }
}
