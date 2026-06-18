/**
 * TrackerItemDetail - Detail/edit panel for a selected tracker item.
 * Shows all model-defined fields with real editors, description area,
 * and metadata. Appears as a right-side panel in TrackerMainView.
 *
 * For native (database-stored) items, includes an embedded Lexical editor
 * for rich content editing with debounced saves to PGLite.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  NimbalystEditor,
  MaterialSymbol,
  ProviderIcon,
  buildFrontendVisualVerificationGuidance,
  evaluateWorkPacketGateTransition,
  evaluateWorkPacketGates,
  routeWorkPacket,
} from '@nimbalyst/runtime';
import type { EditorConfig } from '@nimbalyst/runtime/editor';
import { $convertFromEnhancedMarkdownString, getEditorTransformers } from '@nimbalyst/runtime/editor';
import { $getRoot } from 'lexical';
import type { TrackerRecord } from '@nimbalyst/runtime/core/TrackerRecord';
import { globalRegistry } from '@nimbalyst/runtime/plugins/TrackerPlugin/models';
import type { FieldDefinition } from '@nimbalyst/runtime/plugins/TrackerPlugin/models/TrackerDataModel';
import { getRecordTitle, getRecordStatus, getRecordPriority, getRecordField } from '@nimbalyst/runtime/plugins/TrackerPlugin/trackerRecordAccessors';
import { TrackerFieldEditor, type TeamMemberOption } from '@nimbalyst/runtime/plugins/TrackerPlugin/components/TrackerFieldEditor';
import { UserAvatar } from '@nimbalyst/runtime/plugins/TrackerPlugin/components/UserAvatar';
import { trackerItemByIdAtom } from '@nimbalyst/runtime/plugins/TrackerPlugin/trackerDataAtoms';
import { refreshSessionListAtom, sessionRegistryAtom, type SessionMeta } from '../../store/atoms/sessions';
import { buildTrackerDeepLink } from '../../store/atoms/collabDocuments';
import { errorNotificationService } from '../../services/ErrorNotificationService';
import { getRelativeTimeString } from '../../utils/dateFormatting';
import { useTrackerContentCollab } from '../../hooks/useTrackerContentCollab';
import {
  getWorkPacketLaunchEvidence,
  type WorkPacketLaunchEvidenceSession,
  type WorkPacketReviewerStatus,
} from './workPacketLaunchEvidence';
import {
  buildWorkPacketEvidenceWritebackUpdate,
  getWorkPacketEvidenceWritebackField,
  WORK_PACKET_EVIDENCE_WRITEBACK_FIELDS,
} from './workPacketEvidenceWriteback';

interface TrackerItemDetailProps {
  itemId: string;
  workspacePath?: string;
  onClose: () => void;
  onSwitchToFilesMode?: () => void;
  onSwitchToAgentMode?: (sessionId: string) => void;
  onLaunchSession?: (trackerItemId: string) => void;
  onLaunchWorktreeSession?: (trackerItemId: string) => void;
  onAutoImplement?: (trackerItemId: string) => void;
  onArchive?: (itemId: string, archive: boolean) => void;
  onDelete?: (itemId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  'to-do': '#6b7280',
  'in-progress': '#eab308',
  'in-review': '#8b5cf6',
  'done': '#22c55e',
  'blocked': '#ef4444',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
};

const TYPE_COLORS: Record<string, string> = {
  bug: '#dc2626',
  task: '#2563eb',
  plan: '#7c3aed',
  idea: '#ca8a04',
  decision: '#8b5cf6',
  feature: '#10b981',
};

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    bug: 'bug_report',
    task: 'check_box',
    plan: 'assignment',
    idea: 'lightbulb',
    decision: 'gavel',
    feature: 'rocket_launch',
  };
  return icons[type] || 'label';
}

function formatTimestamp(value: string | Date | number | undefined): string {
  if (!value) return '\u2014';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime()) || date.getTime() === 0) return '\u2014';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Whether this record is a native DB item (no file backing) */
function isNativeItem(record: TrackerRecord): boolean {
  return record.source === 'native' || !record.system.documentPath;
}

/** Whether this record's metadata fields are editable */
function isEditable(record: TrackerRecord): boolean {
  return isNativeItem(record) || record.source === 'frontmatter' || record.source === 'import' || record.source === 'inline';
}

/** Source label for the metadata footer */
function getSourceLabel(record: TrackerRecord): string | null {
  if (!record.source || record.source === 'native') return 'Database (no file backing)';
  if (record.source === 'inline') return `Inline marker${record.sourceRef ? ` in ${record.sourceRef}` : ''}`;
  if (record.source === 'frontmatter') return `Frontmatter${record.sourceRef ? ` in ${record.sourceRef}` : ''}`;
  if (record.source === 'import') return `Imported${record.sourceRef ? ` from ${record.sourceRef}` : ''}`;
  return null;
}

function getWorkPacketRouteInput(item: TrackerRecord) {
  return {
    complexity: typeof item.fields.complexity === 'string' ? item.fields.complexity : undefined,
    risks: typeof item.fields.risks === 'string' ? item.fields.risks : undefined,
    recommendedAgent: typeof item.fields.recommendedAgent === 'string' ? item.fields.recommendedAgent : undefined,
    capabilityRoute: typeof item.fields.capabilityRoute === 'string' ? item.fields.capabilityRoute : undefined,
    requiredSkills: Array.isArray(item.fields.requiredSkills)
      ? item.fields.requiredSkills.filter((value): value is string => typeof value === 'string')
      : undefined,
  };
}

function getGateCheckIcon(status: 'complete' | 'missing' | 'warning'): string {
  if (status === 'complete') return 'check_circle';
  if (status === 'warning') return 'info';
  return 'radio_button_unchecked';
}

function getGateCheckClass(status: 'complete' | 'missing' | 'warning'): string {
  if (status === 'complete') return 'text-[#15803d]';
  if (status === 'warning') return 'text-[#b45309]';
  return 'text-nim-muted';
}

