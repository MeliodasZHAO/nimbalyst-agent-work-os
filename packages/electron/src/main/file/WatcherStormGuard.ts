/**
 * WatcherStormGuard -- closes chokidar watchers whose watched root was
 * deleted out from under them.
 *
 * On Windows, deleting a directory while an fs.watch handle is open moves it
 * to NTFS `\$Extend\$Deleted` instead of releasing it, and the orphaned handle
 * can fire phantom change events indefinitely. chokidar responds to each event
 * with a readdir rescan (`_handleRead`), so a single stale handle saturates
 * the main-process event loop and every IPC call gets slow.
 *
 * Observed in the wild on 2026-06-10/11: a deleted worktree left the main
 * process at ~150% CPU for 22 hours (7600+ High-CPU watchdog entries), with
 * ~60% of busy main-thread samples inside chokidar's event/rescan path while
 * the filesystem was verifiably quiet.
 *
 * The guard samples watcher events: every BATCH events (rate-limited to one
 * check per MIN_CHECK_INTERVAL_MS) it verifies the watched root still exists.
 * If the root is gone, the watcher is closed, releasing the underlying
 * fs.watch handles. Quiet watchers cost nothing; only storms trigger checks.
 */

import * as fs from 'fs';
import type { FSWatcher } from 'chokidar';
import { logger } from '../utils/logger';

const CHECK_EVERY_EVENTS = 25;
const MIN_CHECK_INTERVAL_MS = 5000;

/**
 * Attach a storm guard to a chokidar watcher.
 *
 * @param watcher        The chokidar watcher to protect.
 * @param mustExistPath  A path that must exist for the watch to stay alive
 *                       (e.g. the git dir, NOT the watched file itself --
 *                       watched files like loose refs may legitimately not
 *                       exist while their repo does).
 * @param label          Log label identifying the owner.
 * @param onClosed       Optional callback after the watcher is force-closed,
 *                       so owners can clean up their bookkeeping.
 */
export function attachWatcherStormGuard(
  watcher: FSWatcher,
  mustExistPath: string,
  label: string,
  onClosed?: () => void,
): void {
  let eventCount = 0;
  let lastCheckAt = 0;
  let closed = false;

  const onEvent = (): void => {
    if (closed) return;
    eventCount++;
    if (eventCount % CHECK_EVERY_EVENTS !== 0) return;

    const now = Date.now();
    if (now - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
    lastCheckAt = now;

    fs.promises.access(mustExistPath).catch(() => {
      if (closed) return;
      closed = true;
      logger.main.warn(
        `[WatcherStormGuard] ${label}: watched root no longer exists after ${eventCount} events -- closing watcher to stop phantom event storm`,
        { mustExistPath },
      );
      watcher.close().catch(() => {});
      onClosed?.();
    });
  };

  // 'raw' fires for every underlying fs event (including ones chokidar
  // filters out of 'all'), which is exactly where phantom storms surface.
  watcher.on('raw', onEvent);
  watcher.on('all', onEvent);
}
