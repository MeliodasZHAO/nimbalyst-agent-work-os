import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nimbalyst/runtime/storage/repositories/AISessionsRepository', () => ({
  AISessionsRepository: {
    get: vi.fn(),
  },
}));

vi.mock('@nimbalyst/runtime/agent-work-os', () => {
  const normalizeMockAgentWorkOSConfig = (value: any) => ({
    version: 1,
    automation: {
      controlMode: 'assisted',
      defaultAgent: 'auto',
      defaultCapabilityRoute: 'auto',
      defaultCollaborationMode: 'solo',
      defaultReasoning: 'auto',
      preferWorktreesForMediumRisk: true,
      requireFrontendVisualEvidence: true,
      allowAgentToUpdateWorkPackets: true,
    },
    mobilePermissions: {
      mode: value?.mobilePermissions?.mode ?? 'balanced',
      allowPlanApproval: value?.mobilePermissions?.allowPlanApproval ?? true,
      allowToolPermissionApproval: value?.mobilePermissions?.allowToolPermissionApproval ?? true,
      allowCommitApproval: value?.mobilePermissions?.allowCommitApproval ?? false,
      allowDatabaseRiskApproval: value?.mobilePermissions?.allowDatabaseRiskApproval ?? false,
      allowSecurityRiskApproval: value?.mobilePermissions?.allowSecurityRiskApproval ?? false,
      allowDestructiveRiskApproval: value?.mobilePermissions?.allowDestructiveRiskApproval ?? false,
      requireDesktopForShipped: value?.mobilePermissions?.requireDesktopForShipped ?? true,
    },
    providerPreferences: {},
  });

  return {
    buildWorkPacketControlSurfaceContext: vi.fn(),
    mergeAgentWorkOSConfigs: vi.fn((base: any, override: any) => {
      const normalizedBase = normalizeMockAgentWorkOSConfig(base);
      const normalizedOverride: any = override ? normalizeMockAgentWorkOSConfig(override) : {};
      return {
        ...normalizedBase,
        ...normalizedOverride,
        automation: {
          ...normalizedBase.automation,
          ...normalizedOverride.automation,
        },
        mobilePermissions: {
          ...normalizedBase.mobilePermissions,
          ...normalizedOverride.mobilePermissions,
        },
        providerPreferences: {
          ...normalizedBase.providerPreferences,
          ...normalizedOverride.providerPreferences,
        },
      };
    }),
    normalizeAgentWorkOSConfig: vi.fn(normalizeMockAgentWorkOSConfig),
    resolveMobilePermissionPolicyForMode: vi.fn((_mode: string, policy: any) => policy),
  };
});

