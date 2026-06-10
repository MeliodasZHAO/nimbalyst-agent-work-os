import React, { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { groupSessionStatusAtom, sessionProcessingAtom, sessionUnreadAtom, sessionPendingPromptAtom } from '../../store';
import { SessionRelativeTime } from './SessionRelativeTime';

import type { SessionMeta as SessionItem } from '../../store';

interface DispatchTaskEntry {
  session: SessionItem;
  worktreeBranch?: string;
}

interface DispatchGroupProps {
  dispatchId: string;
  title: string;
  isExpanded: boolean;
  isActive: boolean;
  isArchived?: boolean;
  isSelected?: boolean;
  onToggle: () => void;
  onMultiSelect?: (e: React.MouseEvent) => void;
  tasks: DispatchTaskEntry[];
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string, e: Pick<React.MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>) => void;
  onDispatchArchive?: (dispatchId: string) => void;
  onDispatchRename?: (dispatchId: string, newName: string) => void;
}

const DispatchGroupStatus: React.FC<{ sessionIds: string[] }> = memo(({ sessionIds }) => {
  const sessionIdsKey = useMemo(() => JSON.stringify([...sessionIds].sort()), [sessionIds]);
  const { hasProcessing, hasPendingPrompt, hasUnread } = useAtomValue(groupSessionStatusAtom(sessionIdsKey));

  if (hasProcessing) {
    return (
      <div className="flex items-center justify-center text-[var(--nim-primary)]" title="Processing">
        <MaterialSymbol icon="progress_activity" size={12} className="animate-spin" />
      </div>
    );
  }
  if (hasPendingPrompt) {
    return (
      <div className="flex items-center justify-center text-[var(--nim-warning)] animate-pulse" title="Waiting for your response">
        <MaterialSymbol icon="help" size={12} />
      </div>
    );
  }
  if (hasUnread) {
    return (
      <div className="flex items-center justify-center text-[var(--nim-primary)]" title="Unread response">
        <MaterialSymbol icon="circle" size={6} fill />
      </div>
    );
  }
  return null;
});

const DispatchTaskStatus: React.FC<{ sessionId: string }> = memo(({ sessionId }) => {
  const isProcessing = useAtomValue(sessionProcessingAtom(sessionId));
  const hasPendingPrompt = useAtomValue(sessionPendingPromptAtom(sessionId));
  const hasUnread = useAtomValue(sessionUnreadAtom(sessionId));

  if (isProcessing) {
    return (
      <div className="flex items-center justify-center text-[var(--nim-primary)] animate-spin" title="Processing...">
        <MaterialSymbol icon="progress_activity" size={12} />
      </div>
    );
  }
  if (hasPendingPrompt) {
    return (
      <div className="flex items-center justify-center text-[var(--nim-warning)]" title="Waiting for your response">
        <MaterialSymbol icon="help" size={12} />
      </div>
    );
  }
  if (hasUnread) {
    return (
      <div className="flex items-center justify-center text-[var(--nim-primary)]" title="Unread response">
        <MaterialSymbol icon="circle" size={6} fill />
      </div>
    );
  }
  return null;
});

