/**
 * ProjectTabBar
 *
 * Browser-style horizontal tab bar for switching between open projects.
 * Replaces the vertical ProjectRail with a more discoverable top-level UI.
 *
 * Uses the same atoms and IPC as ProjectRail — only the visual layer differs.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  useFloating,
  FloatingPortal,
  useDismiss,
  useInteractions,
  useRole,
  offset,
  flip,
  shift,
} from '@floating-ui/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  multiProjectModeAtom,
  openProjectsAtom,
  activeWorkspacePathAtom,
  isOpenProjectsAtCapAtom,
  addOpenProjectAtom,
  closeOpenProjectAtom,
  type OpenProject,
} from '../store/atoms/openProjects';
import {
  globalSessionActivityAtom,
  projectActivitySummaryAtom,
} from '../store/atoms/sessionActivity';
import { MaterialSymbol } from '@nimbalyst/runtime';

function projectDisplayName(project: OpenProject): string {
  return project.name || project.path.split(/[/\\]/).filter(Boolean).pop() || project.path;
}

export function ProjectTabBar() {
  const isMultiProjectMode = useAtomValue(multiProjectModeAtom);
  const openProjects = useAtomValue(openProjectsAtom);
  const [activePath, setActivePath] = useAtom(activeWorkspacePathAtom);
  const atCap = useAtomValue(isOpenProjectsAtCapAtom);
  const addProject = useSetAtom(addOpenProjectAtom);
  const closeProject = useSetAtom(closeOpenProjectAtom);
  const activity = useAtomValue(globalSessionActivityAtom);
  const activitySummary = useAtomValue(projectActivitySummaryAtom);

  const [contextMenu, setContextMenu] = useState<{ project: OpenProject; x: number; y: number } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<Array<{ path: string; name: string; timestamp?: number }>>([]);
  const addButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const {
    refs: addRefs,
    floatingStyles: addFloatingStyles,
    context: addContext,
  } = useFloating({
    open: addMenuOpen,
    onOpenChange: setAddMenuOpen,
    placement: 'bottom-end',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });
  const addDismiss = useDismiss(addContext);
  const addRole = useRole(addContext, { role: 'menu' });
  const { getFloatingProps: getAddFloatingProps } = useInteractions([addDismiss, addRole]);

  const {
    refs: ctxRefs,
    floatingStyles: ctxFloatingStyles,
    context: ctxContext,
  } = useFloating({
    open: !!contextMenu,
    onOpenChange: (open) => { if (!open) closeContextMenu(); },
    placement: 'bottom-start',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });
  const ctxDismiss = useDismiss(ctxContext);
  const ctxRole = useRole(ctxContext, { role: 'menu' });
  const { getFloatingProps: getCtxFloatingProps } = useInteractions([ctxDismiss, ctxRole]);

  const openProjectPaths = useMemo(() => new Set(openProjects.map((p) => p.path)), [openProjects]);
  const filteredRecents = useMemo(
    () => recentProjects.filter((r) => !openProjectPaths.has(r.path)).slice(0, 8),
    [recentProjects, openProjectPaths]
  );

  const refreshRecents = useCallback(async () => {
    try {
      const recents = await window.electronAPI?.invoke?.('settings:get-recent-projects');
      if (Array.isArray(recents)) setRecentProjects(recents);
    } catch {}
  }, []);

  const handleActivate = useCallback((path: string) => {
    if (path === activePath) return;
    setActivePath(path);
  }, [activePath, setActivePath]);

  const handleClose = useCallback(async (project: OpenProject) => {
    const streaming = activity.get(project.path)?.streaming.size ?? 0;
    if (streaming > 0) {
      const proceed = window.confirm(
        `${project.name} 有 ${streaming} 个正在运行的会话，确定要关闭吗？会话将被暂停。`
      );
      if (!proceed) return;
    }

    const wasLast = openProjects.length <= 1;
    closeProject(project.path);

    try {
      await window.electronAPI?.invoke?.('workspace:unregister-additional', { workspacePath: project.path });
    } catch (err) {
      console.error('[ProjectTabBar] unregister-additional failed:', err);
    }

    if (wasLast) {
      try {
        await window.electronAPI?.invoke?.('workspace:close-rail-window');
      } catch (err) {
        console.error('[ProjectTabBar] close-rail-window failed:', err);
      }
    }
  }, [closeProject, activity, openProjects.length]);

  const handleContextMenu = useCallback((project: OpenProject, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ project, x: e.clientX, y: e.clientY });
  }, []);

  const handleAddClick = useCallback(() => {
    if (atCap) {
      window.alert('已达到最大项目数 (8)，请先关闭一个项目或在新窗口中打开。');
      return;
    }
    refreshRecents();
    setAddMenuOpen(true);
  }, [atCap, refreshRecents]);

  const handleOpenFolder = useCallback(async () => {
    setAddMenuOpen(false);
    try {
      const result = await window.electronAPI?.invoke?.('dialog-show-open-dialog', {
        properties: ['openDirectory'],
        title: '选择项目文件夹',
      });
      if (result?.filePaths?.[0]) {
        await window.electronAPI?.invoke?.('workspace:register-additional', { workspacePath: result.filePaths[0] });
        addProject({ path: result.filePaths[0], name: result.filePaths[0].split(/[/\\]/).pop() || result.filePaths[0] });
      }
    } catch (err) {
      console.error('[ProjectTabBar] open folder failed:', err);
    }
  }, [addProject]);

  const handleOpenRecent = useCallback(async (path: string, name: string) => {
    setAddMenuOpen(false);
    try {
      await window.electronAPI?.invoke?.('workspace:register-additional', { workspacePath: path });
      addProject({ path, name });
    } catch (err) {
      console.error('[ProjectTabBar] open recent failed:', err);
    }
  }, [addProject]);

  const handleCtxOpenNewWindow = useCallback(async () => {
    if (!contextMenu) return;
    closeContextMenu();
    try {
      await window.electronAPI?.invoke?.('workspace-manager:open-workspace', contextMenu.project.path);
    } catch (err) {
      console.error('[ProjectTabBar] open-in-new-window failed:', err);
    }
  }, [contextMenu, closeContextMenu]);

  const handleCtxReveal = useCallback(async () => {
    if (!contextMenu) return;
    closeContextMenu();
    try {
      await window.electronAPI?.invoke?.('show-in-finder', contextMenu.project.path);
    } catch (err) {
      console.error('[ProjectTabBar] show-in-finder failed:', err);
    }
  }, [contextMenu, closeContextMenu]);

  const handleCtxClose = useCallback(() => {
    if (!contextMenu) return;
    closeContextMenu();
    handleClose(contextMenu.project);
  }, [contextMenu, closeContextMenu, handleClose]);

  if (!isMultiProjectMode) return null;

  const revealLabel = (() => {
    const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
    if (platform.startsWith('Mac')) return '在 Finder 中显示';
    if (platform.startsWith('Win')) return '在资源管理器中显示';
    return '在文件管理器中显示';
  })();

  return (
    <>
      <div
        className="project-tab-bar flex items-center h-9 bg-[var(--nim-bg-secondary)] border-b border-[var(--nim-border)] [-webkit-app-region:drag] select-none shrink-0 px-1 gap-0.5 overflow-x-auto"
        data-testid="project-tab-bar"
      >
        {openProjects.map((project) => {
          const isActive = project.path === activePath;
          const summary = activitySummary.get(project.path);
          const processingCount = summary?.processing ?? 0;
          const isOnlyProject = openProjects.length <= 1;

          return (
            <button
              key={project.path}
              type="button"
              className={`project-tab flex items-center gap-1.5 h-7 px-3 rounded-md border-none cursor-pointer text-[12px] font-medium transition-all duration-100 shrink-0 [-webkit-app-region:no-drag] ${
                isActive
                  ? 'bg-[var(--nim-bg)] text-[var(--nim-text)] shadow-[inset_0_-2px_0_var(--nim-primary)]'
                  : 'bg-transparent text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-hover)] hover:text-[var(--nim-text)]'
              }`}
              onClick={() => handleActivate(project.path)}
              onContextMenu={(e) => handleContextMenu(project, e)}
              title={project.path}
              data-testid={`project-tab-${project.path}`}
            >
              <span className="project-tab-name truncate max-w-[160px]">
                {projectDisplayName(project)}
              </span>

              {!isActive && processingCount > 0 && (
                <span className="project-tab-badge flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[var(--nim-primary)] text-white text-[10px] font-bold leading-none">
                  {processingCount}
                </span>
              )}

              {!isOnlyProject && (
                <span
                  className="project-tab-close flex items-center justify-center w-4 h-4 rounded-sm opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:bg-[var(--nim-bg-tertiary)] text-[var(--nim-text-faint)] hover:text-[var(--nim-text)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose(project);
                  }}
                  role="button"
                  tabIndex={-1}
                  style={{ opacity: isActive ? 0.6 : undefined }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <line stroke="currentColor" strokeWidth="1.2" x1="1" y1="1" x2="7" y2="7" />
                    <line stroke="currentColor" strokeWidth="1.2" x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}

        {/* Add project button */}
        <button
          ref={(el) => {
            addButtonRef.current = el;
            addRefs.setReference(el);
          }}
          type="button"
          className="project-tab-add flex items-center justify-center w-7 h-7 rounded-md border-none bg-transparent text-[var(--nim-text-faint)] hover:bg-[var(--nim-bg-hover)] hover:text-[var(--nim-text)] cursor-pointer transition-colors duration-100 shrink-0 [-webkit-app-region:no-drag]"
          onClick={handleAddClick}
          title={atCap ? '已达到最大项目数 (8)' : '添加项目'}
          disabled={atCap}
          data-testid="project-tab-add"
        >
          <MaterialSymbol icon="add" size={16} />
        </button>

        {/* Spacer for window dragging */}
        <span className="flex-1" />
      </div>

      {/* Add project dropdown */}
      {addMenuOpen && (
        <FloatingPortal>
          <div
            ref={addRefs.setFloating}
            style={addFloatingStyles}
            className="project-tab-add-menu z-50 min-w-[220px] max-w-[320px] rounded-lg border border-[var(--nim-border)] bg-[var(--nim-bg)] shadow-lg py-1"
            {...getAddFloatingProps()}
          >
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-[13px] text-[var(--nim-text)] bg-transparent border-none cursor-pointer hover:bg-[var(--nim-bg-hover)] flex items-center gap-2"
              onClick={handleOpenFolder}
            >
              <MaterialSymbol icon="folder_open" size={16} className="text-[var(--nim-text-muted)]" />
              打开文件夹...
            </button>

            {filteredRecents.length > 0 && (
              <>
                <div className="h-px bg-[var(--nim-border)] mx-2 my-1" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--nim-text-faint)]">
                  最近项目
                </div>
                {filteredRecents.map((recent) => (
                  <button
                    key={recent.path}
                    type="button"
                    className="w-full px-3 py-1.5 text-left bg-transparent border-none cursor-pointer hover:bg-[var(--nim-bg-hover)] flex flex-col"
                    onClick={() => handleOpenRecent(recent.path, recent.name)}
                  >
                    <span className="text-[13px] text-[var(--nim-text)] truncate">{recent.name || recent.path}</span>
                    <span className="text-[11px] text-[var(--nim-text-faint)] truncate">{recent.path}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </FloatingPortal>
      )}

      {/* Context menu */}
      {contextMenu && (
        <FloatingPortal>
          <div
            ref={(el) => {
              ctxRefs.setFloating(el);
              if (el) {
                ctxRefs.setReference({
                  getBoundingClientRect: () => DOMRect.fromRect({ x: contextMenu.x, y: contextMenu.y, width: 0, height: 0 }),
                });
              }
            }}
            style={ctxFloatingStyles}
            className="project-tab-context-menu z-50 min-w-[180px] rounded-lg border border-[var(--nim-border)] bg-[var(--nim-bg)] shadow-lg py-1"
            {...getCtxFloatingProps()}
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-[13px] text-[var(--nim-text)] bg-transparent border-none cursor-pointer hover:bg-[var(--nim-bg-hover)]"
              onClick={handleCtxOpenNewWindow}
            >
              在新窗口中打开
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-[13px] text-[var(--nim-text)] bg-transparent border-none cursor-pointer hover:bg-[var(--nim-bg-hover)]"
              onClick={handleCtxReveal}
            >
              {revealLabel}
            </button>
            <div className="h-px bg-[var(--nim-border)] mx-2 my-1" />
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-[13px] text-[var(--nim-error)] bg-transparent border-none cursor-pointer hover:bg-[var(--nim-bg-hover)]"
              onClick={handleCtxClose}
            >
              关闭项目
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
