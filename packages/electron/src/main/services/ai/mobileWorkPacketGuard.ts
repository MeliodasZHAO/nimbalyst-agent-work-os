import {
  buildWorkPacketControlSurfaceContext,
  mergeAgentWorkOSConfigs,
  resolveMobilePermissionPolicyForMode,
  type WorkPacketControlSurfaceAction,
} from '@nimbalyst/runtime/agent-work-os';
import { dbRowToRecord } from '@nimbalyst/runtime/core/TrackerRecord';
import { AISessionsRepository } from '@nimbalyst/runtime/storage/repositories/AISessionsRepository';
import { database } from '../../database/PGLiteDatabaseWorker';
import { getAppSetting, getWorkspaceState } from '../../utils/store';
import { logger } from '../../utils/logger';

export interface MobileWorkPacketGuardResult {
  blocked: boolean;
  warningText?: string;
}

export interface MobileWorkPacketGuardOptions {
  action?: WorkPacketControlSurfaceAction;
}

function loadAgentWorkOSConfig(workspacePath: string) {
  return mergeAgentWorkOSConfigs(
    getAppSetting('agentWorkOSConfig'),
    getWorkspaceState(workspacePath).agentWorkOSConfig,
  );
}

async function loadLinkedTrackerRows(workspacePath: string, trackerReference: string): Promise<any[]> {
  if (trackerReference.startsWith('file:')) {
    const filePath = trackerReference.slice('file:'.length);
    if (!filePath) return [];

    const result = await database.query(
      `SELECT *
       FROM tracker_items
       WHERE workspace = $1
         AND deleted_at IS NULL
         AND (
           source_ref = $2
           OR document_path = $2
         )
       ORDER BY updated DESC`,
      [workspacePath, filePath],
    );
    return result.rows;
  }

  const result = await database.query(
    `SELECT *
     FROM tracker_items
     WHERE workspace = $1
       AND id = $2
       AND deleted_at IS NULL`,
    [workspacePath, trackerReference],
  );
  return result.rows;
}

export async function evaluateMobileWorkPacketGuard(
  sessionId: string,
  options: MobileWorkPacketGuardOptions = {},
): Promise<MobileWorkPacketGuardResult> {
  try {
    const session = await AISessionsRepository.get(sessionId);
    const metadata = (session?.metadata ?? {}) as Record<string, unknown>;
    const linkedTrackerItemIds = Array.isArray(metadata.linkedTrackerItemIds)
      ? metadata.linkedTrackerItemIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (!session?.workspacePath || linkedTrackerItemIds.length === 0) {
      return { blocked: false };
    }

    const rows: any[] = [];
    for (const trackerItemId of linkedTrackerItemIds) {
      rows.push(...await loadLinkedTrackerRows(session.workspacePath, trackerItemId));
    }

    const linkedRecords = rows.map(row => dbRowToRecord(row));
    const config = loadAgentWorkOSConfig(session.workspacePath);
    const context = buildWorkPacketControlSurfaceContext(linkedRecords, {
      action: options.action,
      mobilePolicy: resolveMobilePermissionPolicyForMode(
        config.mobilePermissions.mode,
        config.mobilePermissions,
      ),
    });
    return {
      blocked: context.desktopReviewRequired,
      warningText: context.warningText,
    };
  } catch (error) {
    logger.ai.warn('[Mobile] Failed to evaluate Work Packet guard:', error);
    return { blocked: false };
  }
}
