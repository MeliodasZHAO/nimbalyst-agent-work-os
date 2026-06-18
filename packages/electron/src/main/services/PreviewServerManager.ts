/**
 * PreviewServerManager — owns the lifecycle of per-worktree dev-server
 * preview processes.
 *
 * Each worktree can run one preview (its project's `npm run dev` or equivalent)
 * bound to a STABLE port. The port + optional human name + detected command are
 * the single source of truth, persisted in app-settings under `worktreePreviews`
 * so the same worktree always reopens on the same port. The renderer reads the
 * live state (status/port/name) and renders "● running :5301 名字" on the card.
 *
 * Lifecycle is manual: the user starts/stops a preview. Deleting or archiving a
 * worktree removes its entry and kills the process. App quit kills everything —
 * we never leak a dev server (this codebase already paid for an orphaned-watcher
 * CPU incident; preview processes get the same strict cleanup).
 *
 * Dependencies are injected so the scheduler/port logic is unit-testable without
 * spawning real processes. The singleton at the bottom wires the real impls.
 */

import log from 'electron-log/main';

const logger = log.scope('PreviewServerManager');

export type PreviewStatus = 'starting' | 'running' | 'stopped' | 'crashed';

export interface PreviewState {
  worktreeId: string;
  worktreePath: string;
  port: number;
  name?: string;
  devCommand?: string;
  status: PreviewStatus;
  pid?: number;
  url: string;
  error?: string;
}

/** A handle to a spawned child process, narrowed for testability. */
export interface SpawnedProcess {
  pid: number | undefined;
  onExit: (cb: (code: number | null) => void) => void;
}

export interface PreviewRegistryEntry {
  port: number;
  name?: string;
  devCommand?: string;
}

export type PreviewRegistry = Record<string, PreviewRegistryEntry>;

export interface PreviewServerManagerDeps {
  /** Spawn the dev server. Implementations wire stdout/stderr to a log buffer. */
  spawnProcess: (args: {
    worktreeId: string;
    worktreePath: string;
    command: string;
    port: number;
  }) => SpawnedProcess;
  /** Kill a process tree by pid (taskkill /T on Windows, group kill on posix). */
  killTree: (pid: number) => void;
  /** True if the OS port is free to bind. */
  isPortFree: (port: number) => Promise<boolean>;
  /** Single reachability check: true if the dev server accepts a connection. */
  probePort: (port: number) => Promise<boolean>;
  /** Sleep between reachability polls (injected so tests run instantly). */
  sleep: (ms: number) => Promise<void>;
  /** Interval between reachability polls. */
  probeIntervalMs: number;
  /** Inspect the worktree's package.json and pick a dev script. */
  detectDevCommand: (worktreePath: string) => string | undefined;
  loadRegistry: () => PreviewRegistry;
  saveRegistry: (registry: PreviewRegistry) => void;
  /** Push a state change to the renderer. */
  broadcast: (state: PreviewState) => void;
  /** Drop any retained log buffer for a worktree (called on remove). */
  clearLogs?: (worktreeId: string) => void;
  basePort: number;
}

export class PreviewServerManager {
  private readonly deps: PreviewServerManagerDeps;
  private readonly states = new Map<string, PreviewState>();
  private readonly procs = new Map<string, SpawnedProcess>();
  /** Worktrees whose process we are deliberately stopping (suppresses 'crashed'). */
  private readonly stopping = new Set<string>();
  /**
   * Serializes port allocation + registry persistence so two concurrent start()
   * calls can't read the same pre-write snapshot and pick the same port.
   */
  private allocChain: Promise<void> = Promise.resolve();

  constructor(deps: PreviewServerManagerDeps) {
    this.deps = deps;
  }

  getState(worktreeId: string): PreviewState | undefined {
    return this.states.get(worktreeId);
  }

  listStates(): PreviewState[] {
    return [...this.states.values()];
  }

  /** Persist (and locally cache) a human-friendly preview name. */
  async setName(worktreeId: string, name: string): Promise<void> {
    await this.runAlloc(() => {
      const registry = this.deps.loadRegistry();
      const existing = registry[worktreeId];
      // Reserve a port lazily so a name set before first start still has a home.
      const port = existing?.port ?? this.nextFreeReservedPort(registry);
      registry[worktreeId] = { ...existing, port, name };
      this.deps.saveRegistry(registry);
    });

    const state = this.states.get(worktreeId);
    if (state) {
      state.name = name;
      this.emit(state);
    }
  }

