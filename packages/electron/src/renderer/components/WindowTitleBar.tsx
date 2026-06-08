import React, { useState, useEffect, useCallback } from 'react';

const isWindows = navigator.userAgent.includes('Windows');

function MinimizeIcon() {
  return (
    <svg width="10" height="1" viewBox="0 0 10 1">
      <rect fill="currentColor" width="10" height="1" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect fill="none" stroke="currentColor" strokeWidth="1" x="0.5" y="0.5" width="9" height="9" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect fill="none" stroke="currentColor" strokeWidth="1" x="2.5" y="0.5" width="7" height="7" />
      <polyline fill="none" stroke="currentColor" strokeWidth="1" points="0.5,2.5 0.5,9.5 7.5,9.5 7.5,2.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <line stroke="currentColor" strokeWidth="1.2" x1="0" y1="0" x2="10" y2="10" />
      <line stroke="currentColor" strokeWidth="1.2" x1="10" y1="0" x2="0" y2="10" />
    </svg>
  );
}

export function WindowTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isWindows) return;

    window.electronAPI.windowIsMaximized().then(setIsMaximized);
    const cleanup = window.electronAPI.onWindowMaximizeChange(setIsMaximized);
    return cleanup;
  }, []);

  const handleMinimize = useCallback(() => window.electronAPI.windowMinimize(), []);
  const handleMaximizeToggle = useCallback(() => window.electronAPI.windowMaximizeToggle(), []);
  const handleClose = useCallback(() => window.electronAPI.windowClose(), []);

  if (!isWindows) return null;

  return (
    <div
      className="window-titlebar flex items-center justify-end h-8 bg-[var(--nim-bg-secondary)] [-webkit-app-region:drag] select-none shrink-0"
    >
      <div className="window-controls flex items-stretch h-full [-webkit-app-region:no-drag]">
        <button
          className="window-control-btn flex items-center justify-center w-[46px] h-full border-none bg-transparent text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-hover)] transition-colors duration-100 cursor-default"
          onClick={handleMinimize}
          tabIndex={-1}
        >
          <MinimizeIcon />
        </button>
        <button
          className="window-control-btn flex items-center justify-center w-[46px] h-full border-none bg-transparent text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-hover)] transition-colors duration-100 cursor-default"
          onClick={handleMaximizeToggle}
          tabIndex={-1}
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          className="window-control-btn window-control-close flex items-center justify-center w-[46px] h-full border-none bg-transparent text-[var(--nim-text-muted)] hover:bg-[#e81123] hover:text-white transition-colors duration-100 cursor-default"
          onClick={handleClose}
          tabIndex={-1}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
