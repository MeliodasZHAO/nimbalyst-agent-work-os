import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';

type MergePhase = 'configure' | 'merging' | 'result';

interface MergeTask {
  sessionId: string;
  title: string;
  worktreeId: string;
  worktreeBranch?: string;
}

interface DispatchMergeDialogProps {
  dispatchId: string;
  tasks: MergeTask[];
  workspacePath: string;
  onClose: () => void;
}

export function DispatchMergeDialog({ dispatchId, tasks, workspacePath, onClose }: DispatchMergeDialogProps) {
  const [phase, setPhase] = useState<MergePhase>('configure');
  const [branchName, setBranchName] = useState(() => {
    const slug = `dispatch-merge-${Date.now().toString(36)}`;
    return slug;
  });
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergeResult, setMergeResult] = useState<any>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'merging') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, phase]);

  useEffect(() => {
    if (phase === 'configure' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [phase]);

  const handleMerge = useCallback(async () => {
    if (!branchName.trim()) return;
    setPhase('merging');
    setMergeProgress(0);

    try {
      const result = await window.electronAPI.invoke('agent-work-os:dispatch-selective-merge', {
        dispatchId,
        selectedWorktreeIds: tasks.map(t => t.worktreeId),
        newBranchName: branchName.trim(),
        workspacePath,
      });
      setMergeResult(result);
      setPhase('result');
    } catch (error) {
      setMergeResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      setPhase('result');
    }
  }, [dispatchId, tasks, branchName, workspacePath]);

  const handleCreatePR = useCallback(async () => {
    if (!mergeResult?.branchName) return;
    try {
      await window.electronAPI.invoke('terminal:run-command', {
        command: `gh pr create --head ${mergeResult.branchName} --fill`,
        workspacePath,
      });
    } catch {
      // Fallback: copy branch name
    }
  }, [mergeResult, workspacePath]);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        className="dispatch-merge-dialog bg-[var(--nim-bg)] border border-[var(--nim-border)] rounded-lg shadow-2xl w-[480px] max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--nim-border)]">
          <MaterialSymbol icon="merge" size={18} className="text-purple-400" />
          <span className="text-sm font-medium text-[var(--nim-text)]">
            {phase === 'configure' && 'Merge Selected Tasks'}
            {phase === 'merging' && 'Merging...'}
            {phase === 'result' && (mergeResult?.success ? 'Merge Complete' : 'Merge Failed')}
          </span>
          {phase !== 'merging' && (
            <button
              className="ml-auto p-1 rounded hover:bg-[var(--nim-bg-hover)] text-[var(--nim-text-faint)]"
              onClick={onClose}
            >
              <MaterialSymbol icon="close" size={16} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {phase === 'configure' && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-xs text-[var(--nim-text-faint)] mb-2">
                  {tasks.length} task{tasks.length !== 1 ? 's' : ''} selected
                </div>
                <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                  {tasks.map(t => (
                    <div key={t.sessionId} className="flex items-center gap-2 text-xs text-[var(--nim-text-muted)] py-1 px-2 rounded bg-[var(--nim-bg-secondary)]">
                      <MaterialSymbol icon="task_alt" size={12} className="text-green-400 shrink-0" />
                      <span className="flex-1 truncate">{t.title}</span>
                      {t.worktreeBranch && (
                        <span className="text-[10px] font-mono text-[var(--nim-text-faint)] shrink-0">{t.worktreeBranch}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--nim-text-faint)] mb-1">Branch name</label>
                <input
                  ref={inputRef}
                  type="text"
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleMerge(); }}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] rounded text-[var(--nim-text)] placeholder:text-[var(--nim-text-faint)] focus:outline-none focus:border-[var(--nim-primary)]"
                  placeholder="dispatch/feature-name/merge"
                />
              </div>
            </div>
          )}

          {phase === 'merging' && (
            <div className="flex flex-col gap-3 items-center py-6">
              <MaterialSymbol icon="progress_activity" size={32} className="text-purple-400 animate-spin" />
              <div className="text-xs text-[var(--nim-text-muted)]">
                Merging {tasks.length} worktree branches...
              </div>
            </div>
          )}

          {phase === 'result' && mergeResult && (
            <div className="flex flex-col gap-3">
              {mergeResult.success ? (
                <>
                  <div className="flex items-center gap-2 text-green-400">
                    <MaterialSymbol icon="check_circle" size={20} />
                    <span className="text-sm font-medium">Merged {mergeResult.mergedCount} tasks ({mergeResult.commitCount} commits)</span>
                  </div>
                  <div className="text-xs text-[var(--nim-text-muted)]">
                    Branch: <span className="font-mono text-[var(--nim-text)]">{mergeResult.branchName}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-red-400">
                    <MaterialSymbol icon="error" size={20} />
                    <span className="text-sm font-medium">
                      {mergeResult.conflictedWorktree
                        ? `Conflict in ${mergeResult.conflictedWorktree}`
                        : 'Merge failed'}
                    </span>
                  </div>
                  {mergeResult.mergedCount > 0 && (
                    <div className="text-xs text-[var(--nim-text-muted)]">
                      Merged {mergeResult.mergedCount} of {mergeResult.totalCount} before conflict.
                    </div>
                  )}
                  {mergeResult.conflictedFiles?.length > 0 && (
                    <div className="text-xs text-[var(--nim-text-faint)]">
                      Conflicted files:
                      <ul className="mt-1 ml-4 list-disc">
                        {mergeResult.conflictedFiles.map((f: string) => (
                          <li key={f} className="font-mono">{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {mergeResult.error && (
                    <div className="text-xs text-red-400/80 mt-1">{mergeResult.error}</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--nim-border)]">
          {phase === 'configure' && (
            <>
              <button
                className="px-3 py-1.5 text-xs rounded border border-[var(--nim-border)] text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-hover)] cursor-pointer"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded font-medium border border-purple-400/40 text-purple-400 bg-purple-400/[0.08] hover:bg-purple-400/[0.15] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleMerge}
                disabled={!branchName.trim()}
              >
                Merge to Branch
              </button>
            </>
          )}
          {phase === 'result' && (
            <>
              <button
                className="px-3 py-1.5 text-xs rounded border border-[var(--nim-border)] text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-hover)] cursor-pointer"
                onClick={onClose}
              >
                Close
              </button>
              {mergeResult?.success && (
                <button
                  className="px-3 py-1.5 text-xs rounded font-medium border border-green-400/40 text-green-400 bg-green-400/[0.08] hover:bg-green-400/[0.15] cursor-pointer"
                  onClick={handleCreatePR}
                >
                  Create PR
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