  async start(worktreeId: string, worktreePath: string): Promise<PreviewState> {
    const existing = this.states.get(worktreeId);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      return existing;
    }

    // Reserve port + command atomically. The stable port is reused only if it's
    // actually free; otherwise we pick (and persist) a new free one so the port
    // we hand the dev server always matches state.url / the reachability probe.
    const { port, command, name } = await this.reserveAssignment(worktreeId, worktreePath);

    const state: PreviewState = {
      worktreeId,
      worktreePath,
      port,
      name,
      devCommand: command,
      status: 'starting',
      url: `http://localhost:${port}`,
    };
    this.states.set(worktreeId, state);
    this.stopping.delete(worktreeId);
    this.emit(state);

    let proc: SpawnedProcess;
    try {
      proc = this.deps.spawnProcess({ worktreeId, worktreePath, command, port });
    } catch (error) {
      state.status = 'crashed';
      state.error = error instanceof Error ? error.message : String(error);
      this.emit(state);
      logger.error('Failed to spawn preview', { worktreeId, error: state.error });
      return state;
    }

    state.pid = proc.pid;
    this.procs.set(worktreeId, proc);
    proc.onExit((code) => this.onProcExit(worktreeId, code));

    // First reachability check inline so a fast dev server flips to running
    // immediately. If not yet up, hand off to a background monitor that keeps
    // polling while the process is alive (no fixed give-up that strands a slow
    // server at 'starting' forever).
    const reachable = await this.deps.probePort(port);
    this.applyReachable(worktreeId, reachable);
    if (!reachable) {
      void this.monitorReachability(worktreeId, port);
    }
    return this.states.get(worktreeId) ?? state;
  }

  /**
   * Flip a 'starting' preview to 'running' when reachable. Only acts while the
   * preview is still 'starting' — if the process already exited ('crashed') or
   * was stopped during the probe, we must NOT resurrect it to 'running'.
   */
  private applyReachable(worktreeId: string, reachable: boolean): void {
    const state = this.states.get(worktreeId);
    if (!state || state.status !== 'starting') return;
    if (reachable) {
      state.status = 'running';
      this.emit(state);
    }
  }

  /** Poll reachability while the preview stays 'starting' (i.e. alive, not up). */
  private async monitorReachability(worktreeId: string, port: number): Promise<void> {
    for (;;) {
      await this.deps.sleep(this.deps.probeIntervalMs);
      const state = this.states.get(worktreeId);
      // Stopped / crashed / already running / removed → stop polling.
      if (!state || state.status !== 'starting') return;
      if (await this.deps.probePort(port)) {
        this.applyReachable(worktreeId, true);
        return;
      }
    }
  }

  async stop(worktreeId: string): Promise<void> {
    const proc = this.procs.get(worktreeId);
    this.stopping.add(worktreeId);
    if (proc?.pid !== undefined) {
      this.deps.killTree(proc.pid);
    }
    this.procs.delete(worktreeId);

    const state = this.states.get(worktreeId);
    if (state) {
      state.status = 'stopped';
      state.pid = undefined;
      this.emit(state);
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.states.keys()].map((id) => this.stop(id)));
  }

  /** Stop the preview AND forget its port reservation (worktree deleted). */
  async remove(worktreeId: string): Promise<void> {
    await this.stop(worktreeId);
    this.states.delete(worktreeId);
    this.stopping.delete(worktreeId);
    this.deps.clearLogs?.(worktreeId);

    await this.runAlloc(() => {
      const registry = this.deps.loadRegistry();
      if (registry[worktreeId]) {
        delete registry[worktreeId];
        this.deps.saveRegistry(registry);
      }
    });
  }

  private onProcExit(worktreeId: string, code: number | null): void {
    const state = this.states.get(worktreeId);
    if (!state) return;
    this.procs.delete(worktreeId);
    // A deliberate stop already set status='stopped'; don't downgrade to crashed.
    if (this.stopping.has(worktreeId) || state.status === 'stopped') {
      this.stopping.delete(worktreeId);
      return;
    }
    state.status = 'crashed';
    state.pid = undefined;
    state.error = `dev server exited (code ${code ?? 'null'})`;
    this.emit(state);
    logger.warn('Preview process crashed', { worktreeId, code });
  }

  /** Run a port-allocation critical section serialized against all others. */
  private async runAlloc<T>(fn: () => T | Promise<T>): Promise<T> {
    let result!: T;
    this.allocChain = this.allocChain.then(async () => {
      result = await fn();
    });
    await this.allocChain;
    return result;
  }

  /**
   * Reserve the port + dev command for a worktree, serialized so concurrent
   * starts never collide on a port. Reuses the persisted stable port only when
   * it is actually free; otherwise allocates and persists a new free port.
   */
  private reserveAssignment(
    worktreeId: string,
    worktreePath: string,
  ): Promise<{ port: number; command: string; name?: string }> {
    return this.runAlloc(async () => {
      const registry = this.deps.loadRegistry();
      const entry = registry[worktreeId];

      let port = entry?.port;
      if (port === undefined || !(await this.deps.isPortFree(port))) {
        port = await this.findFreePort(registry);
      }

      const command =
        entry?.devCommand ?? this.deps.detectDevCommand(worktreePath) ?? 'npm run dev';

      registry[worktreeId] = { port, name: entry?.name, devCommand: command };
      this.deps.saveRegistry(registry);
      return { port, command, name: entry?.name };
    });
  }

  /** First reserved-free port from basePort upward (used for name-before-start). */
  private nextFreeReservedPort(registry: PreviewRegistry): number {
    const reserved = new Set(Object.values(registry).map((e) => e.port));
    let port = this.deps.basePort;
    while (reserved.has(port)) port += 1;
    return port;
  }

  /** First port that is both unreserved AND not bound by another process. */
  private async findFreePort(registry: PreviewRegistry): Promise<number> {
    const reserved = new Set(Object.values(registry).map((e) => e.port));
    let port = this.deps.basePort;
    // Bound the scan so a misbehaving isPortFree can't loop forever.
    for (let i = 0; i < 1000; i++, port++) {
      if (reserved.has(port)) continue;
      if (await this.deps.isPortFree(port)) return port;
    }
    throw new Error('No free preview port found in scan range');
  }

  private emit(state: PreviewState): void {
    this.deps.broadcast({ ...state });
  }
}

