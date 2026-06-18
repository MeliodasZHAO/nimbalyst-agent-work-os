import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { previewStateAtomFamily, type PreviewStatus } from '../../store/atoms/worktrees';

interface WorktreePreviewControlsProps {
  worktreeId: string;
  worktreePath: string;
}

const STATUS_DOT: Record<PreviewStatus, string> = {
  starting: 'bg-amber-400 animate-pulse',
  running: 'bg-green-500',
  stopped: 'bg-[var(--nim-text-faint)]',
  crashed: 'bg-red-500',
};

/**
 * Per-worktree dev-server preview control, mounted in the agent session header.
 *
 * Shows the live status dot + assigned port + optional name, and lets the user
 * start/stop the dev server and open its page in an in-app iframe (or external
 * browser). The port is stable per worktree (assigned by the main-process
 * PreviewServerManager), so the user always knows which port maps to which
 * worktree.
 */
export const WorktreePreviewControls: React.FC<WorktreePreviewControlsProps> = ({
  worktreeId,
  worktreePath,
}) => {
  const { t } = useTranslation('agent');
  const state = useAtomValue(previewStateAtomFamily(worktreeId));
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const status = state?.status ?? 'stopped';
  const isLive = status === 'running' || status === 'starting';

  const handleToggle = useCallback(async () => {
    setBusy(true);
    try {
      if (isLive) {
        await window.electronAPI.previewStop(worktreeId);
      } else {
        await window.electronAPI.previewStart(worktreeId, worktreePath);
      }
    } finally {
      setBusy(false);
    }
  }, [isLive, worktreeId, worktreePath]);

  const handleOpen = useCallback(() => {
    if (status === 'running') setShowPreview(true);
  }, [status]);

  const handleOpenExternal = useCallback(() => {
    if (state?.url) window.electronAPI.openExternal(state.url);
  }, [state?.url]);

  const submitName = useCallback(async () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== state?.name) {
      await window.electronAPI.previewSetName(worktreeId, trimmed);
    }
  }, [nameDraft, state?.name, worktreeId]);

  const statusLabel =
    status === 'running'
      ? t('previewRunning')
      : status === 'starting'
        ? t('previewStarting')
        : status === 'crashed'
          ? t('previewCrashed')
          : t('previewStopped');

  return (
    <div className="worktree-preview-controls shrink-0 flex items-center gap-1.5">
      {/* Status + port chip (only meaningful once a port is assigned) */}
      {state && (
        <button
          type="button"
          className="worktree-preview-chip flex items-center gap-1.5 px-2 h-7 rounded-md bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[0.6875rem] text-[var(--nim-text-muted)] cursor-pointer hover:bg-[var(--nim-bg-hover)]"
          title={`${statusLabel} · ${t('previewPort')} ${state.port}`}
          onClick={status === 'running' ? handleOpen : handleToggle}
        >
          <span className={`worktree-preview-dot w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
          {editingName ? (
            <input
              autoFocus
              className="worktree-preview-name-input w-24 bg-transparent border-none outline-none text-[var(--nim-text)] text-[0.6875rem]"
              value={nameDraft}
              placeholder={t('previewNamePlaceholder')}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={submitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="worktree-preview-name font-medium text-[var(--nim-text)]"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setNameDraft(state.name ?? '');
                setEditingName(true);
              }}
            >
              {state.name || `:${state.port}`}
            </span>
          )}
          {state.name && (
            <span className="worktree-preview-port text-[var(--nim-text-faint)]">:{state.port}</span>
          )}
        </button>
      )}

      {/* Start / Stop */}
      <button
        type="button"
        className="worktree-preview-toggle shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-none text-[var(--nim-text-faint)] cursor-pointer transition-colors duration-150 hover:text-[var(--nim-text)] hover:bg-[var(--nim-bg-hover)] disabled:opacity-40 disabled:cursor-default"
        title={isLive ? t('previewStop') : t('previewStart')}
        disabled={busy}
        onClick={handleToggle}
      >
        <MaterialSymbol icon={isLive ? 'stop_circle' : 'play_circle'} size={18} />
      </button>

      {/* Open preview (in-app) */}
      {status === 'running' && (
        <button
          type="button"
          className="worktree-preview-open shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-none text-[var(--nim-text-faint)] cursor-pointer transition-colors duration-150 hover:text-[var(--nim-text)] hover:bg-[var(--nim-bg-hover)]"
          title={t('previewOpen')}
          onClick={handleOpen}
        >
          <MaterialSymbol icon="open_in_full" size={16} />
        </button>
      )}

      {showPreview && state && (
        <PreviewModal
          url={state.url}
          title={state.name || `:${state.port}`}
          onClose={() => setShowPreview(false)}
          onOpenExternal={handleOpenExternal}
          externalHint={t('previewExternalHint')}
          openExternalLabel={t('previewOpenExternal')}
        />
      )}
    </div>
  );
};

interface PreviewModalProps {
  url: string;
  title: string;
  onClose: () => void;
  onOpenExternal: () => void;
  externalHint: string;
  openExternalLabel: string;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  url,
  title,
  onClose,
  onOpenExternal,
  externalHint,
  openExternalLabel,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="worktree-preview-modal-overlay fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="worktree-preview-modal flex flex-col w-[80vw] h-[80vh] rounded-lg overflow-hidden bg-[var(--nim-bg)] border border-[var(--nim-border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="worktree-preview-modal-header shrink-0 flex items-center gap-2 px-3 h-10 border-b border-[var(--nim-border)] bg-[var(--nim-bg-secondary)]">
          <span className="flex-1 min-w-0 text-xs font-medium text-[var(--nim-text)] truncate">
            {title} — {url}
          </span>
          <button
            type="button"
            className="flex items-center gap-1 px-2 h-7 rounded-md text-[0.6875rem] text-[var(--nim-text-muted)] hover:text-[var(--nim-text)] hover:bg-[var(--nim-bg-hover)]"
            title={externalHint}
            onClick={onOpenExternal}
          >
            <MaterialSymbol icon="open_in_new" size={14} />
            {openExternalLabel}
          </button>
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--nim-text-faint)] hover:text-[var(--nim-text)] hover:bg-[var(--nim-bg-hover)]"
            onClick={onClose}
          >
            <MaterialSymbol icon="close" size={16} />
          </button>
        </div>
        <iframe
          className="worktree-preview-iframe flex-1 w-full border-none bg-white"
          src={url}
          title={title}
        />
      </div>
    </div>
  );
};
