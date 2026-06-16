/**
 * CodexUsageIndicator - Circular progress indicator for Codex usage
 *
 * Displays the 5-hour session utilization as a circular progress ring
 * in the navigation gutter. Clicking opens a popover with full details.
 * Error states render as a blank ("--") indicator with hover details.
 */

import React, { useState, useRef, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import {
  codexUsageAtom,
  codexUsageAvailableAtom,
  codexUsageIndicatorEnabledAtom,
  codexUsageSessionColorAtom,
  formatResetTime,
} from '../../store/atoms/codexUsageAtoms';
import { CodexUsagePopover } from './CodexUsagePopover';
import { refreshCodexUsage } from '../../store/listeners/codexUsageListeners';
import { HelpTooltip } from '../../help';

const RING_RADIUS = 12;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface CodexUsageIndicatorProps {
  className?: string;
}

export const CodexUsageIndicator: React.FC<CodexUsageIndicatorProps> = ({ className }) => {
  const usage = useAtomValue(codexUsageAtom);
  const isAvailable = useAtomValue(codexUsageAvailableAtom);
  const isEnabled = useAtomValue(codexUsageIndicatorEnabledAtom);
  const sessionColor = useAtomValue(codexUsageSessionColorAtom);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    setIsPopoverOpen((prev) => !prev);
  }, []);

  const handleRefresh = useCallback(async () => {
    await refreshCodexUsage();
  }, []);

  if (!isEnabled || !isAvailable) {
    return null;
  }

  const hasLoadError = Boolean(usage?.error);
  const utilization = hasLoadError ? 0 : usage?.fiveHour?.utilization ?? 0;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - utilization / 100);
  const limitsAvailable = !hasLoadError && (usage?.limitsAvailable ?? true);

  const colorClasses: Record<string, string> = {
    green: 'stroke-green-500',
    yellow: 'stroke-yellow-500',
    red: 'stroke-red-500',
    muted: 'stroke-nim-muted',
  };

  const effectiveSessionColor = limitsAvailable ? sessionColor : 'muted';
  const strokeColor = colorClasses[effectiveSessionColor] || colorClasses.muted;

  // Dynamic usage line shown inside the HelpTooltip (Chinese, localized)
  const usageDetail = usage?.error
    ? `用量信息不可用：${usage.error}`
    : usage
      ? limitsAvailable
        ? `当前会话：${Math.round(utilization)}%（${formatResetTime(usage.fiveHour.resetsAt)} 后重置）`
        : '额度信息暂不可用'
      : '用量信息不可用';

  return (
    <div className={`relative ${className || ''}`}>
      <HelpTooltip
        testId="codex-usage-indicator"
        placement="right"
        extraContent={<span className="text-xs text-[var(--nim-text)]">{usageDetail}</span>}
      >
        <button
          ref={buttonRef}
          onClick={handleClick}
          className="relative w-9 h-9 flex items-center justify-center bg-transparent border-none rounded-md cursor-pointer transition-all duration-150 p-0 hover:bg-nim-tertiary active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--nim-primary)] focus-visible:outline-offset-2"
          aria-label="Codex Usage"
          data-testid="codex-usage-indicator"
        >
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          className="transform -rotate-90"
        >
          {/* Background ring */}
          <circle
            cx="16"
            cy="16"
            r={RING_RADIUS}
            fill="none"
            className="stroke-nim-tertiary"
            strokeWidth="3"
          />
          {/* Progress ring */}
          <circle
            cx="16"
            cy="16"
            r={RING_RADIUS}
            fill="none"
            className={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        {/* Percentage text */}
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-nim">
          {limitsAvailable ? `${Math.round(utilization)}%` : '--'}
        </span>
        </button>
      </HelpTooltip>

      {isPopoverOpen && (
        <CodexUsagePopover
          anchorRef={buttonRef}
          onClose={() => setIsPopoverOpen(false)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
};
