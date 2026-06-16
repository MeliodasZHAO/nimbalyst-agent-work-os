import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { FSWatcher } from 'chokidar';

const { loggerWarn } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    main: {
      info: vi.fn(),
      error: vi.fn(),
      warn: loggerWarn,
      debug: vi.fn(),
    },
  },
}));

import { attachWatcherStormGuard } from '../WatcherStormGuard';

/** Minimal duck-typed chokidar watcher: an EventEmitter with close(). */
function makeFakeWatcher(): { watcher: FSWatcher; close: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter();
  const close = vi.fn().mockResolvedValue(undefined);
  (emitter as unknown as { close: typeof close }).close = close;
  return { watcher: emitter as unknown as FSWatcher, close };
}

/** Fire enough 'raw' events to pass the guard's sampling threshold. */
function emitStorm(watcher: FSWatcher, count = 30): void {
  for (let i = 0; i < count; i++) {
    (watcher as unknown as EventEmitter).emit('raw', 'change', 'phantom', {});
  }
}

const flushAsync = () => new Promise(resolve => setTimeout(resolve, 20));

describe('attachWatcherStormGuard', () => {
  let tempDir: string;

  beforeEach(() => {
    loggerWarn.mockClear();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storm-guard-'));
  });

  it('closes the watcher when the watched root no longer exists', async () => {
    const { watcher, close } = makeFakeWatcher();
    const onClosed = vi.fn();
    attachWatcherStormGuard(watcher, tempDir, 'test', onClosed);

    // Simulate the real-world failure: the watched root is deleted while the
    // orphaned handle keeps firing phantom events (Windows $Extend\$Deleted).
    fs.rmdirSync(tempDir);
    emitStorm(watcher);
    await flushAsync();

    expect(close).toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('phantom event storm'),
      expect.objectContaining({ mustExistPath: tempDir }),
    );
  });

  it('does not close the watcher while the watched root still exists', async () => {
    const { watcher, close } = makeFakeWatcher();
    const onClosed = vi.fn();
    attachWatcherStormGuard(watcher, tempDir, 'test', onClosed);

    emitStorm(watcher, 100);
    await flushAsync();

    expect(close).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();

    fs.rmdirSync(tempDir);
  });

  it('stays quiet below the sampling threshold', async () => {
    const { watcher, close } = makeFakeWatcher();
    attachWatcherStormGuard(watcher, tempDir, 'test');

    fs.rmdirSync(tempDir);
    emitStorm(watcher, 10); // below CHECK_EVERY_EVENTS
    await flushAsync();

    expect(close).not.toHaveBeenCalled();
  });

  it('fires onClosed at most once', async () => {
    const { watcher, close } = makeFakeWatcher();
    const onClosed = vi.fn();
    attachWatcherStormGuard(watcher, tempDir, 'test', onClosed);

    fs.rmdirSync(tempDir);
    emitStorm(watcher, 60);
    await flushAsync();
    emitStorm(watcher, 60);
    await flushAsync();

    expect(close).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
