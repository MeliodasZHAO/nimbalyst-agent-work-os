import { EventEmitter } from 'events';
import { join, resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Use a real (platform-neutral) absolute path so path.join/resolve behave the
// same on CI (POSIX) and on Windows. The previous hard-coded "Z:\..." string
// only matched Windows separators and broke the Linux/macOS CI runners.
const PACKAGE_ROOT = resolve('/repo/packages/electron');

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  existsSync: vi.fn(() => true),
  getPackageRoot: vi.fn(),
  isPackaged: false,
}));

vi.mock('child_process', () => ({
  spawn: mocks.spawn,
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: mocks.existsSync,
  };
});

vi.mock('../../utils/appPaths', () => ({
  getPackageRoot: mocks.getPackageRoot,
}));

vi.mock('../../utils/ipcRegistry', () => ({
  safeHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged;
    },
  },
}));

import {
  buildVisualCheckSpawnSpec,
  runAgentWorkOSVisualCheck,
  sanitizeVisualCheckLabel,
} from '../AgentWorkOSHandlers';

function makeChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('AgentWorkOSHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(true);
    mocks.isPackaged = false;
    mocks.getPackageRoot.mockReturnValue(PACKAGE_ROOT);
  });

  it('sanitizes visual check labels for file-safe output names', () => {
    expect(sanitizeVisualCheckLabel('Feature: Frontend Fix / 手动')).toBe('feature-frontend-fix');
    expect(sanitizeVisualCheckLabel('')).toBe('agent-work-os');
  });

  it('builds a fixed node script invocation without shell passthrough', () => {
    const spec = buildVisualCheckSpawnSpec({
      label: 'ABC 123',
      workspacePath: 'Z:\\workspace\\demo',
    });

    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toEqual([
      join(PACKAGE_ROOT, 'scripts', 'agent-work-os-visual-check.mjs'),
      '--label=abc-123',
      '--workspace=Z:\\workspace\\demo',
    ]);
    expect(spec.cwd).toBe(resolve(PACKAGE_ROOT, '..', '..'));
  });

  it('returns parsed report paths from a successful run', async () => {
    const child = makeChildProcess();
    mocks.spawn.mockReturnValue(child);

    const promise = runAgentWorkOSVisualCheck({ label: 'demo' });

    child.stdout.emit('data', JSON.stringify({
      resultPath: 'Z:\\out\\result.json',
      screenshots: [{ viewport: 'desktop', width: 1440, height: 1000, path: 'Z:\\out\\desktop.png' }],
    }));
    child.emit('close', 0);

    await expect(promise).resolves.toMatchObject({
      success: true,
      resultPath: 'Z:\\out\\result.json',
      screenshots: [{ viewport: 'desktop', width: 1440, height: 1000, path: 'Z:\\out\\desktop.png' }],
    });
    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['--label=demo']),
      expect.objectContaining({ shell: false, windowsHide: true }),
    );
  });

  it('fails clearly when the visual check script is missing', async () => {
    mocks.existsSync.mockReturnValue(false);

    await expect(runAgentWorkOSVisualCheck({ label: 'demo' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('visual check script not found'),
    });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('does not run the development visual check helper from packaged builds', async () => {
    mocks.isPackaged = true;

    await expect(runAgentWorkOSVisualCheck({ label: 'demo' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('only available in development mode'),
    });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