const WorkPacketGateChecklist: React.FC<{ item: TrackerRecord }> = ({ item }) => {
  const evaluation = useMemo(() => evaluateWorkPacketGates(item), [item]);
  if (evaluation.checks.length === 0) return null;

  return (
    <div className="tracker-work-packet-gate-checklist rounded border border-nim bg-nim-tertiary p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium text-nim-muted uppercase tracking-[0.5px]">
            Gate Checklist
          </div>
          <div className="mt-0.5 text-xs text-nim">
            {evaluation.readyForCurrentGate
              ? `${evaluation.gate} gate evidence is ready`
              : `${evaluation.gate} gate needs evidence`}
          </div>
        </div>
        <MaterialSymbol
          icon={evaluation.readyForCurrentGate ? 'verified' : 'pending_actions'}
          size={18}
          className={evaluation.readyForCurrentGate ? 'text-[#15803d]' : 'text-[#b45309]'}
        />
      </div>
      <div className="mt-2 grid gap-1.5">
        {evaluation.checks.map((gateCheck) => (
          <div key={gateCheck.id} className="flex items-start gap-2 text-xs">
            <MaterialSymbol
              icon={getGateCheckIcon(gateCheck.status)}
              size={15}
              className={`${getGateCheckClass(gateCheck.status)} shrink-0 mt-[1px]`}
            />
            <div className="min-w-0">
              <div className={gateCheck.status === 'missing' && gateCheck.required ? 'text-nim' : 'text-nim-muted'}>
                {gateCheck.label}
                {gateCheck.required ? '' : ' (optional)'}
              </div>
              {gateCheck.detail && (
                <div className="mt-0.5 text-[11px] leading-snug text-nim-muted">
                  {gateCheck.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const WorkPacketCapabilityPanel: React.FC<{ item: TrackerRecord }> = ({ item }) => {
  const route = useMemo(() => routeWorkPacket(getWorkPacketRouteInput(item)), [item]);
  const routeItems = [
    { icon: 'smart_toy', label: 'Provider', value: route.provider },
    { icon: 'route', label: 'Mode', value: route.sessionMode },
    { icon: 'account_tree', label: 'Worktree', value: route.worktreeRecommended ? 'Recommended' : 'Optional' },
    { icon: 'rate_review', label: 'Second Review', value: route.secondAgentReviewRequired ? 'Required' : 'Optional' },
    { icon: 'article', label: 'Docs Gate', value: route.docsGateRequired ? 'Required' : 'Optional' },
    { icon: 'verified_user', label: 'Human Approval', value: route.humanApprovalRequired ? 'Required' : 'Not required' },
  ];

  return (
    <div className="tracker-work-packet-capability-panel rounded border border-nim bg-nim-tertiary p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium text-nim-muted uppercase tracking-[0.5px]">
            Capability Gate
          </div>
          <div className="mt-0.5 text-xs text-nim">
            {route.provider} / {route.sessionMode}
          </div>
        </div>
        <MaterialSymbol
          icon={route.humanApprovalRequired ? 'admin_panel_settings' : 'tune'}
          size={18}
          className={route.humanApprovalRequired ? 'text-[#b45309]' : 'text-nim-muted'}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {routeItems.map((routeItem) => (
          <div key={routeItem.label} className="flex items-center gap-1.5 rounded bg-nim px-2 py-1.5 text-xs">
            <MaterialSymbol icon={routeItem.icon} size={14} className="shrink-0 text-nim-muted" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.4px] text-nim-muted">
                {routeItem.label}
              </div>
              <div className="truncate text-nim">
                {routeItem.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(route.reviewerProvider || route.highReasoningRecommended || route.pursueGoalRecommended) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {route.reviewerProvider && (
            <span className="rounded bg-nim px-1.5 py-0.5 text-[11px] text-nim-muted">
              reviewer: {route.reviewerProvider}
            </span>
          )}
          {route.highReasoningRecommended && (
            <span className="rounded bg-nim px-1.5 py-0.5 text-[11px] text-nim-muted">
              high reasoning
            </span>
          )}
          {route.pursueGoalRecommended && (
            <span className="rounded bg-nim px-1.5 py-0.5 text-[11px] text-nim-muted">
              pursue goal
            </span>
          )}
        </div>
      )}

      {(route.approvalReasons.length > 0 || route.routingNotes.length > 0 || route.warnings.length > 0) && (
        <div className="mt-2 space-y-1">
          {[...route.approvalReasons, ...route.routingNotes, ...route.warnings].map((note, index) => (
            <div key={`${note}-${index}`} className="flex items-start gap-1.5 text-[11px] leading-snug text-nim-muted">
              <MaterialSymbol icon="info" size={13} className="mt-[1px] shrink-0" />
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const WorkPacketVisualEvidencePanel: React.FC<{ item: TrackerRecord; workspacePath?: string }> = ({ item, workspacePath }) => {
  const guidance = useMemo(() => buildFrontendVisualVerificationGuidance(item), [item]);
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<{
    success: boolean;
    resultPath?: string;
    screenshots?: Array<{ viewport: string; width: number; height: number; path: string }>;
    error?: string;
  } | null>(null);

  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(guidance.command);
      setCopied(true);
      errorNotificationService.showInfo(
        'Visual check command copied',
        'Run it while Nimbalyst is open in dev mode, then paste the report paths into verification evidence.',
        { duration: 3000 },
      );
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[TrackerItemDetail] Failed to copy visual check command:', err);
      errorNotificationService.showError(
        'Copy failed',
        'Could not write the visual check command to the clipboard.',
      );
    }
  }, [guidance.command]);

  const handleRunVisualCheck = useCallback(async () => {
    if (!window.electronAPI?.agentWorkOS?.runVisualCheck) {
      errorNotificationService.showError(
        'Visual check unavailable',
        'Restart Nimbalyst to load the Agent Work OS visual check runner.',
      );
      return;
    }

    setIsRunning(true);
    setRunResult(null);
    try {
      const result = await window.electronAPI.agentWorkOS.runVisualCheck({
        label: item.id,
        workspacePath,
      });
      setRunResult(result);
      if (result.success) {
        errorNotificationService.showInfo(
          'Visual check captured',
          result.resultPath
            ? `Report saved to ${result.resultPath}`
            : 'Screenshots and diagnostics were captured.',
          { duration: 5000 },
        );
      } else {
        errorNotificationService.showError(
          'Visual check failed',
          result.error || 'Could not capture visual evidence.',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRunResult({ success: false, error: message });
      errorNotificationService.showError('Visual check failed', message);
    } finally {
      setIsRunning(false);
    }
  }, [item.id, workspacePath]);

  if (!guidance.required) return null;

  return (
    <div className="tracker-work-packet-visual-evidence rounded border border-nim bg-nim-tertiary p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium text-nim-muted uppercase tracking-[0.5px]">
            Visual Evidence
          </div>
          <div className="mt-0.5 text-xs text-nim">
            Desktop and mobile screenshots are recommended for this Work Packet
          </div>
        </div>
        <MaterialSymbol icon="visibility" size={18} className="text-nim-muted" />
      </div>
      <div className="mt-2 rounded bg-nim px-2 py-1.5 font-mono text-[11px] leading-snug text-nim-muted break-all">
        {guidance.command}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[11px] leading-snug text-nim-muted">
          Dev mode only. Saves screenshots and JSON under e2e_test_output/agent-work-os-visual.
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <button
            className="inline-flex items-center gap-1 rounded border border-nim px-2 py-1 text-[11px] font-medium text-nim-muted hover:bg-nim hover:text-nim transition-colors disabled:opacity-60 disabled:hover:bg-transparent"
            onClick={handleRunVisualCheck}
            disabled={isRunning}
            title="Run the frontend visual check against the open Nimbalyst window"
          >
            <MaterialSymbol icon={isRunning ? 'hourglass_top' : 'play_arrow'} size={14} />
            {isRunning ? 'Running' : 'Run'}
          </button>
          <button
            className="inline-flex items-center gap-1 rounded border border-nim px-2 py-1 text-[11px] font-medium text-nim-muted hover:bg-nim hover:text-nim transition-colors"
            onClick={handleCopyCommand}
            title="Copy the frontend visual check command"
          >
            <MaterialSymbol icon={copied ? 'check' : 'content_copy'} size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {runResult && (
        <div className={`mt-2 rounded border px-2 py-1.5 text-[11px] leading-snug ${
          runResult.success
            ? 'border-[#86efac] bg-[#f0fdf4] text-[#166534]'
            : 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]'
        }`}>
          {runResult.success ? (
            <div className="space-y-1">
              {runResult.resultPath && (
                <div className="break-all">Report: {runResult.resultPath}</div>
              )}
              {runResult.screenshots?.map((screenshot) => (
                <div key={screenshot.path} className="break-all">
                  {screenshot.viewport}: {screenshot.path}
                </div>
              ))}
            </div>
          ) : (
            <div className="select-text break-words">
              {runResult.error || 'Could not capture visual evidence.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const WorkPacketEvidenceSessionRow: React.FC<{
  label: string;
  evidenceSession: WorkPacketLaunchEvidenceSession;
  badgeLabel?: string;
  badgeClassName?: string;
  onOpen?: (sessionId: string) => void;
}> = ({ label, evidenceSession, badgeLabel, badgeClassName, onOpen }) => {
  const session = evidenceSession.session;
  const title = session?.title || evidenceSession.id;
  const provider = session?.provider || 'claude';

  return (
    <button
      className="w-full flex items-center gap-2 rounded bg-nim px-2 py-1.5 text-left hover:bg-nim-hover transition-colors disabled:hover:bg-nim"
      onClick={() => onOpen?.(evidenceSession.id)}
      disabled={!onOpen}
      title={`Open ${label.toLowerCase()} session: ${title}`}
    >
      <ProviderIcon provider={provider} size={14} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.4px] text-nim-muted">
          {label}
        </div>
        <div className="truncate text-xs text-nim">
          {title}
        </div>
      </div>
      {badgeLabel && (
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${badgeClassName ?? 'bg-nim-tertiary text-nim-faint'}`}>
          {badgeLabel}
        </span>
      )}
      {session ? (
        <span className="shrink-0 text-[10px] text-nim-faint">
          {getRelativeTimeString(session.updatedAt)}
        </span>
      ) : (
        <span className="shrink-0 rounded bg-nim-tertiary px-1.5 py-0.5 text-[10px] text-nim-faint">
          pending
        </span>
      )}
    </button>
  );
};

function getReviewerStatusBadge(status: WorkPacketReviewerStatus): { label: string; className: string } | null {
  switch (status) {
    case 'required':
      return { label: 'review needed', className: 'bg-[#f973161a] text-[#f97316]' };
    case 'session-recorded':
      return { label: 'ready', className: 'bg-[#3b82f61a] text-[#3b82f6]' };
    case 'active':
      return { label: 'active', className: 'bg-[#8b5cf61a] text-[#8b5cf6]' };
    case 'recorded':
      return { label: 'recorded', className: 'bg-[#16a34a1a] text-[#16a34a]' };
    default:
      return null;
  }
}

const WorkPacketLaunchEvidencePanel: React.FC<{
  evidence: ReturnType<typeof getWorkPacketLaunchEvidence>;
  onSwitchToAgentMode?: (sessionId: string) => void;
}> = ({ evidence, onSwitchToAgentMode }) => {
  if (!evidence.hasEvidence) return null;
  const reviewerBadge = getReviewerStatusBadge(evidence.reviewerStatus);

  return (
    <div className="tracker-work-packet-launch-evidence rounded border border-nim bg-nim-tertiary p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium text-nim-muted uppercase tracking-[0.5px]">
            Launch Evidence
          </div>
          <div className="mt-0.5 text-xs text-nim">
            Agent sessions and worktree recorded for this Work Packet
          </div>
        </div>
        <MaterialSymbol icon="fact_check" size={18} className="text-nim-muted" />
      </div>

      <div className="mt-2 space-y-1.5">
        {evidence.implementationSession && (
          <WorkPacketEvidenceSessionRow
            label="Implementation"
            evidenceSession={evidence.implementationSession}
            onOpen={onSwitchToAgentMode}
          />
        )}
        {evidence.reviewerSession && (
          <WorkPacketEvidenceSessionRow
            label="Reviewer"
            evidenceSession={evidence.reviewerSession}
            badgeLabel={reviewerBadge?.label}
            badgeClassName={reviewerBadge?.className}
            onOpen={onSwitchToAgentMode}
          />
        )}
      </div>

      {!evidence.reviewerSession && reviewerBadge && (
        <div className="mt-2 flex items-start gap-1.5 rounded bg-nim px-2 py-1.5 text-[11px] leading-snug text-nim-muted">
          <MaterialSymbol icon="rate_review" size={13} className="mt-[1px] shrink-0 text-[#f97316]" />
          <span>Second-agent review is required, but no reviewer session has been recorded yet.</span>
        </div>
      )}

      {(evidence.worktreeId || evidence.worktreePath) && (
        <div className="mt-2 grid gap-1.5 text-xs">
          {evidence.worktreeId && (
            <div className="flex items-center gap-2 rounded bg-nim px-2 py-1.5">
              <MaterialSymbol icon="account_tree" size={14} className="shrink-0 text-nim-muted" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.4px] text-nim-muted">Worktree</div>
                <div className="truncate font-mono text-nim">{evidence.worktreeId}</div>
              </div>
            </div>
          )}
          {evidence.worktreePath && (
            <div className="flex items-center gap-2 rounded bg-nim px-2 py-1.5">
              <MaterialSymbol icon="folder_open" size={14} className="shrink-0 text-nim-muted" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.4px] text-nim-muted">Path</div>
                <div className="truncate font-mono text-nim" title={evidence.worktreePath}>
                  {evidence.worktreePath}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const WorkPacketEvidenceWritebackPanel: React.FC<{
  item: TrackerRecord;
  editable: boolean;
  selectedField: string;
  draft: string;
  saving: boolean;
  error: string | null;
  onSelectedFieldChange: (fieldName: string) => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}> = ({
  item,
  editable,
  selectedField,
  draft,
  saving,
  error,
  onSelectedFieldChange,
  onDraftChange,
  onSave,
}) => {
  const selectedDefinition = getWorkPacketEvidenceWritebackField(selectedField)
    ?? WORK_PACKET_EVIDENCE_WRITEBACK_FIELDS[0];
  const existingFieldValue = (item.fields as Record<string, unknown>)[selectedDefinition.name];
  const existingValue = typeof existingFieldValue === 'string'
    ? existingFieldValue.trim()
    : '';

  return (
    <div className="tracker-work-packet-evidence-writeback rounded border border-nim bg-nim-tertiary p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium text-nim-muted uppercase tracking-[0.5px]">
            Evidence Writeback
          </div>
          <div className="mt-0.5 text-xs text-nim">
            Add observed facts without changing gates or approvals
          </div>
        </div>
        <MaterialSymbol icon="edit_note" size={18} className="text-nim-muted" />
      </div>

      <div className="mt-2 grid gap-2">
        <label className="grid gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.4px] text-nim-muted">
            Field
          </span>
          <select
            className="w-full rounded border border-nim bg-nim px-2 py-1.5 text-xs text-nim outline-none focus:border-nim-focus disabled:opacity-60"
            value={selectedDefinition.name}
            onChange={(event) => onSelectedFieldChange(event.target.value)}
            disabled={!editable || saving}
            title="Choose a Work Packet evidence field"
          >
            {WORK_PACKET_EVIDENCE_WRITEBACK_FIELDS.map((field) => (
              <option key={field.name} value={field.name}>
                {field.label}
              </option>
            ))}
          </select>
        </label>

        <div className="text-[11px] leading-snug text-nim-muted">
          {selectedDefinition.description}
        </div>

        {existingValue && (
          <div className="rounded bg-nim px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.4px] text-nim-muted">
              Current value
            </div>
            <div className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug text-nim-muted">
              {existingValue}
            </div>
          </div>
        )}

        <textarea
          className="min-h-[86px] w-full resize-y rounded border border-nim bg-nim px-2 py-1.5 text-xs leading-snug text-nim outline-none focus:border-nim-focus disabled:opacity-60"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="粘贴观察到的证据、测试输出、评审记录或截图路径..."
          disabled={!editable || saving}
        />

        {error && (
          <div className="text-[11px] leading-snug text-nim-error">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-[11px] leading-snug text-nim-muted">
            Guarded fields stay controlled by the Work Packet workflow.
          </div>
          <button
            className="shrink-0 inline-flex items-center gap-1 rounded border border-nim px-2 py-1 text-[11px] font-medium text-nim-muted hover:bg-nim hover:text-nim transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-nim-muted"
            onClick={onSave}
            disabled={!editable || saving || draft.trim().length === 0}
            title="Save evidence to the selected Work Packet field"
          >
            <MaterialSymbol icon={saving ? 'hourglass_empty' : 'save'} size={14} />
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Inline editor for adding/removing secondary type tags */
const TypeTagsEditor: React.FC<{
  typeTags: string[];
  primaryType: string;
  onUpdate: (tags: string[]) => void;
}> = ({ typeTags, primaryType, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const allModels = globalRegistry.getAll().filter(m => m.primaryCapable !== false && m.creatable !== false);
  const secondaryTags = typeTags.filter(t => t !== primaryType);
  const availableTypes = allModels.filter(m => m.type !== primaryType && !typeTags.includes(m.type));

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-nim-faint font-medium uppercase tracking-wider">Type Tags</span>
        <button
          className="text-[10px] text-nim-muted hover:text-nim px-1 py-0.5 rounded hover:bg-nim-tertiary"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? 'Done' : '+ Add'}
        </button>
      </div>
      {secondaryTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {secondaryTags.map(tag => {
            const tagModel = globalRegistry.get(tag);
            const tagColor = TYPE_COLORS[tag] || '#6b7280';
            return (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer group"
                style={{ color: tagColor, backgroundColor: `${tagColor}15`, border: `1px solid ${tagColor}30` }}
                onClick={() => onUpdate(typeTags.filter(t => t !== tag))}
                title={`Remove ${tagModel?.displayName || tag} tag`}
              >
                {tagModel?.displayName || tag}
                <span className="opacity-0 group-hover:opacity-100 text-[9px]">&times;</span>
              </span>
            );
          })}
        </div>
      )}
      {isOpen && availableTypes.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {availableTypes.map(m => {
            const tagColor = TYPE_COLORS[m.type] || '#6b7280';
            return (
              <button
                key={m.type}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded hover:opacity-80"
                style={{ color: tagColor, backgroundColor: `${tagColor}10`, border: `1px dashed ${tagColor}40` }}
                onClick={() => {
                  onUpdate([...typeTags, m.type]);
                }}
              >
                + {m.displayName}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const TrackerItemDetail: React.FC<TrackerItemDetailProps> = ({
  itemId,
  workspacePath,
  onClose,
  onSwitchToFilesMode,
  onSwitchToAgentMode,
  onLaunchSession,
  onLaunchWorktreeSession,
  onAutoImplement,
  onArchive,
  onDelete,
}) => {
  // Read directly from per-item atom -- only re-renders when THIS item changes,
  // not when any other item in the workspace updates.
  const item = useAtomValue(trackerItemByIdAtom(itemId));
  const sessionRegistry = useAtomValue(sessionRegistryAtom);
  const refreshSessionList = useSetAtom(refreshSessionListAtom);

  const model = useMemo(() => globalRegistry.get(item?.primaryType ?? ''), [item?.primaryType]);
  const worktreeLaunchRecommended = useMemo(() => {
    if (!item || item.primaryType !== 'work-packet') return false;
    const route = routeWorkPacket(getWorkPacketRouteInput(item));
    return route.worktreeRecommended;
  }, [item]);

  // Detect whether this workspace has a team. The team check feeds the
  // content editor mode (collab vs local); the member list feeds the
  // assignee picker. NIM-638: these are split into two effects so a slow
  // or hung `team:list-members` doesn't strand `teamOrgId === undefined`
  // and keep the collab editor stuck on "Connecting..." forever -- the
  // editor only needs the orgId, not the members.
  //
  // Tri-state `teamOrgId`:
  //   undefined -- team lookup pending
  //   null      -- confirmed no team for this workspace
  //   string    -- orgId resolved
  const [teamOrgId, setTeamOrgId] = useState<string | null | undefined>(undefined);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [evidenceWritebackField, setEvidenceWritebackField] = useState(
    WORK_PACKET_EVIDENCE_WRITEBACK_FIELDS[0].name,
  );
  const [evidenceWritebackDraft, setEvidenceWritebackDraft] = useState('');
  const [evidenceWritebackError, setEvidenceWritebackError] = useState<string | null>(null);
  const [evidenceWritebackSaving, setEvidenceWritebackSaving] = useState(false);

  const handleCopyLink = useCallback(async () => {
    if (!item || !teamOrgId) return;
    const url = buildTrackerDeepLink(item.id, teamOrgId);
    try {
      await navigator.clipboard.writeText(url);
      errorNotificationService.showInfo(
        'Link copied',
        'Paste it anywhere to open this tracker in Nimbalyst.',
        { duration: 3000 }
      );
    } catch (err) {
      console.error('[TrackerItemDetail] Failed to copy link:', err);
      errorNotificationService.showError(
        'Copy failed',
        'Could not write the link to the clipboard.'
      );
    }
  }, [item, teamOrgId]);

  useEffect(() => {
    if (!workspacePath) {
      setTeamOrgId(null);
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    setTeamOrgId(undefined);
    setTeamMembers([]);
    (async () => {
      try {
        const teamResult = await window.electronAPI.invoke('team:find-for-workspace', workspacePath);
        if (cancelled) return;
        const orgId: string | null = teamResult?.success && teamResult.team?.orgId
          ? teamResult.team.orgId
          : null;
        setTeamOrgId(orgId);
      } catch {
        if (!cancelled) setTeamOrgId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [workspacePath]);
  // Members load on a separate effect keyed on the resolved orgId so a
  // slow members call cannot block the editor. The list-members IPC has
  // its own server-side timeout (see fetchTeamApi); on failure the
  // assignee picker degrades to an empty list, which is fine.
  useEffect(() => {
    if (typeof teamOrgId !== 'string') {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const membersResult = await window.electronAPI.invoke('team:list-members', teamOrgId);
        if (cancelled) return;
        const members: TeamMemberOption[] = membersResult?.success && membersResult.members
          ? membersResult.members
              .filter((m: any) => m.email)
              .map((m: any) => ({ email: m.email, name: m.name || undefined }))
          : [];
        setTeamMembers(members);
      } catch {
        if (!cancelled) setTeamMembers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [teamOrgId]);
  const typeColor = TYPE_COLORS[item?.primaryType ?? ''] || '#6b7280';
  const icon = model?.icon || getTypeIcon(item?.primaryType ?? '');

  // Resolve linked sessions from registry (silently filter deleted ones)
  // Two sources: 1) tracker item's linkedSessions[] (forward link from DB items)
  //              2) sessions whose linkedTrackerItemIds contains this item's ID or file path (reverse link)
  const linkedSessions = useMemo(() => {
    const sessionSet = new Set<string>();

    // Forward: tracker record stores session IDs in system
    const forwardIds: string[] = item?.system?.linkedSessions || [];
    for (const id of forwardIds) sessionSet.add(id);

    // Reverse: sessions that link to this item by ID or by file path
    const trackerItemId = item?.id;
    const filePath = item?.system?.documentPath;
    const fileRef = filePath ? `file:${filePath}` : null;

    // console.log('[TrackerItemDetail] reverse lookup:', { trackerItemId, filePath, fileRef });

    sessionRegistry.forEach((session, sessionId) => {
      const linked = session.linkedTrackerItemIds;
      if (!linked) return;
      if (trackerItemId && linked.includes(trackerItemId)) sessionSet.add(sessionId);
      if (fileRef && linked.includes(fileRef)) sessionSet.add(sessionId);
    });

    if (sessionSet.size === 0) return [];
    return Array.from(sessionSet)
      .map(id => sessionRegistry.get(id))
      .filter((s): s is SessionMeta => s != null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [item, sessionRegistry]);
  const linkedSessionIds = useMemo(() => new Set(linkedSessions.map((session) => session.id)), [linkedSessions]);
  const workPacketLaunchEvidence = useMemo(
    () => getWorkPacketLaunchEvidence(item, sessionRegistry),
    [item, sessionRegistry],
  );
  const canLinkExistingSession = Boolean(item && workspacePath);
  const [isLinkingExistingSession, setIsLinkingExistingSession] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  const [linkingSessionId, setLinkingSessionId] = useState<string | null>(null);
  const [linkSessionError, setLinkSessionError] = useState<string | null>(null);
  const availableSessions = useMemo(() => {
    if (!workspacePath) return [] as SessionMeta[];
    return Array.from(sessionRegistry.values())
      .filter((session) => {
        if (session.workspaceId !== workspacePath) return false;
        if (session.isArchived) return false;
        return !linkedSessionIds.has(session.id);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [linkedSessionIds, sessionRegistry, workspacePath]);
  const filteredAvailableSessions = useMemo(() => {
    if (!sessionSearchQuery.trim()) {
      return availableSessions.slice(0, 8);
    }
    const query = sessionSearchQuery.trim().toLowerCase();
    return availableSessions
      .filter((session) =>
        session.title.toLowerCase().includes(query)
        || session.provider.toLowerCase().includes(query)
        || session.id.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [availableSessions, sessionSearchQuery]);

  // Local state for text fields (debounced save)
  const [localTitle, setLocalTitle] = useState(item ? getRecordTitle(item) : '');
  const [localDescription, setLocalDescription] = useState(item ? (item.fields.description as string ?? '') : '');
  const [localCustomFields, setLocalCustomFields] = useState<Record<string, any>>({});
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editable = item ? isEditable(item) : false;
  const hasRichContent = item ? isNativeItem(item) : false; // Only native items have embedded Lexical content

  // Rich content editor state
  const [contentMarkdown, setContentMarkdown] = useState<string | null>(null);
  const [contentLoaded, setContentLoaded] = useState(false);
  // Bumped when an external writer (MCP, sync) changes the body content
  // out from under us, so the Lexical editor remounts with the new value.
  // Lexical only consumes `initialContent` at mount, so a key change is
  // the only way to surface fresh content without an in-place editor API.
  const [externalContentEpoch, setExternalContentEpoch] = useState(0);
  const getContentFnRef = useRef<(() => string) | null>(null);
  const contentSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentSaveInFlightRef = useRef(false);
  // Baseline of what was last persisted to PGLite for THIS item. Used as a
  // safety rail: if the collab editor mounts empty (e.g., because Lexical's
  // `main` binding is empty while the server Y.Doc only has legacy bytes
  // under `root`), onDirtyChange would otherwise save "" and clobber the
  // real content in PGLite. We refuse any save that would shrink a
  // known-non-empty baseline to empty.
  // Also acts as the comparator for detecting external content updates --
  // if the atom's content diverges from this baseline, the change came
  // from somewhere other than this panel's own save path.
  const loadedBaselineRef = useRef<string | null>(null);

  // Reset local editing state when navigating to a different item.
  // We don't sync on item data changes (saves) to avoid clobbering in-progress text.
  // TrackerItemDetail subscribes to trackerItemByIdAtom(itemId) directly, so it only
  // re-renders when its own item changes -- no prop-drilling churn from parent re-renders.
  useEffect(() => {
    if (!item) return;
    setLocalTitle(getRecordTitle(item));
    setLocalDescription(item.fields.description as string ?? '');
    setLocalCustomFields({});
    // Clear any stale debounce timer from the previous item
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setIsLinkingExistingSession(false);
    setSessionSearchQuery('');
    setLinkingSessionId(null);
    setLinkSessionError(null);
    setEvidenceWritebackField(WORK_PACKET_EVIDENCE_WRITEBACK_FIELDS[0].name);
    setEvidenceWritebackDraft('');
    setEvidenceWritebackError(null);
    setEvidenceWritebackSaving(false);
  }, [itemId]); // itemId only -- not item fields

  // Load rich content from PGLite once when navigating to a new item.
  // After initial load, the Lexical editor owns the content and saves via debounced saveContent.
  // We intentionally do NOT re-fetch on updatedAt changes -- our own saves update updatedAt,
  // and refetching would destroy/remount the editor, causing text to vanish mid-typing.
  useEffect(() => {
    if (!hasRichContent) {
      setContentLoaded(true);
      return;
    }

    let cancelled = false;
    setContentLoaded(false);
    setContentMarkdown(null);
    loadedBaselineRef.current = null;
    getContentFnRef.current = null;

    window.electronAPI.documentService.getTrackerItemContent({ itemId: item!.id })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.content != null) {
          const markdown = typeof result.content === 'string'
            ? result.content
            : result.content?.markdown ?? '';
          setContentMarkdown(markdown);
          loadedBaselineRef.current = markdown;
        } else {
          setContentMarkdown('');
          loadedBaselineRef.current = '';
        }
        setContentLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[TrackerItemDetail] Failed to load content:', err);
        setContentMarkdown('');
        setContentLoaded(true);
      });

    return () => { cancelled = true; };
  }, [item?.id, hasRichContent]);

  // External content update detection.
  // The atom's `content` is refreshed by trackerSyncListeners whenever a
  // tracker-items-changed event arrives -- including MCP writes, sync
  // pushes, comment additions, and our own field saves. Our own content
  // saves are recognized because saveContent advances the baseline before
  // the IPC round-trip, so when the broadcast echo arrives the atom value
  // already matches. Any other divergence means an external writer changed
  // the body, and Lexical can only adopt that by remounting -- bump the
  // epoch in the editor key so it picks up the fresh initialContent.
  const atomContentString = useMemo<string | null>(() => {
    if (!hasRichContent) return null;
    const c = item?.content;
    if (c == null) return null;
    return typeof c === 'string' ? c : (c as any)?.markdown ?? null;
  }, [item?.content, hasRichContent]);

  useEffect(() => {
    if (!hasRichContent) return;
    if (atomContentString == null) return;
    const baseline = loadedBaselineRef.current;
    // Initial load hasn't completed yet -- the load effect owns this state
    if (baseline === null) return;
    if (atomContentString === baseline) return;
    // Local typing wins over a racing external write. If this panel already
    // has a pending or in-flight body save, remounting Lexical here would
    // discard the user's unsaved characters. Let the local save finish and
    // intentionally keep the editor on the locally-authored content.
    if (contentSaveTimerRef.current || contentSaveInFlightRef.current) {
      return;
    }
    // External update detected: refresh the editor.
    loadedBaselineRef.current = atomContentString;
    setContentMarkdown(atomContentString);
    setExternalContentEpoch((e) => e + 1);
  }, [atomContentString, hasRichContent]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const syncMode = useMemo(() => {
    const tracker = globalRegistry.get(item?.primaryType ?? '');
    return tracker?.sync?.mode || 'local';
  }, [item?.primaryType]);

  const contentMode = useMemo(() => {
    if (!item || !isNativeItem(item)) return 'file-backed' as const;
    if (syncMode === 'local') return 'local-pglite' as const;
    // Shared/hybrid trackers need a team for collaborative editing. Without
    // one, content is purely local. While the team check is still pending
    // (`teamOrgId === undefined`) stay in collaborative mode so the loading
    // UI runs -- otherwise the local editor would mount and risk being
    // clobbered if a team is then discovered.
    if (teamOrgId === null) return 'local-pglite' as const;
    return 'collaborative' as const;
  }, [item, syncMode, teamOrgId]);

  // Collaborative content editing for team-synced items. Dormant unless the
  // workspace actually has a team -- see useTrackerContentCollab for the
  // teamOrgId tri-state contract.
  const {
    collaboration: collabConfig,
    loading: collabLoading,
    status: collabStatus,
    reviewState,
    acceptRemoteChanges,
    rejectRemoteChanges,
    providerEpoch,
    bodyCacheMarkdown,
  } = useTrackerContentCollab({
    itemId,
    workspacePath,
    syncMode,
    teamMemberCount: teamMembers.length,
    teamOrgId,
  });

  // Track whether the collab provider has ever reached 'connected' for this
  // item/provider lifecycle. We show a static loading indicator over the
  // editor until then, because the editor may mount with an empty Y.Doc
  // while the WebSocket sync is still in flight -- without this the user
  // would see a blank editor and mistake it for "no content".
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false);
  useEffect(() => {
    // Reset when a fresh provider is created (new item or new session).
    setHasSyncedOnce(false);
  }, [providerEpoch]);
  useEffect(() => {
    if (collabStatus === 'connected') setHasSyncedOnce(true);
  }, [collabStatus]);

  // Defensive cold-paint fallback for shared `fullDocument` trackers.
  //
  // The happy path: `useTrackerContentCollab` provides `initialEditorState`
  // built from `tracker_body_cache`, CollaborationPlugin's `_xmlText._length`
  // check fires bootstrap, the seed runs, content renders.
  //
  // The seam this catches: in prod we have seen the WebSocket reach
  // `connected` for a shared tracker, the `tracker_body_cache` row has
  // valid body bytes, AND no `initialEditorState fn CALLED` log fires --
  // the editor stays empty. The most likely cause is that
  // `@lexical/yjs` considers the shared XmlText non-empty after the
  // server-sync response is applied (the binding writes a root element
  // even when the room has never been seeded with real content), so
  // bootstrap is suppressed and the seed never gets a chance.
  //
  // This effect: 600ms after status reaches `connected`, if we have
  // cached body markdown AND the editor is visually empty, apply the
  // cached markdown via `editor.update()`. Going through the editor
  // (rather than `editor.parseEditorState`) means the change propagates
  // through `@lexical/yjs` into the Y.Doc, so peers receive the body
  // via the normal CRDT merge -- the empty server room finally gets
  // populated.
  const collabEditorInstanceRef = useRef<any>(null);
  useEffect(() => {
    if (collabStatus !== 'connected') return;
    if (!bodyCacheMarkdown || bodyCacheMarkdown.trim().length === 0) return;
    const t = setTimeout(() => {
      const editor = collabEditorInstanceRef.current;
      const getContent = getContentFnRef.current;
      if (!editor || !getContent) return;
      const current = getContent();
      // The check must be `trim() === ''` -- a fresh Lexical doc renders
      // as a single empty paragraph that serializes to '' after trim, so
      // anything content-bearing returns a non-empty trimmed string.
      if (current.trim() !== '') return;
      console.warn(
        '[TrackerItemDetail] Cold-paint fallback firing: editor is empty after sync(connected) but tracker_body_cache has bytes. Forcing paint.',
        { itemId, mdLen: bodyCacheMarkdown.length, providerEpoch },
      );
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        $convertFromEnhancedMarkdownString(bodyCacheMarkdown, getEditorTransformers());
      });
    }, 600);
    return () => clearTimeout(t);
  }, [collabStatus, bodyCacheMarkdown, providerEpoch, itemId]);

  /** Save a field update -- routes to file-based save for file-backed items, DB for native */
  const saveField = useCallback(async (updates: Record<string, any>) => {
    if (!editable || !item) return false;
    try {
      if ((item.source === 'frontmatter' || item.source === 'import' || item.source === 'inline') && item.system.documentPath) {
        // File-backed items with a real document path: update in source file
        await window.electronAPI.documentService.updateTrackerItemInFile({
          itemId: item.id,
          updates,
        });
      } else {
        // Native DB items, or file-backed items whose document_path is missing/empty
        await window.electronAPI.documentService.updateTrackerItem({
          itemId: item.id,
          updates,
          syncMode,
        });
      }
      return true;
    } catch (err) {
      console.error('[TrackerItemDetail] Failed to save field:', err);
      return false;
    }
  }, [item?.id, item?.source, editable, syncMode]);

  const handleSaveEvidenceWriteback = useCallback(async () => {
    const result = buildWorkPacketEvidenceWritebackUpdate(
      item,
      evidenceWritebackField,
      evidenceWritebackDraft,
    );
    if (!result.allowed) {
      setEvidenceWritebackError(result.error || 'Evidence cannot be saved.');
      return;
    }

    setEvidenceWritebackSaving(true);
    setEvidenceWritebackError(null);
    try {
      const saved = await saveField(result.updates);
      if (!saved) {
        setEvidenceWritebackError('Could not save evidence. Check the app logs for details.');
        return;
      }
      setEvidenceWritebackDraft('');
      errorNotificationService.showInfo(
        'Evidence saved',
        `Updated ${getWorkPacketEvidenceWritebackField(evidenceWritebackField)?.label ?? evidenceWritebackField}.`,
        { duration: 2500 },
      );
    } finally {
      setEvidenceWritebackSaving(false);
    }
  }, [evidenceWritebackDraft, evidenceWritebackField, item, saveField]);

  /** Debounced save for text fields */
  const debouncedSave = useCallback((updates: Record<string, any>) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      saveField(updates);
    }, 500);
  }, [saveField]);

  /** Debounced save for rich content.
   *
   * `guardEmpty` is a collab-mode safety rail: if the collaborative editor
   * mounts before the Y.Doc has been populated from the server, its initial
   * onDirtyChange may fire with an empty markdown and would otherwise
   * clobber the user's PGLite content. When true, an empty save is only
   * allowed if the baseline was already empty (i.e., new items or
   * intentional clears in collab mode require the user to make a real edit
   * after content has rendered). Local-only editing does not need this
   * guard -- its initialContent is fed synchronously, so onDirtyChange
   * only fires on real user edits. */
  const saveContent = useCallback((markdown: string, guardEmpty = false) => {
    if (guardEmpty) {
      const baseline = loadedBaselineRef.current;
      if (markdown.trim() === '' && baseline != null && baseline.trim() !== '') {
        console.warn(
          '[TrackerItemDetail] Skipping save: collab editor reported empty before server sync populated content.',
          { itemId: item?.id, baselineLen: baseline.length }
        );
        return;
      }
    }
    if (contentSaveTimerRef.current) clearTimeout(contentSaveTimerRef.current);
    contentSaveTimerRef.current = setTimeout(async () => {
      contentSaveTimerRef.current = null;
      // Update the baseline before the IPC round-trip. The main-process
      // updateTrackerItemContent path also broadcasts tracker-items-changed,
      // which races with the invoke result -- if the broadcast arrives first
      // and we haven't moved the baseline forward yet, the external-update
      // detector below would mistake our own echo for a remote change and
      // remount the editor mid-typing. On save failure the editor still
      // owns the live value and the next dirty event will retry, so a
      // briefly-optimistic baseline is safe.
      loadedBaselineRef.current = markdown;
      contentSaveInFlightRef.current = true;
      try {
        await window.electronAPI.documentService.updateTrackerItemContent({
          itemId: item!.id,
          content: markdown,
        });
      } catch (err) {
        console.error('[TrackerItemDetail] Failed to save content:', err);
      } finally {
        contentSaveInFlightRef.current = false;
      }
    }, 800);
  }, [item?.id]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (contentSaveTimerRef.current) clearTimeout(contentSaveTimerRef.current);
    };
  }, []);

  // Flush pending content save when item changes or component unmounts
  useEffect(() => {
    const isCollabMode = contentMode === 'collaborative';
    return () => {
      if (contentSaveTimerRef.current && getContentFnRef.current) {
        clearTimeout(contentSaveTimerRef.current);
        const markdown = getContentFnRef.current();
        if (isCollabMode) {
          const baseline = loadedBaselineRef.current;
          // Same collab-only data-loss guard as saveContent: don't let a
          // mount-time empty editor state win the unmount race.
          if (markdown.trim() === '' && baseline != null && baseline.trim() !== '') {
            return;
          }
        }
        // Fire-and-forget final save
        window.electronAPI.documentService.updateTrackerItemContent({
          itemId: item!.id,
          content: markdown,
        }).catch(() => {});
      }
    };
  }, [item?.id, contentMode]);

  /** Handle immediate field change (selects, checkboxes) */
  const handleImmediateFieldChange = useCallback((fieldName: string, value: any) => {
    if (item?.primaryType === 'work-packet' && fieldName === 'gate') {
      const transition = evaluateWorkPacketGateTransition(item, value);
      if (!transition.allowed) {
        errorNotificationService.showError(
          `Cannot move to ${transition.toGate} gate`,
          `Add required evidence first: ${transition.blockedReasons.join(', ')}`,
        );
        return;
      }
    }
    saveField({ [fieldName]: value });
  }, [item, saveField]);

  /** Handle debounced text field change */
  const handleTextFieldChange = useCallback((fieldName: string, value: any) => {
    if (fieldName === 'title') {
      setLocalTitle(value);
    } else if (fieldName === 'description') {
      setLocalDescription(value);
    } else {
      setLocalCustomFields(prev => ({ ...prev, [fieldName]: value }));
    }
    debouncedSave({ [fieldName]: value });
  }, [debouncedSave]);

  /** Open the source document in Files mode */
  const handleOpenDocument = useCallback(() => {
    if (!item?.system.documentPath) return;
    const documentService = (window as any).documentService;
    if (!documentService?.openDocument || !documentService?.getDocumentByPath) return;

    if (onSwitchToFilesMode) onSwitchToFilesMode();

    documentService.getDocumentByPath(item.system.documentPath).then((doc: any) => {
      if (doc) {
        documentService.openDocument(doc.id);
      }
    });
  }, [item?.system.documentPath, onSwitchToFilesMode]);

  const handleLinkExistingSession = useCallback(async (sessionId: string) => {
    if (!item) return;
    setLinkSessionError(null);
    setLinkingSessionId(sessionId);
    try {
      const trackerId = item.system.documentPath
        ? `file:${item.system.documentPath}`
        : item.id;
      const result = await window.electronAPI.invoke('tracker:link-session', {
        trackerId,
        sessionId,
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to link session');
      }
      await refreshSessionList();
      setIsLinkingExistingSession(false);
      setSessionSearchQuery('');
    } catch (err) {
      setLinkSessionError(err instanceof Error ? err.message : 'Failed to link session');
    } finally {
      setLinkingSessionId(null);
    }
  }, [item, refreshSessionList]);

  // Separate fields into categories for layout
  const { primaryFields, customFields } = useMemo(() => {
    if (!model) return { primaryFields: [] as FieldDefinition[], customFields: [] as FieldDefinition[] };

    const builtinNames = new Set(['title', 'description', 'created', 'updated']);
    // Resolve primary field names from schema roles instead of hardcoding
    const primaryNames = new Set<string>();
    for (const role of ['workflowStatus', 'priority', 'assignee', 'reporter', 'dueDate'] as const) {
      const fieldName = model.roles?.[role];
      if (fieldName) primaryNames.add(fieldName);
    }
    // Fallback conventional names when roles aren't declared
    if (primaryNames.size === 0) {
      for (const name of ['status', 'priority', 'owner', 'assigneeEmail', 'reporterEmail', 'dueDate']) {
        if (model.fields.some(f => f.name === name)) primaryNames.add(name);
      }
    }
    const primary: FieldDefinition[] = [];
    const custom: FieldDefinition[] = [];

    for (const field of model.fields) {
      if (builtinNames.has(field.name)) continue;
      if (primaryNames.has(field.name)) {
        primary.push(field);
      } else {
        custom.push(field);
      }
    }

    return { primaryFields: primary, customFields: custom };
  }, [model]);

  /** Get field value -- use in-progress local state for text fields, atom for select/etc */
  const getFieldValue = useCallback((fieldName: string): any => {
    if (!item) return undefined;
    // For text-like fields being edited, localCustomFields holds the in-progress value.
    // handleTextFieldChange stores owner (and other string fields) in localCustomFields,
    // so we must check it first to avoid resetting input on each keystroke.
    if (fieldName in localCustomFields) return localCustomFields[fieldName];
    // All fields are now in record.fields (schema-driven)
    return item.fields[fieldName];
  }, [item, localCustomFields]);

  /** Determine whether a field change should be immediate or debounced */
  const handleFieldChange = useCallback((field: FieldDefinition, value: any) => {
    const isTextLike = field.type === 'string' || field.type === 'text' || field.type === 'user';
    if (isTextLike) {
      handleTextFieldChange(field.name, value);
    } else {
      handleImmediateFieldChange(field.name, value);
    }
  }, [handleTextFieldChange, handleImmediateFieldChange]);

  /** Editor config for local PGLite mode (non-team native items only) */
  const localEditorConfig = useMemo((): EditorConfig | null => {
    if (contentMode !== 'local-pglite' || !contentLoaded) return null;
    return {
      isRichText: true,
      editable: true,
      showToolbar: false,
      isCodeHighlighted: true,
      hasLinkAttributes: true,
      markdownOnly: true,
      initialContent: contentMarkdown || '',
      onGetContent: (getContentFn: () => string) => {
        getContentFnRef.current = getContentFn;
      },
      onDirtyChange: (isDirty: boolean) => {
        if (isDirty && getContentFnRef.current) {
          const markdown = getContentFnRef.current();
          saveContent(markdown);
        }
      },
    };
  }, [contentMode, contentLoaded, contentMarkdown, saveContent]);

  /** Editor config for collaborative mode (team-synced native items) */
  const collabEditorConfig = useMemo((): EditorConfig | null => {
    if (contentMode !== 'collaborative' || !collabConfig || collabLoading) return null;
    if (!contentLoaded) return null;
    const mdContent = contentMarkdown;
    // Prefer the body-cache cold paint when the hook supplies it (the
    // `tracker_body_cache` row matching the current body_version). Fall
    // back to the per-item PGLite markdown for new items that have never
    // been saved (no cache row yet).
    const hookInitial = collabConfig.initialEditorState;
    // electron-log's renderer transport serializes only the first arg
    // as a string -- inline the diagnostic into the message itself so
    // a future cold-paint failure is debuggable from the log file.
    console.log(
      `[TrackerItemDetail] Building collab editor config itemId=${item?.id} shouldBootstrap=${collabConfig.shouldBootstrap} mdContentLen=${mdContent?.length ?? 0} hasHookInitial=${!!hookInitial}`,
    );
    return {
      isRichText: true,
      editable: true,
      showToolbar: false,
      isCodeHighlighted: true,
      hasLinkAttributes: true,
      markdownOnly: true,
      collaboration: {
        ...collabConfig,
        initialEditorState: hookInitial
          ?? (mdContent
            ? () => {
                console.log('[TrackerItemDetail] initialEditorState fn CALLED',
                  { itemId: item?.id, mdContentLen: mdContent.length });
                const root = $getRoot();
                root.clear();
                $convertFromEnhancedMarkdownString(mdContent, getEditorTransformers());
                console.log('[TrackerItemDetail] seeded editor root, children:', root.getChildrenSize());
              }
            : undefined),
      },
      onGetContent: (getContentFn: () => string) => {
        getContentFnRef.current = getContentFn;
      },
      onDirtyChange: (isDirty: boolean) => {
        if (isDirty && getContentFnRef.current) {
          const markdown = getContentFnRef.current();
          // guardEmpty=true: protect against the collab editor reporting
          // empty on mount before the Y.Doc sync has populated content.
          saveContent(markdown, true);
        }
      },
      onEditorReady: (editor: any) => {
        // Captured for the cold-paint fallback effect above. Without an
        // editor reference we cannot recover when CollaborationPlugin's
        // bootstrap check declines to fire `initialEditorState`.
        collabEditorInstanceRef.current = editor;
      },
    };
  }, [contentMode, collabConfig, collabLoading, contentLoaded, contentMarkdown, saveContent]);

  // Item deleted while panel was open (or not yet in atom — brief loading state)
  if (!item) {
    return (
      <div
        className="tracker-item-detail flex flex-col h-full bg-nim overflow-hidden items-center justify-center text-nim-faint text-sm"
        data-testid="tracker-item-detail"
      >
        Item no longer exists
      </div>
    );
  }

  const sourceLabel = getSourceLabel(item);

  return (
    <div
      className="tracker-item-detail flex flex-col h-full bg-nim overflow-hidden"
      data-testid="tracker-item-detail"
    >
      {/* Header */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-3 border-b border-nim shrink-0">
        <span className="mt-1 shrink-0" style={{ color: typeColor }}>
          <MaterialSymbol icon={icon} size={20} />
        </span>
        <div className="flex-1 min-w-0">
          {editable ? (
            <input
              type="text"
              value={localTitle}
              onChange={(e) => handleTextFieldChange('title', e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full bg-transparent border-none outline-none text-base font-semibold text-nim placeholder:text-nim-faint p-0"
              placeholder="条目标题..."
              data-testid="tracker-detail-title"
            />
          ) : (
            <h3 className="text-base font-semibold text-nim m-0 leading-snug">{getRecordTitle(item)}</h3>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{
                color: typeColor,
                backgroundColor: `${typeColor}20`,
              }}
            >
              {model?.displayName || item.primaryType}
            </span>
            {/* Secondary type tags */}
            {item.typeTags
              .filter(tag => tag !== item.primaryType)
              .map(tag => {
                const tagModel = globalRegistry.get(tag);
                const tagColor = TYPE_COLORS[tag] || '#6b7280';
                return (
                  <span
                    key={tag}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      color: tagColor,
                      backgroundColor: `${tagColor}15`,
                      border: `1px solid ${tagColor}30`,
                    }}
                  >
                    {tagModel?.displayName || tag}
                  </span>
                );
              })}
            {isNativeItem(item) && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5 bg-gray-500/[0.125] text-gray-400"
                title="Stored in database — not backed by a file"
                data-testid="tracker-source-db-badge"
              >
                <MaterialSymbol icon="storage" size={11} />
                Database
              </span>
            )}
            {(item.issueKey || item.id) && (
              <span className="text-[10px] text-nim-faint font-mono">{item.issueKey || item.id}</span>
            )}
            {item.archived && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#6b728020] text-nim-faint">
                Archived
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {teamOrgId && (
            <button
              className="p-1 rounded hover:bg-nim-tertiary text-nim-muted"
              onClick={handleCopyLink}
              title="Copy shareable link"
              data-testid="tracker-copy-link"
            >
              <MaterialSymbol icon="link" size={18} />
            </button>
          )}
          {onArchive && (
            <button
              className="p-1 rounded hover:bg-nim-tertiary text-nim-muted"
              onClick={() => onArchive(item.id, !item.archived)}
              title={item.archived ? 'Unarchive' : 'Archive'}
            >
              <MaterialSymbol icon={item.archived ? 'unarchive' : 'archive'} size={18} />

            </button>
          )}
          {onDelete && (
            <button
              className="p-1 rounded hover:bg-nim-tertiary text-nim-muted hover:text-[#ef4444]"
              onClick={() => {
                if (window.confirm(`Delete "${getRecordTitle(item)}"? This cannot be undone.`)) {
                  onDelete(item.id);
                }
              }}
              title="Delete permanently"
            >
              <MaterialSymbol icon="delete" size={18} />
            </button>
          )}
          <button
            className="p-1 rounded hover:bg-nim-tertiary text-nim-muted"
            onClick={onClose}
            title="Close (Esc)"
          >
            <MaterialSymbol icon="close" size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Primary fields grid (status, priority, owner) */}
        {primaryFields.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {primaryFields.map((field) => (
              <div key={field.name}>
                {editable ? (
                  <TrackerFieldEditor
                    field={field}
                    value={getFieldValue(field.name)}
                    onChange={(value) => handleFieldChange(field, value)}
                    teamMembers={teamMembers}
                  />
                ) : (
                  <ReadOnlyField
                    field={field}
                    value={getFieldValue(field.name)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Type tags editor (for native/editable items) */}
        {editable && (
          <TypeTagsEditor
            typeTags={item.typeTags}
            primaryType={item.primaryType}
            onUpdate={(newTags) => {
              // Save via IPC -- typeTags are stored in the DB column, not JSONB data
              window.electronAPI.documentService.updateTrackerItem({
                itemId: item.id,
                updates: { typeTags: newTags },
                syncMode,
              }).catch((err: any) => console.error('[TrackerItemDetail] Failed to save type tags:', err));
            }}
          />
        )}

        {item.primaryType === 'work-packet' && (
          <div className="space-y-2">
            <WorkPacketCapabilityPanel item={item} />
            <WorkPacketGateChecklist item={item} />
            <WorkPacketVisualEvidencePanel item={item} workspacePath={workspacePath} />
            <WorkPacketLaunchEvidencePanel
              evidence={workPacketLaunchEvidence}
              onSwitchToAgentMode={onSwitchToAgentMode}
            />
            <WorkPacketEvidenceWritebackPanel
              item={item}
              editable={editable}
              selectedField={evidenceWritebackField}
              draft={evidenceWritebackDraft}
              saving={evidenceWritebackSaving}
              error={evidenceWritebackError}
              onSelectedFieldChange={(fieldName) => {
                setEvidenceWritebackField(fieldName);
                setEvidenceWritebackError(null);
              }}
              onDraftChange={(value) => {
                setEvidenceWritebackDraft(value);
                setEvidenceWritebackError(null);
              }}
              onSave={() => void handleSaveEvidenceWriteback()}
            />
          </div>
        )}

        {/* Custom fields */}
        {customFields.length > 0 && (
          <div className="space-y-3 pt-1 border-t border-nim">
            {customFields.map((field) => (
              <div key={field.name}>
                {editable ? (
                  <TrackerFieldEditor
                    field={field}
                    value={getFieldValue(field.name)}
                    onChange={(value) => handleFieldChange(field, value)}
                    teamMembers={teamMembers}
                  />
                ) : (
                  <ReadOnlyField
                    field={field}
                    value={getFieldValue(field.name)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Rich Content Editor / Description */}
        <div className="pt-1 border-t border-nim">
          <label className="text-[11px] font-medium text-nim-muted uppercase tracking-[0.5px] block mb-1">
            Content
          </label>
          {contentMode === 'local-pglite' && localEditorConfig ? (
            <div
              className="tracker-content-editor border border-nim rounded bg-nim min-h-[200px] overflow-hidden"
              data-testid="tracker-detail-content-editor"
            >
              <NimbalystEditor key={`${item.id}-${externalContentEpoch}`} config={localEditorConfig} />
            </div>
          ) : contentMode === 'collaborative' && collabEditorConfig ? (
            <div
              className="tracker-content-editor relative border border-nim rounded bg-nim min-h-[200px] overflow-hidden"
              data-testid="tracker-detail-content-editor"
            >
              {!hasSyncedOnce && (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-nim"
                  data-testid="tracker-content-loading"
                >
                  <span className="text-sm text-nim-muted">Loading content...</span>
                </div>
              )}
              {reviewState?.hasUnreviewed && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-nim bg-nim-tertiary"
                  data-testid="tracker-content-review-banner"
                >
                  <MaterialSymbol icon="rate_review" size={14} className="text-nim-warning" />
                  <span className="flex-1 text-nim-muted">
                    {reviewState.unreviewedCount} pending change{reviewState.unreviewedCount !== 1 ? 's' : ''} from{' '}
                    {reviewState.unreviewedAuthors.length > 0
                      ? reviewState.unreviewedAuthors.join(', ')
                      : 'collaborators'}
                  </span>
                  <button
                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                    onClick={acceptRemoteChanges}
                  >
                    Accept
                  </button>
                  <button
                    className="px-2 py-0.5 rounded text-[11px] font-medium text-nim-muted hover:text-nim hover:bg-nim-tertiary border border-nim transition-colors"
                    onClick={rejectRemoteChanges}
                  >
                    Reject
                  </button>
                </div>
              )}
              <NimbalystEditor key={`collab-${item.id}-${providerEpoch}`} config={collabEditorConfig} />
            </div>
          ) : (contentMode === 'local-pglite' || contentMode === 'collaborative') && !contentLoaded ? (
            <div className="text-sm text-nim-faint py-4 text-center">Loading...</div>
          ) : contentMode === 'collaborative' && collabLoading ? (
            <div className="text-sm text-nim-faint py-4 text-center">Connecting...</div>
          ) : item.system.documentPath ? (
            <div className="flex items-center gap-2 py-2">
              <span className="text-sm text-nim-muted flex-1 truncate font-mono">
                {item.system.documentPath}
              </span>
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-nim text-nim-muted hover:text-nim hover:bg-nim-tertiary transition-colors"
                onClick={handleOpenDocument}
              >
                <MaterialSymbol icon="open_in_new" size={14} />
                Open in Editor
              </button>
            </div>
          ) : (
            <p className="text-sm text-nim-faint m-0">No content</p>
          )}
        </div>

        {/* Linked Sessions */}
        {(linkedSessions.length > 0 || onLaunchSession || onLaunchWorktreeSession || canLinkExistingSession || isLinkingExistingSession) && (
          <div className="pt-1 border-t border-nim">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-nim-muted uppercase tracking-[0.5px]">
                Sessions{linkedSessions.length > 0 ? ` (${linkedSessions.length})` : ''}
              </label>
              <div className="flex items-center gap-1">
                {canLinkExistingSession && (
                  <button
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded text-nim-muted hover:text-nim hover:bg-nim-tertiary transition-colors"
                    onClick={() => {
                      setLinkSessionError(null);
                      setSessionSearchQuery('');
                      void refreshSessionList();
                      setIsLinkingExistingSession((prev) => !prev);
                    }}
                    title="Link an existing AI session to this item"
                  >
                    <MaterialSymbol icon="link" size={14} />
                    {isLinkingExistingSession ? 'Cancel' : 'Link Existing'}
                  </button>
                )}
                {onAutoImplement && (
                  <button
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded text-nim-accent hover:bg-nim-tertiary transition-colors"
                    onClick={() => onAutoImplement(item.id)}
                    title="自动开一个隔离 worktree 并派 agent 实现这个任务（受并发上限与优先级调度）"
                  >
                    <MaterialSymbol icon="auto_awesome" size={14} />
                    自动实现
                  </button>
                )}
                {onLaunchSession && (
                  <button
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded text-nim-muted hover:text-nim hover:bg-nim-tertiary transition-colors"
                    onClick={() => onLaunchSession(item.id)}
                    title="Launch a new AI session for this item"
                  >
                    <MaterialSymbol icon="add" size={14} />
                    Launch Session
                  </button>
                )}
                {worktreeLaunchRecommended && onLaunchWorktreeSession && (
                  <button
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded text-nim-muted hover:text-nim hover:bg-nim-tertiary transition-colors"
                    onClick={() => onLaunchWorktreeSession(item.id)}
                    title="Launch a new worktree session for this Work Packet"
                  >
                    <MaterialSymbol icon="account_tree" size={14} />
                    Launch Worktree
                  </button>
                )}
              </div>
            </div>
            {isLinkingExistingSession && (
              <div className="tracker-session-linker mb-2 rounded border border-nim bg-nim-tertiary p-2">
                <input
                  className="w-full rounded border border-nim bg-nim px-2 py-1.5 text-xs text-nim outline-none focus:border-nim-focus"
                  type="text"
                  value={sessionSearchQuery}
                  onChange={(e) => setSessionSearchQuery(e.target.value)}
                  placeholder={`Search ${availableSessions.length} existing session${availableSessions.length === 1 ? '' : 's'}`}
                />
                <div className="mt-2 space-y-1">
                  {filteredAvailableSessions.length > 0 ? (
                    filteredAvailableSessions.map((session) => (
                      <button
                        key={session.id}
                        className="tracker-session-linker-option w-full rounded px-2 py-1.5 text-left hover:bg-nim-hover transition-colors disabled:opacity-60"
                        onClick={() => handleLinkExistingSession(session.id)}
                        disabled={linkingSessionId !== null}
                        title={`Link session: ${session.title || 'Untitled session'}`}
                      >
                        <div className="flex items-center gap-2">
                          <ProviderIcon provider={session.provider || 'claude'} size={14} />
                          <span className="flex-1 truncate text-xs text-nim">
                            {session.title || 'Untitled session'}
                          </span>
                          <span className="shrink-0 text-[10px] text-nim-faint">
                            {linkingSessionId === session.id ? 'Linking...' : getRelativeTimeString(session.updatedAt)}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="m-0 text-[11px] text-nim-faint">
                      {availableSessions.length === 0
                        ? 'No unlinked sessions available.'
                        : 'No sessions match that search.'}
                    </p>
                  )}
                </div>
                {linkSessionError && (
                  <p className="mt-2 mb-0 text-[11px] text-nim-error">{linkSessionError}</p>
                )}
              </div>
            )}
            {linkedSessions.length > 0 ? (
              <div className="space-y-1">
                {linkedSessions.map((session) => (
                  <button
                    key={session.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-nim-tertiary transition-colors group"
                    onClick={() => onSwitchToAgentMode?.(session.id)}
                    title={`Open session: ${session.title}`}
                  >
                    <ProviderIcon provider={session.provider || 'claude'} size={14} />
                    <span className="flex-1 text-xs text-nim truncate">
                      {session.title || 'Untitled session'}
                    </span>
                    <span className="text-[10px] text-nim-faint shrink-0">
                      {getRelativeTimeString(session.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-nim-faint m-0">No linked sessions</p>
            )}
          </div>
        )}

        {/* Linked Commits */}
        {item.system.linkedCommits && item.system.linkedCommits.length > 0 && (
          <div className="pt-1 border-t border-nim">
            <label className="text-[11px] font-medium text-nim-muted uppercase tracking-[0.5px] mb-1.5 block">
              Commits ({item.system.linkedCommits.length})
            </label>
            <div className="space-y-1">
              {item.system.linkedCommits.slice().reverse().map((commit: { sha: string; message: string; sessionId?: string; timestamp: string }) => (
                <div
                  key={commit.sha}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-nim-tertiary transition-colors group"
                >
                  <button
                    className="text-[11px] font-mono text-nim-primary hover:underline shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(commit.sha);
                    }}
                    title={`Copy full SHA: ${commit.sha}`}
                  >
                    {commit.sha.slice(0, 7)}
                  </button>
                  <span className="flex-1 text-xs text-nim truncate" title={commit.message}>
                    {commit.message}
                  </span>
                  {commit.sessionId && (
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onSwitchToAgentMode?.(commit.sessionId!)}
                      title="Open linked session"
                    >
                      <MaterialSymbol icon="smart_toy" size={14} className="text-nim-faint" />
                    </button>
                  )}
                  <span className="text-[10px] text-nim-faint shrink-0">
                    {getRelativeTimeString(new Date(commit.timestamp).getTime())}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments section */}
        {item.source !== 'inline' && item.source !== 'frontmatter' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-nim-muted uppercase tracking-wide">Comments</h4>
            </div>
            <CommentsSection itemId={item.id} comments={item.system.comments} />
          </div>
        )}

        {/* Activity log */}
        {item.system.activity && item.system.activity.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-nim-muted uppercase tracking-wide">Activity</h4>
            <div className="space-y-1">
              {item.system.activity.slice(-10).reverse().map((entry: any) => (
                <div key={entry.id} className="flex items-start gap-2 text-[11px]">
                  <span className="text-nim-muted shrink-0">{entry.authorIdentity?.displayName || 'Unknown'}</span>
                  <span className="text-nim-faint">
                    {entry.action === 'created' ? 'created this item' :
                     entry.action === 'commented' ? 'added a comment' :
                     entry.action === 'status_changed' ? `changed status to ${entry.newValue}` :
                     entry.action === 'archived' ? (entry.newValue === 'true' ? 'archived' : 'unarchived') :
                     entry.field ? `updated ${entry.field}` : entry.action}
                  </span>
                  <span className="text-nim-faint ml-auto shrink-0">{getRelativeTimeString(entry.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata footer */}
        <div className="pt-1 border-t border-nim">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {/* Author identity */}
            {item.system.authorIdentity && (
              <div className="col-span-2 flex items-center gap-1.5">
                <span className="text-nim-faint shrink-0">Created by</span>
                <UserAvatar identity={item.system.authorIdentity} showName size={16} />
                {item.system.createdByAgent && (
                  <span className="text-[10px] text-nim-faint bg-nim-tertiary px-1 py-0.5 rounded">via AI</span>
                )}
              </div>
            )}
            {/* Last modifier */}
            {item.system.lastModifiedBy && item.system.lastModifiedBy.displayName !== item.system.authorIdentity?.displayName && (
              <div className="col-span-2 flex items-center gap-1.5">
                <span className="text-nim-faint shrink-0">Modified by</span>
                <UserAvatar identity={item.system.lastModifiedBy} showName size={16} />
              </div>
            )}
            <div>
              <span className="text-nim-faint">Created</span>
              <div className="text-nim-muted">{formatTimestamp(item.system.createdAt)}</div>
            </div>
            <div>
              <span className="text-nim-faint">Updated</span>
              <div className="text-nim-muted">{formatTimestamp(item.system.updatedAt || item.system.lastIndexed)}</div>
            </div>
            {item.issueKey && (
              <div>
                <span className="text-nim-faint">Key</span>
                <div className="text-nim-muted font-mono">{item.issueKey}</div>
              </div>
            )}
            {item.syncStatus && (
              <div>
                <span className="text-nim-faint">Sync</span>
                <div className="text-nim-muted">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: item.syncStatus === 'synced' ? '#22c55e20' : item.syncStatus === 'pending' ? '#eab30820' : '#6b728020',
                      color: item.syncStatus === 'synced' ? '#22c55e' : item.syncStatus === 'pending' ? '#eab308' : '#6b7280',
                    }}
                  >
                    {item.syncStatus}
                  </span>
                </div>
              </div>
            )}
            {sourceLabel && (
              <div className="col-span-2">
                <span className="text-nim-faint">Source</span>
                <div className="text-nim-muted truncate">{sourceLabel}</div>
              </div>
            )}
            {item.system.documentPath && !sourceLabel && (
              <div className="col-span-2">
                <span className="text-nim-faint">Source</span>
                <div className="text-nim-muted font-mono truncate">{item.system.documentPath}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Read-only field display for non-editable items (e.g. inline items) */
const ReadOnlyField: React.FC<{ field: FieldDefinition; value: any }> = ({ field, value }) => {
  const label = field.name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();

  let displayValue: string;
  if (value == null || value === '') {
    displayValue = '\u2014';
  } else if (Array.isArray(value)) {
    displayValue = value.join(', ') || '\u2014';
  } else if (value instanceof Date) {
    displayValue = value.toLocaleDateString();
  } else if (typeof value === 'boolean') {
    displayValue = value ? 'Yes' : 'No';
  } else if (typeof value === 'object') {
    // Safety: format objects as JSON rather than [object Object]
    displayValue = JSON.stringify(value);
  } else {
    displayValue = String(value);
  }

  // For select fields, show the label not the raw value
  if (field.type === 'select' && field.options && value) {
    const option = field.options.find(o => o.value === value);
    if (option) {
      const color = option.color || STATUS_COLORS[value] || PRIORITY_COLORS[value] || '#6b7280';
      return (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[var(--nim-text-muted)] uppercase tracking-[0.5px]">{label}</span>
          <span
            className="inline-block self-start px-2 py-0.5 rounded-[10px] text-[11px] font-medium border"
            style={{
              backgroundColor: `${color}20`,
              color,
              borderColor: color,
            }}
          >
            {option.label}
          </span>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-[var(--nim-text-muted)] uppercase tracking-[0.5px]">{label}</span>
      <span className="text-[13px] text-[var(--nim-text)]">{displayValue}</span>
    </div>
  );
};

/** Inline comments section for tracker items */
const CommentsSection: React.FC<{ itemId: string; comments?: any[] }> = ({ itemId, comments }) => {
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Optimistic comments shown immediately on submit, before the atom round-trips
  const [optimisticComments, setOptimisticComments] = useState<any[]>([]);

  // When server-side comments arrive (atom update), clear optimistic entries
  // that are now present in the real data.
  const serverComments = (comments || []).filter((c: any) => !c.deleted);
  const visibleComments = useMemo(() => {
    if (optimisticComments.length === 0) return serverComments;
    // Keep only optimistic comments whose body isn't yet in the server list
    // (simple dedup -- optimistic entries don't have real IDs)
    const serverBodies = new Set(serverComments.map((c: any) => c.body));
    const stillPending = optimisticComments.filter(c => !serverBodies.has(c.body));
    if (stillPending.length < optimisticComments.length) {
      // Some optimistic comments were confirmed -- schedule cleanup
      // Use queueMicrotask to avoid setState during render
      queueMicrotask(() => setOptimisticComments(stillPending));
    }
    return [...serverComments, ...stillPending];
  }, [serverComments, optimisticComments]);

  const handleSubmit = useCallback(async () => {
    if (!newComment.trim() || submitting) return;
    const body = newComment.trim();
    setSubmitting(true);
    // Optimistically show the comment immediately
    setOptimisticComments(prev => [...prev, {
      id: `optimistic_${Date.now()}`,
      body,
      createdAt: Date.now(),
      updatedAt: null,
      deleted: false,
      _optimistic: true,
    }]);
    setNewComment('');
    try {
      await window.electronAPI.invoke('document-service:tracker-item-add-comment', {
        itemId,
        body,
      });
    } catch (err) {
      console.error('Failed to add comment:', err);
      // Remove the optimistic comment on failure
      setOptimisticComments(prev => prev.filter(c => c.body !== body));
    } finally {
      setSubmitting(false);
    }
  }, [itemId, newComment, submitting]);

  return (
    <div className="space-y-2">
      {visibleComments.map((comment: any) => (
        <div key={comment.id} className={`rounded bg-nim-tertiary p-2 space-y-1${comment._optimistic ? ' opacity-70' : ''}`}>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-medium text-nim-muted">{comment.authorIdentity?.displayName || 'You'}</span>
            <span className="text-nim-faint">{getRelativeTimeString(comment.createdAt)}</span>
            {comment.updatedAt && <span className="text-nim-faint">(edited)</span>}
          </div>
          <p className="text-xs text-nim m-0 whitespace-pre-wrap">{comment.body}</p>
        </div>
      ))}
      <div className="flex gap-1">
        <input
          type="text"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="添加评论..."
          className="flex-1 bg-nim-secondary border border-nim rounded px-2 py-1 text-xs text-nim placeholder:text-nim-faint outline-none focus:border-nim-primary"
        />
        <button
          onClick={handleSubmit}
          disabled={!newComment.trim() || submitting}
          className="px-2 py-1 rounded text-xs bg-nim-primary text-nim-on-primary disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Post
        </button>
      </div>
    </div>
  );
};
