import React, { useEffect, useRef } from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';

interface ArchiveBlitzDialogProps {
  blitzName: string;
  worktreeName: string;
  onArchiveBlitz: () => void;
  onArchiveWorktreeOnly: () => void;
  onKeep: () => void;
}

export function ArchiveBlitzDialog({
  blitzName,
  worktreeName,
  onArchiveBlitz,
  onArchiveWorktreeOnly,
  onKeep,
}: ArchiveBlitzDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onKeep();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onKeep]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="archive-worktree-dialog-overlay nim-overlay"
      onClick={onKeep}
    >
      <div
        className="archive-worktree-dialog w-full max-w-[440px] rounded-xl outline-none bg-[var(--nim-bg)] shadow-[0_8px_32px_rgba(0,0,0,0.24)]"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="archive-worktree-dialog-header flex items-center gap-3 px-6 pt-5 pb-4 text-[var(--nim-text)]">
          <MaterialSymbol icon="archive" size={24} />
          <h2 className="m-0 text-lg font-semibold">合并成功</h2>
        </div>

        <div className="archive-worktree-dialog-body px-6 pb-5">
          <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-[var(--nim-success)]/10 border border-[var(--nim-success)]/30">
            <MaterialSymbol icon="check_circle" size={20} className="text-[var(--nim-success)] shrink-0 mt-0.5" />
            <p className="m-0 text-sm text-[var(--nim-text-muted)]">
              来自 <strong className="font-medium text-[var(--nim-text)]">{worktreeName}</strong> 的更改已成功合并。
            </p>
          </div>

          <p className="mb-4 text-sm leading-relaxed text-[var(--nim-text-muted)]">
            此 Worktree 属于 Blitz{' '}
            <strong className="font-medium text-[var(--nim-text)]">{blitzName}</strong>。
            您想归档整个 Blitz 还是仅归档此 Worktree？
          </p>
        </div>

        <div className="archive-worktree-dialog-footer flex justify-end gap-2 px-6 pt-4 pb-5 border-t border-[var(--nim-border)]">
          <button
            type="button"
            className="nim-btn-secondary"
            onClick={onKeep}
          >
            全部保留
          </button>
          <button
            type="button"
            className="nim-btn-secondary"
            onClick={onArchiveWorktreeOnly}
          >
            <MaterialSymbol icon="archive" size={16} />
            <span>仅归档 Worktree</span>
          </button>
          <button
            type="button"
            className="nim-btn-primary"
            onClick={onArchiveBlitz}
          >
            <MaterialSymbol icon="archive" size={16} />
            <span>归档 Blitz</span>
          </button>
        </div>
      </div>
    </div>
  );
}
