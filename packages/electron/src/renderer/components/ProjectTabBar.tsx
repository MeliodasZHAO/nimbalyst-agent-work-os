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
  type VirtualElement,
} from '@floating-ui/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  multiProjectModeAtom,
  openProjectsAtom,
  activeWorkspacePathAtom,
  isOpenProjectsAtCapAtom,
  addOpenProjectAtom,
  closeOpenProjectAtom,
  reorderOpenProjectAtom,
  type OpenProject,
} from '../store/atoms/openProjects';
import {
  globalSessionActivityAtom,
  projectActivitySummaryAtom,
} from '../store/atoms/sessionActivity';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { HelpTooltip } from '../help';
import { generateWorkspaceAccentColor } from './WorkspaceSummaryHeader';

const isWindows = navigator.userAgent.includes('Windows');

function WindowControlButtons() {
  const [isMaximized, setIsMaximized] = React.useState(false);

  React.useEffect(() => {
    window.electronAPI.windowIsMaximized().then(setIsMaximized);
    const cleanup = window.electronAPI.onWindowMaximizeChange(setIsMaximized);
    return cleanup;
  }, []);

  return (
    <div className="window-controls flex items-stretch h-full [-webkit-app-region:no-drag] ml-auto">
      <button
        className="flex items-center justify-center w-[46px] h-full border-none bg-transparent text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-hover)] transition-colors duration-100 cursor-default"
        onClick={() => window.electronAPI.windowMinimize()}
        tabIndex={-1}
      >
        <svg width="10" height="1" viewBox="0 0 10 1"><rect fill="currentColor" width="10" height="1" /></svg>
      </button>
      <button
        className="flex items-center justify-center w-[46px] h-full border-none bg-transparent text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-hover)] transition-colors duration-100 cursor-default"
        onClick={() => window.electronAPI.windowMaximizeToggle()}
        tabIndex={-1}
      >
        {isMaximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect fill="none" stroke="currentColor" strokeWidth="1" x="2.5" y="0.5" width="7" height="7" />
            <polyline fill="none" stroke="currentColor" strokeWidth="1" points="0.5,2.5 0.5,9.5 7.5,9.5 7.5,2.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect fill="none" stroke="currentColor" strokeWidth="1" x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button
        className="flex items-center justify-center w-[46px] h-full border-none bg-transparent text-[var(--nim-text-muted)] hover:bg-[#e81123] hover:text-white transition-colors duration-100 cursor-default"
        onClick={() => window.electronAPI.windowClose()}
        tabIndex={-1}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line stroke="currentColor" strokeWidth="1.2" x1="0" y1="0" x2="10" y2="10" />
          <line stroke="currentColor" strokeWidth="1.2" x1="10" y1="0" x2="0" y2="10" />
        </svg>
      </button>
    </div>
  );
}

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
  const reorderProject = useSetAtom(reorderOpenProjectAtom);
  const activity = useAtomValue(globalSessionActivityAtom);
  const activitySummary = useAtomValue(projectActivitySummaryAtom);

  const [contextMenu, setContextMenu] = useState<{ project: OpenProject; x: number; y: number } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Tab drag-to-reorder state. `dragPath` is the tab being dragged; `dragOverPath`
  // is the tab currently hovered as a drop target (shows the insertion indicator).
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

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

  // 虚拟锚点跟随右键坐标；只在 contextMenu 变化时设置，避免 ref 回调里每 render
  // setReference 触发的无限重渲染(React #185)。
  React.useEffect(() => {
    if (!contextMenu) {
      ctxRefs.setPositionReference(null);
      return;
    }
    const { x, y } = contextMenu;
    const virtual: VirtualElement = {
      getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }),
    };
    ctxRefs.setPositionReference(virtual);
  }, [contextMenu, ctxRefs]);

  const openProjectPaths = useMemo(() => new Set(openProjects.map((p) => p.path)), [openProjects]);
  const filteredRecents = useMemo(
    () => recentProjects.filter((r) => !openProjectPaths.has(r.path)).slice(0, 8),
    [recentProjects, openProjectPaths]
  );

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

  const handleOpenFolder = useCallback(async () => {
    setAddMenuOpen(false);
    try {
      const result = await window.electronAPI?.invoke?.('dialog-show-open-dialog', {
        properties: ['openDirectory'],
        title: '选择项目文件夹',
      });
      if (result?.filePaths?.[0]) {
        await window.electronAPI?.invoke?.('workspace:register-additional', { workspacePath: result.filePaths[0] });
        addProject({ path: result.filePaths[0], name: result.filePaths[0].split(/[/\\]/).pop() || result.filePaths[0], openedAt: Date.now() });
      }
    } catch (err) {
      console.error('[ProjectTabBar] open folder failed:', err);
    }
  }, [addProject]);

  const handleAddClick = useCallback(async () => {
    if (atCap) {
      window.alert('已达到最大项目数 (8)，请先关闭一个项目或在新窗口中打开。');
      return;
    }
    // Fetch recents first: when there are none to offer, the dropdown would
    // contain a single "Open folder" item -- skip the extra click and open
    // the system folder picker directly.
    let recents: Array<{ path: string; name: string; timestamp?: number }> = [];
    try {
      const fetched = await window.electronAPI?.invoke?.('settings:get-recent-projects');
      if (Array.isArray(fetched)) recents = fetched;
    } catch {}
    setRecentProjects(recents);
    const hasRecents = recents.some((r) => !openProjectPaths.has(r.path));
    if (!hasRecents) {
      void handleOpenFolder();
      return;
    }
    setAddMenuOpen(true);
  }, [atCap, openProjectPaths, handleOpenFolder]);

  const handleOpenRecent = useCallback(async (path: string, name: string) => {
    setAddMenuOpen(false);
    try {
      await window.electronAPI?.invoke?.('workspace:register-additional', { workspacePath: path });
      addProject({ path, name, openedAt: Date.now() });
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

  const handleCtxCopyPath = useCallback(() => {
    if (!contextMenu) return;
    const path = contextMenu.project.path;
    closeContextMenu();
    void window.electronAPI?.copyToClipboard?.(path);
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
        className="project-tab-bar flex items-center h-10 bg-[var(--nim-bg-secondary)] [-webkit-app-region:drag] select-none shrink-0 pl-1 pr-1 gap-px overflow-x-auto"
        data-testid="project-tab-bar"
      >
        {openProjects.map((project) => {
          const isActive = project.path === activePath;
          const summary = activitySummary.get(project.path);
          const processingCount = summary?.processing ?? 0;
          const isOnlyProject = openProjects.length <= 1;
          const accentColor = generateWorkspaceAccentColor(project.path);
          const isDragging = project.path === dragPath;
          const showDropIndicator =
            dragOverPath === project.path && dragPath !== null && dragPath !== project.path;

          return (
            <button
              key={project.path}
              type="button"
              draggable
              className={`project-tab group flex items-center gap-1.5 h-[34px] px-3 border-none cursor-pointer text-[13px] font-medium transition-all duration-100 shrink-0 min-w-[60px] [-webkit-app-region:no-drag] ${
                isActive
                  ? 'bg-[var(--nim-bg)] text-[var(--nim-text)] rounded-t-md'
                  : 'bg-transparent text-[var(--nim-text-faint)] hover:text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-tertiary)] rounded-t-md'
              } ${isDragging ? 'opacity-50' : ''}`}
              style={{
                ...(isActive ? { borderBottom: `2px solid ${accentColor}` } : {}),
                ...(showDropIndicator ? { boxShadow: 'inset 2px 0 0 0 var(--nim-primary)' } : {}),
              }}
              onClick={() => handleActivate(project.path)}
              onContextMenu={(e) => handleContextMenu(project, e)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', project.path);
                setDragPath(project.path);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (project.path !== dragPath) setDragOverPath(project.path);
              }}
              onDragLeave={() => {
                setDragOverPath((cur) => (cur === project.path ? null : cur));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const sourcePath = e.dataTransfer.getData('text/plain') || dragPath;
                if (sourcePath && sourcePath !== project.path) {
                  reorderProject({ sourcePath, targetPath: project.path });
                }
                setDragPath(null);
                setDragOverPath(null);
              }}
              onDragEnd={() => {
                setDragPath(null);
                setDragOverPath(null);
              }}
              title={project.path}
              data-testid={`project-tab-${project.path}`}
            >
              <span className="project-tab-name truncate max-w-[200px]">
                {projectDisplayName(project)}
              </span>

              {!isActive && processingCount > 0 && (
                <span className="project-tab-badge flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[var(--nim-primary)] text-white text-[10px] font-bold leading-none">
                  {processingCount}
                </span>
              )}

              {!isOnlyProject && (
                <span
                  className="project-tab-close flex items-center justify-center w-4 h-4 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-[var(--nim-bg-hover)] text-[var(--nim-text-faint)] hover:text-[var(--nim-text)] transition-opacity duration-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose(project);
                  }}
                  role="button"
                  tabIndex={-1}
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
        <HelpTooltip testId="project-tab-add" placement="bottom">
          <button
            ref={(el) => {
              addButtonRef.current = el;
              addRefs.setReference(el);
            }}
            type="button"
            className="project-tab-add flex items-center justify-center w-7 h-7 rounded border-none bg-transparent text-[var(--nim-text-faint)] hover:bg-[var(--nim-bg-hover)] hover:text-[var(--nim-text-muted)] cursor-pointer transition-colors duration-100 shrink-0 [-webkit-app-region:no-drag]"
            onClick={handleAddClick}
            // Disabled buttons don't fire mouse events, so the cap state keeps a native title
            title={atCap ? '已达到最大项目数 (8)' : undefined}
            disabled={atCap}
            data-testid="project-tab-add"
          >
            <MaterialSymbol icon="add" size={14} />
          </button>
        </HelpTooltip>

        {/* Spacer for window dragging */}
        <span className="flex-1" />

        {/* Window controls — integrated into tab bar on Windows (browser-style) */}
        {isWindows && <WindowControlButtons />}
      </div>

      {/* Add project dropdown */}
      {addMenuOpen && (
        <FloatingPortal>
          <div
            ref={addRefs.setFloating}
            style={addFloatingStyles}
            className="project-tab-add-menu z-50 min-w-[260px] max-w-[360px] rounded-lg border border-[var(--nim-border)] bg-[var(--nim-bg)] shadow-[0_12px_32px_rgba(0,0,0,0.45)] py-1"
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
            ref={ctxRefs.setFloating}
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
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-[13px] text-[var(--nim-text)] bg-transparent border-none cursor-pointer hover:bg-[var(--nim-bg-hover)]"
              onClick={handleCtxCopyPath}
            >
              复制项目路径
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