const DispatchTaskRow: React.FC<{
  session: SessionItem;
  worktreeBranch?: string;
  isActive: boolean;
  onSelect: (e: Pick<React.MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>) => void;
}> = memo(({ session, worktreeBranch, isActive, onSelect }) => {
  const providerLabel = session.provider === 'claude-code' ? 'CC' : session.provider === 'openai-codex' ? 'CX' : session.provider;

  return (
    <div
      className={`dispatch-task-item flex items-center gap-2 py-1.5 px-3 mr-2 mb-0.5 cursor-pointer rounded transition-colors duration-150 select-none ${
        isActive ? 'bg-[var(--nim-bg-selected)]' : 'hover:bg-[var(--nim-bg-hover)]'
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(e); } }}
      aria-label={`Task: ${session.title}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <div className={`shrink-0 flex items-center justify-center ${
        isActive ? 'text-[var(--nim-primary)]' : 'text-[var(--nim-text-muted)]'
      }`}>
        <MaterialSymbol icon="task_alt" size={14} />
      </div>
      <span className={`flex-1 text-xs text-[var(--nim-text)] whitespace-nowrap overflow-hidden text-ellipsis ${
        isActive ? 'font-medium' : ''
      }`}>{session.title || 'Untitled task'}</span>
      <span className="shrink-0 text-[0.5625rem] px-1 py-[0.0625rem] rounded bg-[rgba(156,163,175,0.1)] text-[var(--nim-text-faint)] font-mono">
        {providerLabel}
      </span>
      <span className="shrink-0 text-[0.6875rem] text-[var(--nim-text-faint)]">
        <SessionRelativeTime sessionId={session.id} fallbackTimestamp={session.updatedAt || session.createdAt} />
      </span>
      <div className="shrink-0 flex items-center">
        <DispatchTaskStatus sessionId={session.id} />
      </div>
    </div>
  );
});

export const DispatchGroup: React.FC<DispatchGroupProps> = memo(({
  dispatchId,
  title,
  isExpanded,
  isActive,
  isArchived,
  isSelected,
  onToggle,
  onMultiSelect,
  tasks,
  activeSessionId,
  onSessionSelect,
  onDispatchArchive,
  onDispatchRename,
}) => {
  const allSessionIds = useMemo(
    () => tasks.map(t => t.session.id),
    [tasks],
  );

  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleChevronClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  }, [onToggle]);

  const handleHeaderClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && onMultiSelect) {
      onMultiSelect(e);
      return;
    }
    const firstSession = tasks[0]?.session;
    if (firstSession) {
      onSessionSelect(firstSession.id, e);
    }
  }, [tasks, onSessionSelect, onMultiSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  }, []);

  const handleRenameClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowContextMenu(false);
    setRenameValue(title);
    setIsRenaming(true);
  }, [title]);

  const handleRenameSubmit = useCallback(() => {
    const trimmedValue = renameValue.trim();
    if (trimmedValue && trimmedValue !== title && onDispatchRename) {
      onDispatchRename(dispatchId, trimmedValue);
    }
    setIsRenaming(false);
  }, [renameValue, title, dispatchId, onDispatchRename]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit(); }
    else if (e.key === 'Escape') { e.preventDefault(); setIsRenaming(false); }
  }, [handleRenameSubmit]);

  const handleArchive = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowContextMenu(false);
    if (onDispatchArchive) onDispatchArchive(dispatchId);
  }, [dispatchId, onDispatchArchive]);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  return (
    <div
      className={`dispatch-group mb-1 ${isArchived ? 'archived' : ''} ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
      data-testid={`dispatch-group-${dispatchId}`}
      onMouseLeave={() => setShowContextMenu(false)}
    >
      {/* Header */}
      <div
        className={`dispatch-group-header flex items-center gap-0 text-[0.8125rem] text-[var(--nim-text)] transition-colors duration-150 rounded-md mx-2 w-[calc(100%-1rem)] ${
          isSelected ? 'bg-[var(--nim-bg-selected)]' : isActive ? 'bg-[var(--nim-bg-selected)]' : 'hover:bg-[var(--nim-bg-hover)]'
        }`}
        onContextMenu={handleContextMenu}
      >
        <button
          className="flex items-center justify-center w-6 h-full min-h-[2.5rem] p-0 bg-transparent border-none cursor-pointer text-[var(--nim-text-faint)] shrink-0 rounded-l-md hover:bg-[var(--nim-bg-secondary)] focus:outline-none"
          onClick={handleChevronClick}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} dispatch`}
        >
          <MaterialSymbol
            icon="chevron_right"
            size={12}
            className={`shrink-0 text-[var(--nim-text-faint)] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
          />
        </button>

        <div
          className="flex items-start gap-2 flex-1 min-w-0 py-1 pr-2 pl-1 cursor-pointer"
          onClick={handleHeaderClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleHeaderClick(e as unknown as React.MouseEvent); }
          }}
          aria-label={`Dispatch: ${title}, ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}
        >
          {/* Dispatch icon */}
          <div className={`shrink-0 w-[1.125rem] h-[1.125rem] mt-[0.0625rem] flex items-center justify-center ${
            isActive ? 'text-[var(--nim-primary)]' : 'text-[var(--nim-text-muted)]'
          }`}>
            <MaterialSymbol icon="fork_right" size={18} />
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  className="flex-1 min-w-0 px-1 py-0 text-[0.8125rem] font-medium border border-[var(--nim-primary)] rounded bg-[var(--nim-bg)] text-[var(--nim-text)] outline-none"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={handleRenameSubmit}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="font-medium text-[var(--nim-text)] whitespace-nowrap overflow-hidden text-ellipsis" title={title}>
                  {title}
                </span>
              )}
              {isArchived && !isRenaming && (
                <span className="text-[0.5625rem] px-1.5 py-[0.0625rem] rounded-[0.625rem] font-medium bg-[rgba(156,163,175,0.15)] text-[var(--nim-text-faint)]">archived</span>
              )}
              {!isRenaming && <DispatchGroupStatus sessionIds={allSessionIds} />}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="shrink-0 text-[0.6875rem] text-[var(--nim-text-faint)]">
                {tasks.length} task{tasks.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded task list */}
      {isExpanded && (
        <div className="dispatch-group-children pt-1 pb-1 pl-10 animate-[dispatchSlideDown_0.2s_ease-out]">
          {tasks.map(({ session, worktreeBranch }) => (
            <DispatchTaskRow
              key={session.id}
              session={session}
              worktreeBranch={worktreeBranch}
              isActive={session.id === activeSessionId}
              onSelect={(e) => onSessionSelect(session.id, e)}
            />
          ))}
        </div>
      )}

      {/* Context menu */}
      {showContextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[1000] min-w-[140px] bg-[var(--nim-bg)] border border-[var(--nim-border)] rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.15)] p-1"
          style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {onDispatchRename && (
            <button
              className="flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none cursor-pointer text-[0.8125rem] text-[var(--nim-text)] text-left rounded transition-colors duration-150 hover:bg-[var(--nim-bg-hover)]"
              onClick={handleRenameClick}
            >
              <MaterialSymbol icon="edit" size={14} />
              Rename
            </button>
          )}
          {onDispatchArchive && (
            <>
              <div className="h-px my-1 bg-[var(--nim-border)]" />
              <button
                className="flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none cursor-pointer text-[0.8125rem] text-[var(--nim-error)] text-left rounded transition-colors duration-150 hover:bg-[rgba(239,68,68,0.1)]"
                onClick={handleArchive}
              >
                <MaterialSymbol icon="archive" size={14} />
                Archive Dispatch
              </button>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes dispatchSlideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dispatch-group.archived .dispatch-group-header {
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
});
