import { describe, it, expect, vi } from 'vitest';
import {
  PreviewServerManager,
  killProcessTree,
  type PreviewServerManagerDeps,
  type SpawnedProcess,
} from '../PreviewServerManager';

type TestProc = SpawnedProcess & { triggerExit: (code: number | null) => void };

function makeProc(pid: number): TestProc {
  let exitCb: ((code: number | null) => void) | null = null;
  return {
    pid,
    onExit: (cb) => {
      exitCb = cb;
    },
    triggerExit: (code) => exitCb?.(code),
  };
}

function makeManager(overrides: Partial<PreviewServerManagerDeps> = {}) {
  const registry: Record<string, { port: number; name?: string; devCommand?: string }> = {};
  const procs: TestProc[] = [];
  const killed: number[] = [];
  const clearedLogs: string[] = [];
  const broadcasts: Array<{ worktreeId: string; status: string; port?: number }> = [];

  const deps: PreviewServerManagerDeps = {
    spawnProcess: vi.fn(() => {
      const p = makeProc(1000 + procs.length);
      procs.push(p);
      return p;
    }),
    killTree: vi.fn((pid: number) => {
      killed.push(pid);
    }),
    isPortFree: vi.fn(async () => true),
    probePort: vi.fn(async () => true),
    sleep: vi.fn(async () => {}),
    probeIntervalMs: 0,
    detectDevCommand: vi.fn(() => 'npm run dev'),
    loadRegistry: () => structuredClone(registry),
    saveRegistry: (r) => {
      Object.keys(registry).forEach((k) => delete registry[k]);
      Object.assign(registry, r);
    },
    broadcast: (s) => broadcasts.push(s),
    clearLogs: (id) => clearedLogs.push(id),
    basePort: 5300,
    ...overrides,
  };

  const mgr = new PreviewServerManager(deps);
  return { mgr, deps, registry, procs, killed, clearedLogs, broadcasts };
}

describe('PreviewServerManager — port allocation', () => {
  it('assigns the base port to the first worktree and persists it', async () => {
    const { mgr, registry } = makeManager();
    await mgr.start('wtA', '/path/a');
    expect(mgr.getState('wtA')?.port).toBe(5300);
    expect(registry['wtA'].port).toBe(5300);
  });

  it('reuses the same port across restarts (stable assignment)', async () => {
    const { mgr } = makeManager();
    await mgr.start('wtA', '/path/a');
    expect(mgr.getState('wtA')?.port).toBe(5300);

    await mgr.stop('wtA');
    await mgr.start('wtA', '/path/a');
    expect(mgr.getState('wtA')?.port).toBe(5300);
  });

  it('gives each worktree a distinct sequential port', async () => {
    const { mgr } = makeManager();
    await mgr.start('wtA', '/a');
    await mgr.start('wtB', '/b');
    expect(mgr.getState('wtA')?.port).toBe(5300);
    expect(mgr.getState('wtB')?.port).toBe(5301);
  });

  it('skips ports occupied by other processes', async () => {
    const isPortFree = vi.fn(async (p: number) => p !== 5300 && p !== 5301);
    const { mgr } = makeManager({ isPortFree });
    await mgr.start('wtA', '/a');
    expect(mgr.getState('wtA')?.port).toBe(5302);
  });
});

describe('PreviewServerManager — lifecycle', () => {
  it('transitions to running after the port becomes reachable', async () => {
    const { mgr } = makeManager();
    await mgr.start('wtA', '/a');
    expect(mgr.getState('wtA')?.status).toBe('running');
  });

  it('kills the process tree when stopped', async () => {
    const { mgr, killed } = makeManager();
    await mgr.start('wtA', '/a');
    const pid = mgr.getState('wtA')?.pid;
    await mgr.stop('wtA');
    expect(pid).toBeDefined();
    expect(killed).toContain(pid);
    expect(mgr.getState('wtA')?.status).toBe('stopped');
  });

  it('stopAll kills every running preview', async () => {
    const { mgr, killed } = makeManager();
    await mgr.start('wtA', '/a');
    await mgr.start('wtB', '/b');
    await mgr.stopAll();
    expect(killed).toHaveLength(2);
  });

  it('marks preview crashed when the process exits unexpectedly', async () => {
    const { mgr, procs } = makeManager();
    await mgr.start('wtA', '/a');
    procs[0].triggerExit(1);
    expect(mgr.getState('wtA')?.status).toBe('crashed');
  });

  it('keeps status stopped (not crashed) when exit follows an explicit stop', async () => {
    const { mgr, procs } = makeManager();
    await mgr.start('wtA', '/a');
    await mgr.stop('wtA');
    procs[0].triggerExit(null);
    expect(mgr.getState('wtA')?.status).toBe('stopped');
  });
});