// --- Process-tree kill ---------------------------------------------------

export interface KillProcessTreeDeps {
  exec: (cmd: string, args: string[]) => void;
  kill: (pid: number, signal: NodeJS.Signals) => void;
}

/**
 * Kill a spawned dev server and all of its children. npm/vite spawn child
 * processes, so a plain `process.kill(pid)` leaves the actual server orphaned.
 * Windows has no process groups — use taskkill /T to walk the tree. On posix
 * the child is spawned detached (its own group), so a negative pid signals the
 * whole group.
 */
export function killProcessTree(
  pid: number,
  platform: NodeJS.Platform,
  deps: KillProcessTreeDeps,
): void {
  if (platform === 'win32') {
    deps.exec('taskkill', ['/PID', String(pid), '/T', '/F']);
  } else {
    deps.kill(-pid, 'SIGTERM');
  }
}

// --- Singleton wiring (real spawn / kill / port probe / registry) --------

import { spawn, execFileSync } from 'child_process';
import { createServer, connect as netConnect } from 'net';
import { readFileSync } from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import { getAppSetting, setAppSetting } from '../utils/store';

const REGISTRY_KEY = 'worktreePreviews';
const PREVIEW_BASE_PORT = 5300;
const PROBE_INTERVAL_MS = 500;
const PROBE_ATTEMPT_TIMEOUT_MS = 1_000;

/** Ring buffer of recent stdout/stderr lines per worktree, for the log popover. */
const previewLogs = new Map<string, string[]>();
const MAX_LOG_LINES = 500;

export function getPreviewLogs(worktreeId: string): string[] {
  return previewLogs.get(worktreeId) ?? [];
}

function clearPreviewLogs(worktreeId: string): void {
  previewLogs.delete(worktreeId);
}

function appendLog(worktreeId: string, chunk: string): void {
  const lines = previewLogs.get(worktreeId) ?? [];
  for (const line of chunk.split('\n')) {
    if (line.length === 0) continue;
    lines.push(line);
  }
  while (lines.length > MAX_LOG_LINES) lines.shift();
  previewLogs.set(worktreeId, lines);
}

