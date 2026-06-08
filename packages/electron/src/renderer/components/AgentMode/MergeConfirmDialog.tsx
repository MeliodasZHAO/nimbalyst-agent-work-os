import React, { useEffect, useRef } from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { getWorktreeNameFromPath } from '../../utils/pathUtils';

interface MergeConfirmDialogProps {
  worktreePath: string;
  workspacePath: string;
  hasUncommittedChanges: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function getWorktreeName(worktreePath: string): string {
  return getWorktreeNameFromPath(worktreePath, 'worktree');
}

function getProjectName(workspacePath: string): string {
  return getWorktreeNameFromPath(workspacePath, 'main');
}

export function MergeConfirmDialog({
  worktreePath,
  workspacePath,
  hasUncommittedChanges,
  onConfirm,
  onCancel,
}: MergeConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Focus trap
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const worktreeName = getWorktreeName(worktreePath);
  const projectName = getProjectName(workspacePath);

  return (
    <div className="merge-confirm-dialog-overlay nim-overlay" onClick={onCancel}>
      <div
        className="merge-confirm-dialog nim-modal w-full max-w-[440px] outline-none"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="merge-confirm-dialog-header flex items-center gap-3 px-6 pt-5 pb-4 text-[var(--nim-text)]">
          <MaterialSymbol icon="merge" size={24} />
          <h2 className="m-0 text-lg font-semibold">合并到主分支</h2>
        </div>

        <div className="merge-confirm-dialog-body px-6 pb-5">
          <p className="m-0 mb-4 text-sm leading-relaxed text-[var(--nim-text-muted)]">
            确定要将 <strong className="font-medium text-[var(--nim-text)]">{worktreeName}</strong> 合并到 <strong className="font-medium text-[var(--nim-text)]">{projectName}</strong> 的主分支吗？
          </p>

          {hasUncommittedChanges && (
            <div className="merge-confirm-dialog-info-banner flex items-start gap-2.5 p-3 mb-4 rounded-lg text-[0.8125rem] leading-snug bg-[var(--nim-info)]/10 text-[var(--nim-text-muted)]">
              <MaterialSymbol icon="info" size={18} className="text-[var(--nim-info)]" />
              <span>
                未提交的更改将被保留，只有已提交的工作会被合并。
              </span>
            </div>
          )}

          <div className="merge-confirm-dialog-info flex flex-col gap-2 p-3 rounded-lg bg-[var(--nim-bg-secondary)]">
            <div className="merge-confirm-dialog-info-row flex items-center gap-2 text-[0.8125rem]">
              <span className="merge-confirm-dialog-info-label min-w-[60px] text-[var(--nim-text-faint)]">来源:</span>
              <span className="merge-confirm-dialog-info-value font-mono text-[var(--nim-text)]">{worktreeName}</span>
            </div>
            <div className="merge-confirm-dialog-info-row flex items-center gap-2 text-[0.8125rem]">
              <span className="merge-confirm-dialog-info-label min-w-[60px] text-[var(--nim-text-faint)]">目标:</span>
              <span className="merge-confirm-dialog-info-value font-mono text-[var(--nim-text)]">main ({projectName})</span>
            </div>
          </div>
        </div>

        <div className="merge-confirm-dialog-footer flex justify-end gap-2 px-6 pt-4 pb-5 border-t border-[var(--nim-border)]">
          <button
            type="button"
            className="merge-confirm-dialog-button nim-btn-secondary text-sm"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="merge-confirm-dialog-button nim-btn-primary text-sm"
            onClick={onConfirm}
          >
            <MaterialSymbol icon="merge" size={16} />
            <span>合并</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default MergeConfirmDialog;