describe('PreviewServerManager — worktree deletion linkage', () => {
  it('releases the registry entry on remove and frees the port for reuse', async () => {
    const { mgr, registry } = makeManager();
    await mgr.start('wtA', '/a');
    await mgr.start('wtB', '/b'); // 5300, 5301
    await mgr.remove('wtA');
    expect(registry['wtA']).toBeUndefined();

    await mgr.start('wtC', '/c');
    expect(mgr.getState('wtC')?.port).toBe(5300);
  });

  it('kills a running process when its worktree is removed', async () => {
    const { mgr, killed } = makeManager();
    await mgr.start('wtA', '/a');
    const pid = mgr.getState('wtA')?.pid;
    await mgr.remove('wtA');
    expect(killed).toContain(pid);
    expect(mgr.getState('wtA')).toBeUndefined();
  });
});

describe('PreviewServerManager — naming', () => {
  it('persists a custom preview name to the registry', async () => {
    const { mgr, registry } = makeManager();
    await mgr.start('wtA', '/a');
    await mgr.setName('wtA', '登录页改版');
    expect(mgr.getState('wtA')?.name).toBe('登录页改版');
    expect(registry['wtA'].name).toBe('登录页改版');
  });

  it('lets a name be set before the preview is started', async () => {
    const { mgr, registry } = makeManager();
    await mgr.setName('wtA', '面板A');
    expect(registry['wtA'].name).toBe('面板A');
  });
});

describe('PreviewServerManager — reachability state machine', () => {
  it('does not resurrect a preview that exited during the initial probe', async () => {
    const { mgr, deps, procs } = makeManager();
    // The process dies while the reachability probe is in flight.
    (deps.probePort as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      procs[0].triggerExit(1);
      return true;
    });
    await mgr.start('wtA', '/a');
    expect(mgr.getState('wtA')?.status).toBe('crashed');
  });

  it('flips to running when the server comes up after the first probe fails', async () => {
    let calls = 0;
    const probePort = vi.fn(async () => ++calls >= 2);
    const { mgr } = makeManager({ probePort });
    await mgr.start('wtA', '/a');
    expect(mgr.getState('wtA')?.status).toBe('starting');
    await vi.waitFor(() => expect(mgr.getState('wtA')?.status).toBe('running'));
  });

  it('background monitor stops polling once the preview is stopped', async () => {
    const probePort = vi.fn(async () => false);
    const { mgr } = makeManager({ probePort });
    await mgr.start('wtA', '/a');
    expect(mgr.getState('wtA')?.status).toBe('starting');
    await mgr.stop('wtA');
    const callsAfterStop = probePort.mock.calls.length;
    await new Promise((r) => setTimeout(r, 5));
    // No further probing after stop (status is no longer 'starting').
    expect(probePort.mock.calls.length).toBe(callsAfterStop);
  });
});

describe('PreviewServerManager — port re-validation', () => {
  it('reallocates when the persisted stable port is no longer free', async () => {
    const isPortFree = vi.fn(async (p: number) => p !== 5301);
    const { mgr, registry } = makeManager({ isPortFree });
    await mgr.start('wtA', '/a'); // 5300 free -> 5300
    expect(mgr.getState('wtA')?.port).toBe(5300);
    await mgr.stop('wtA');

    // 5300 is now taken by another process; reuse must re-validate and move on.
    isPortFree.mockImplementation(async (p: number) => p !== 5300);
    await mgr.start('wtA', '/a');
    expect(mgr.getState('wtA')?.port).toBe(5301);
    expect(registry['wtA'].port).toBe(5301);
  });

  it('assigns distinct ports to two worktrees started concurrently', async () => {
    const { mgr } = makeManager();
    await Promise.all([mgr.start('wtA', '/a'), mgr.start('wtB', '/b')]);
    const pa = mgr.getState('wtA')?.port;
    const pb = mgr.getState('wtB')?.port;
    expect(pa).not.toBe(pb);
    expect(new Set([pa, pb])).toEqual(new Set([5300, 5301]));
  });
});

describe('PreviewServerManager — log cleanup', () => {
  it('clears the worktree log buffer on remove', async () => {
    const { mgr, clearedLogs } = makeManager();
    await mgr.start('wtA', '/a');
    await mgr.remove('wtA');
    expect(clearedLogs).toContain('wtA');
  });
});

describe('killProcessTree', () => {
  it('uses taskkill /T /F on Windows', () => {
    const exec = vi.fn();
    const kill = vi.fn();
    killProcessTree(1234, 'win32', { exec, kill });
    expect(exec).toHaveBeenCalledWith('taskkill', ['/PID', '1234', '/T', '/F']);
    expect(kill).not.toHaveBeenCalled();
  });

  it('kills the process group on posix', () => {
    const exec = vi.fn();
    const kill = vi.fn();
    killProcessTree(1234, 'darwin', { exec, kill });
    expect(kill).toHaveBeenCalledWith(-1234, 'SIGTERM');
    expect(exec).not.toHaveBeenCalled();
  });
});