/** Detect a dev script from the worktree's package.json (dev > start > serve). */
function detectDevCommand(worktreePath: string): string | undefined {
  try {
    const pkgRaw = readFileSync(path.join(worktreePath, 'package.json'), 'utf-8');
    const scripts = (JSON.parse(pkgRaw)?.scripts ?? {}) as Record<string, string>;
    for (const candidate of ['dev', 'start', 'serve']) {
      if (typeof scripts[candidate] === 'string') {
        return `npm run ${candidate}`;
      }
    }
  } catch (error) {
    logger.warn('Could not read package.json for dev command detection', {
      worktreePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return undefined;
}

/** Bind-test a port: free if a throwaway server can listen on it. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port, '127.0.0.1');
  });
}

/**
 * Single reachability check against one host:port with a bounded connect
 * timeout. A hung connect (SYN dropped, half-open server) resolves false at the
 * timeout instead of wedging — the manager's poll loop retries.
 */
function probeHost(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      conn.destroy();
      resolve(ok);
    };
    const conn = netConnect({ port, host }, () => done(true));
    conn.setTimeout(PROBE_ATTEMPT_TIMEOUT_MS, () => done(false));
    conn.on('error', () => done(false));
  });
}

/**
 * Single reachability check. Tries IPv4 and IPv6 loopback because Node servers
 * commonly bind only one of 127.0.0.1 / ::1 depending on how they resolve
 * "localhost"; a probe against the wrong family would falsely read "down".
 */
async function probePort(port: number): Promise<boolean> {
  const [v4, v6] = await Promise.all([
    probeHost('127.0.0.1', port),
    probeHost('::1', port),
  ]);
  return v4 || v6;
}

function loadRegistry(): PreviewRegistry {
  return getAppSetting<PreviewRegistry>(REGISTRY_KEY) ?? {};
}

function saveRegistry(registry: PreviewRegistry): void {
  setAppSetting(REGISTRY_KEY, registry);
}

function broadcast(state: PreviewState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    // Guard against sending to a window mid-teardown (e.g. a preview crashes
    // during app quit), which would throw "Object has been destroyed".
    if (window.isDestroyed()) continue;
    window.webContents.send('preview:state-changed', state);
  }
}

function realSpawn(args: {
  worktreeId: string;
  worktreePath: string;
  command: string;
  port: number;
}): SpawnedProcess {
  const { worktreeId, worktreePath, command, port } = args;
  // command is "npm run <script>"; run via shell so npm resolves on PATH.
  const child = spawn(command, {
    cwd: worktreePath,
    shell: true,
    // Detached on posix gives the child its own process group so killTree can
    // signal the whole group. On Windows taskkill /T walks the tree instead.
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      PORT: String(port),
      VITE_PORT: String(port),
      BROWSER: 'none', // stop CRA/vite from opening a browser themselves
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (d) => appendLog(worktreeId, d.toString()));
  child.stderr?.on('data', (d) => appendLog(worktreeId, d.toString()));

  return {
    pid: child.pid,
    onExit: (cb) => child.on('exit', cb),
  };
}

let instance: PreviewServerManager | null = null;

export function getPreviewServerManager(): PreviewServerManager {
  if (!instance) {
    instance = new PreviewServerManager({
      spawnProcess: realSpawn,
      killTree: (pid) =>
        killProcessTree(pid, process.platform, {
          // execFileSync (not execFile): the kill must be issued before the
          // caller returns so app-quit can't exit and orphan the dev-server
          // tree. taskkill is fast; the brief block is acceptable on stop/quit.
          exec: (cmd, cmdArgs) => {
            try {
              execFileSync(cmd, cmdArgs, { stdio: 'ignore' });
            } catch {
              // taskkill exits non-zero if the tree is already gone — ignore.
            }
          },
          kill: (target, signal) => {
            try {
              process.kill(target, signal);
            } catch {
              // Process already gone — nothing to kill.
            }
          },
        }),
      isPortFree,
      probePort,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      probeIntervalMs: PROBE_INTERVAL_MS,
      detectDevCommand,
      loadRegistry,
      saveRegistry,
      broadcast,
      clearLogs: clearPreviewLogs,
      basePort: PREVIEW_BASE_PORT,
    });
  }
  return instance;
}