vi.mock('@nimbalyst/runtime/core/TrackerRecord', () => ({
  dbRowToRecord: vi.fn((row: any) => ({
    id: row.id,
    primaryType: row.type,
    typeTags: ['work-packet'],
    source: 'native',
    archived: false,
    syncStatus: 'local',
    system: {
      workspace: row.workspace,
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    fields: row.data,
  })),
}));

vi.mock('../../../database/PGLiteDatabaseWorker', () => ({
  database: {
    query: vi.fn(),
  },
}));

vi.mock('../../../utils/store', () => ({
  getAppSetting: vi.fn(() => undefined),
  getWorkspaceState: vi.fn(() => ({})),
}));

vi.mock('../../../mcp/tools/codexToolCallResolver', () => ({
  resolveRequestUserInputPromptTargets: vi.fn((promptId: string) => ({
    promptId,
    waiterPromptIds: [promptId],
  })),
}));

vi.mock('@nimbalyst/runtime/ai/server', () => ({
  ProviderFactory: {
    getProvider: vi.fn(),
  },
}));

vi.mock('../../../utils/logger', () => ({
  logger: {
    ai: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}));

vi.mock('../../tray/TrayManager', () => ({
  TrayManager: {
    getInstance: () => ({
      onPromptResolved: vi.fn(),
    }),
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    emit: vi.fn(),
    listenerCount: vi.fn(() => 0),
  },
}));

import { AISessionsRepository } from '@nimbalyst/runtime/storage/repositories/AISessionsRepository';
import { buildWorkPacketControlSurfaceContext } from '@nimbalyst/runtime/agent-work-os';
import { database } from '../../../database/PGLiteDatabaseWorker';
import { evaluateMobileWorkPacketGuard } from '../mobileWorkPacketGuard';

const WORKSPACE = '/workspace';

function makeTrackerRow(data: Record<string, unknown>) {
  return {
    id: 'wpkt-1',
    type: 'work-packet',
    type_tags: JSON.stringify(['work-packet']),
    workspace: WORKSPACE,
    document_path: '',
    line_number: null,
    issue_number: 1,
    issue_key: 'WPKT-1',
    source: 'native',
    source_ref: null,
    archived: false,
    sync_status: 'local',
    content: null,
    created: new Date('2026-06-05T00:00:00.000Z'),
    updated: new Date('2026-06-05T00:00:00.000Z'),
    last_indexed: null,
    data,
  };
}

describe('MobileSessionControlHandler Work Packet guard', () => {
  beforeEach(() => {
    vi.mocked(AISessionsRepository.get).mockReset();
    vi.mocked(buildWorkPacketControlSurfaceContext).mockReset();
    vi.mocked(database.query).mockReset();
  });

  it('does not block when the session has no linked tracker items', async () => {
    vi.mocked(AISessionsRepository.get).mockResolvedValue({
      id: 'session-1',
      workspacePath: WORKSPACE,
      metadata: {},
    } as any);

    const result = await evaluateMobileWorkPacketGuard('session-1');

    expect(result.blocked).toBe(false);
    expect(database.query).not.toHaveBeenCalled();
    expect(buildWorkPacketControlSurfaceContext).not.toHaveBeenCalled();
  });

  it('blocks mobile approval when a risky linked Work Packet needs desktop review', async () => {
    vi.mocked(AISessionsRepository.get).mockResolvedValue({
      id: 'session-1',
      workspacePath: WORKSPACE,
      metadata: {
        linkedTrackerItemIds: ['wpkt-1'],
      },
    } as any);
    vi.mocked(database.query).mockResolvedValue({
      rows: [
        makeTrackerRow({
          title: 'Risky packet',
          gate: 'review',
          complexity: 'risky',
          recommendedAgent: 'codex',
          capabilityRoute: 'plan-first',
          risks: 'Database migration and production runtime behavior.',
          diffSummary: '',
          reviewEvidence: '',
        }),
      ],
    } as any);
    vi.mocked(buildWorkPacketControlSurfaceContext).mockReturnValue({
      hasWorkPacketContext: true,
      desktopReviewRequired: true,
      workPacketIds: ['WPKT-1'],
      warningText: [
        'Work Packet guardrail',
        'Risky packet is at review gate',
        'Database impact requires explicit human approval.',
      ].join(' '),
    });

    const result = await evaluateMobileWorkPacketGuard('session-1');

    expect(result.blocked).toBe(true);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM tracker_items'),
      [WORKSPACE, 'wpkt-1'],
    );
    expect(buildWorkPacketControlSurfaceContext).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'wpkt-1',
          primaryType: 'work-packet',
          fields: expect.objectContaining({ title: 'Risky packet' }),
        }),
      ],
      expect.objectContaining({
        mobilePolicy: expect.objectContaining({ mode: 'balanced' }),
      }),
    );
    expect(result.warningText).toContain('Work Packet guardrail');
    expect(result.warningText).toContain('Risky packet is at review gate');
    expect(result.warningText).toContain('Database impact requires explicit human approval.');
  });

  it('loads file-backed Work Packets linked through session metadata', async () => {
    vi.mocked(AISessionsRepository.get).mockResolvedValue({
      id: 'session-1',
      workspacePath: WORKSPACE,
      metadata: {
        linkedTrackerItemIds: ['file:docs/work-packet.md'],
      },
    } as any);
    vi.mocked(database.query).mockResolvedValue({
      rows: [
        {
          ...makeTrackerRow({
            title: 'Document packet',
            gate: 'review',
            complexity: 'risky',
          }),
          id: 'row-1',
          source: 'frontmatter',
          source_ref: 'docs/work-packet.md',
          document_path: '',
        },
      ],
    } as any);
    vi.mocked(buildWorkPacketControlSurfaceContext).mockReturnValue({
      hasWorkPacketContext: true,
      desktopReviewRequired: true,
      workPacketIds: ['row-1'],
      warningText: 'Work Packet guardrail: desktop review required.',
    });

    const result = await evaluateMobileWorkPacketGuard('session-1');

    expect(result.blocked).toBe(true);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('source_ref = $2'),
      [WORKSPACE, 'docs/work-packet.md'],
    );
    expect(buildWorkPacketControlSurfaceContext).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'row-1',
          primaryType: 'work-packet',
          fields: expect.objectContaining({ title: 'Document packet' }),
        }),
      ],
      expect.objectContaining({
        mobilePolicy: expect.objectContaining({ mode: 'balanced' }),
      }),
    );
  });

  it('passes action-specific mobile policy into the Work Packet control context', async () => {
    vi.mocked(AISessionsRepository.get).mockResolvedValue({
      id: 'session-1',
      workspacePath: WORKSPACE,
      metadata: {
        linkedTrackerItemIds: ['wpkt-1'],
      },
    } as any);
    vi.mocked(database.query).mockResolvedValue({
      rows: [
        makeTrackerRow({
          title: 'Low risk packet',
          gate: 'verification',
          complexity: 'small',
          risks: 'none',
          testsRun: 'Focused tests passed.',
          verificationEvidence: 'Manual check passed.',
        }),
      ],
    } as any);
    vi.mocked(buildWorkPacketControlSurfaceContext).mockReturnValue({
      hasWorkPacketContext: true,
      desktopReviewRequired: false,
      workPacketIds: ['WPKT-1'],
    });

    const result = await evaluateMobileWorkPacketGuard('session-1', { action: 'commit-approval' });

    expect(result.blocked).toBe(false);
    expect(buildWorkPacketControlSurfaceContext).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        action: 'commit-approval',
        mobilePolicy: expect.objectContaining({ mode: 'balanced' }),
      }),
    );
  });
});
