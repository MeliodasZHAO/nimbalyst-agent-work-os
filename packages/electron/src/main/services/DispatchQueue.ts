/**
 * DispatchQueue — concurrency-limited, priority-ordered scheduler for
 * dispatched task sessions.
 *
 * Background: dispatchTasks does not itself "run" a task. It creates the
 * worktree + session + queued prompt, then emits `dispatch:session-ready`,
 * and the renderer starts the prompt. So controlling concurrency = controlling
 * which sessions get materialized (worktree built + session-ready emitted).
 *
 * This queue holds the run permits. Each entry already has a child session row
 * (created at enqueue time, phase=queued, so it shows on the kanban). The queue
 * keeps at most `maxConcurrent` entries materialized at once; the rest wait,
 * ordered by priority (high → medium → low, FIFO within a priority). When a
 * running session settles (completed / error / interrupted), a slot frees and
 * the next-highest-priority entry is promoted.
 *
 * git worktree creation must be serialized, so all materialize() calls run on a
 * single chained promise even when multiple slots open at once.
 *
 * The class takes its dependencies via injection so it can be unit-tested
 * without a database, git, or the real SessionStateManager. The singleton
 * accessor at the bottom wires the real implementations.
 */

import log from 'electron-log/main';
import { getSessionStateManager } from '@nimbalyst/runtime/ai/server/SessionStateManager';
import { getAppSetting } from '../utils/store';

const logger = log.scope('DispatchQueue');

export type DispatchPriority = 'high' | 'medium' | 'low';

const PRIORITY_RANK: Record<DispatchPriority, number> = { high: 0, medium: 1, low: 2 };

// Global ceiling across ALL projects. This is the only hard throttle and exists
// purely to protect the account-level Claude/Codex API rate limit -- running many
// full agent sessions at once otherwise triggers 429s that slow/fail everything.
// Generous by default; <= 0 means unlimited.
export const DEFAULT_DISPATCH_MAX_CONCURRENT = 12;

// Per-project cap. 0 (the default) means UNLIMITED per project: a single project
// can run as many dispatch sessions as the global ceiling allows -- 8 worktrees in
// one project is a floor, not a ceiling. Raise to a positive number only to stop
// one greedy project from starving others.
export const DEFAULT_DISPATCH_PER_PROJECT_CONCURRENT = 0;

/** Treat <= 0 as "no limit". */
function normalizeLimit(value: number): number {
  return value > 0 ? value : Number.POSITIVE_INFINITY;
}

export interface QueueEntry {
  sessionId: string;
  dispatchId: string;
  workspacePath: string;
  priority: DispatchPriority;
  enqueuedAt: number;
  trackerItemId?: string;
}

/** Settle events that free a running slot. */
export type SettleEventType = 'session:completed' | 'session:error' | 'session:interrupted';

export interface DispatchQueueDeps {
  /** Build the worktree, queue the prompt, and emit `dispatch:session-ready`. */
  materialize: (entry: QueueEntry) => Promise<void>;
  /** Global concurrency ceiling across all projects (<= 0 means unlimited). */
  getGlobalMaxConcurrent: () => number;
  /** Per-project concurrency cap (<= 0 means unlimited). */
  getPerProjectMaxConcurrent: () => number;
  /** Subscribe to session lifecycle events; returns an unsubscribe fn. */
  subscribeSessionEvents: (
    listener: (event: { type: string; sessionId: string }) => void,
  ) => () => void;
  /**
   * Called when a running dispatch entry settles (completed/error/interrupted),
   * just before its slot is freed. Used to advance the session's kanban phase.
   * Optional so unit tests can omit it.
   */
  onSettle?: (entry: QueueEntry, eventType: SettleEventType) => void;
}

function compareEntries(a: QueueEntry, b: QueueEntry): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  return a.enqueuedAt - b.enqueuedAt; // FIFO within a priority
}

export class DispatchQueue {
  private waiting: QueueEntry[] = [];
  private running = new Map<string, QueueEntry>();
  private materializeChain: Promise<void> = Promise.resolve();
  private readonly deps: DispatchQueueDeps;

  constructor(deps: DispatchQueueDeps) {
    this.deps = deps;
    this.deps.subscribeSessionEvents(event => this.onSessionEvent(event));
  }

  /** Add entries to the queue and start filling open slots. */
  enqueue(entries: QueueEntry[]): void {
    if (entries.length === 0) return;
    this.waiting.push(...entries);
    logger.info('Enqueued dispatch entries', {
      added: entries.length,
      waiting: this.waiting.length,
      running: this.running.size,
    });
    this.pump();
  }

  getSnapshot(): { running: QueueEntry[]; waiting: QueueEntry[] } {
    return {
      running: [...this.running.values()],
      waiting: [...this.waiting].sort(compareEntries),
    };
  }

  /**
   * Promote waiting entries into open slots, honoring two limits:
   *  - the global ceiling (total running across all projects), and
   *  - the per-project cap (running for a single workspace).
   * When a project is at its per-project cap we skip its waiting entries and
   * promote another project's instead, so one busy project never head-of-line
   * blocks the others.
   */
  private pump(): void {
    const globalMax = normalizeLimit(this.deps.getGlobalMaxConcurrent());
    const perProjectMax = normalizeLimit(this.deps.getPerProjectMaxConcurrent());
    while (this.running.size < globalMax) {
      const entry = this.takeNextEligible(perProjectMax);
      if (!entry) break;
      // Reserve the slot synchronously so concurrent pump() calls see it.
      this.running.set(entry.sessionId, entry);
      this.scheduleMaterialize(entry);
    }
  }

  /**
   * Remove and return the highest-priority waiting entry whose project is below
   * the per-project cap, or undefined if every waiting entry's project is full.
   */
  private takeNextEligible(perProjectMax: number): QueueEntry | undefined {
    if (this.waiting.length === 0) return undefined;

    const runningPerProject = new Map<string, number>();
    for (const e of this.running.values()) {
      runningPerProject.set(e.workspacePath, (runningPerProject.get(e.workspacePath) ?? 0) + 1);
    }

    let bestIdx = -1;
    for (let i = 0; i < this.waiting.length; i++) {
      const candidate = this.waiting[i];
      if ((runningPerProject.get(candidate.workspacePath) ?? 0) >= perProjectMax) continue;
      if (bestIdx === -1 || compareEntries(candidate, this.waiting[bestIdx]) < 0) bestIdx = i;
    }

    if (bestIdx === -1) return undefined;
    return this.waiting.splice(bestIdx, 1)[0];
  }

  /** Chain materialize() so git worktree creation stays serialized. */
  private scheduleMaterialize(entry: QueueEntry): void {
    this.materializeChain = this.materializeChain.then(async () => {
      try {
        await this.deps.materialize(entry);
        logger.info('Materialized dispatch entry', {
          sessionId: entry.sessionId,
          dispatchId: entry.dispatchId,
        });
      } catch (error) {
        // Materialization failed (e.g. git error): release the slot so the
        // queue does not leak it, and let the next entry through.
        this.running.delete(entry.sessionId);
        logger.error('Failed to materialize dispatch entry; releasing slot', {
          sessionId: entry.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        this.pump();
      }
    });
  }

  private onSessionEvent(event: { type: string; sessionId: string }): void {
    const settleTypes: SettleEventType[] = [
      'session:completed',
      'session:error',
      'session:interrupted',
    ];
    if (!settleTypes.includes(event.type as SettleEventType)) return;
    // Only react to sessions this queue is actually running, otherwise an
    // unrelated session settling would wrongly free a slot.
    const entry = this.running.get(event.sessionId);
    if (!entry) return;

    this.running.delete(event.sessionId);
    // Advance the session's kanban phase (e.g. → validating on completion)
    // before promoting the next entry. Guarded so a throwing handler cannot
    // stall the queue.
    try {
      this.deps.onSettle?.(entry, event.type as SettleEventType);
    } catch (error) {
      logger.error('onSettle handler threw', {
        sessionId: event.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    logger.info('Dispatch session settled; freeing slot', {
      sessionId: event.sessionId,
      type: event.type,
      running: this.running.size,
      waiting: this.waiting.length,
    });
    this.pump();
  }
}

// --- Singleton wiring ----------------------------------------------------

let instance: DispatchQueue | null = null;

/**
 * Get the process-wide DispatchQueue. The `materialize` implementation is
 * injected lazily by AgentWorkOSDispatcher (which owns the worktree/session
 * creation logic) via setDispatchMaterializer to avoid a circular import.
 */
export function getDispatchQueue(): DispatchQueue {
  if (!instance) {
    instance = new DispatchQueue({
      materialize: entry => {
        if (!materializer) {
          throw new Error('DispatchQueue materializer not registered');
        }
        return materializer(entry);
      },
      getGlobalMaxConcurrent: () =>
        getAppSetting<number>('dispatchMaxConcurrent') ?? DEFAULT_DISPATCH_MAX_CONCURRENT,
      getPerProjectMaxConcurrent: () =>
        getAppSetting<number>('dispatchPerProjectMaxConcurrent') ??
        DEFAULT_DISPATCH_PER_PROJECT_CONCURRENT,
      subscribeSessionEvents: listener =>
        getSessionStateManager().subscribe(event =>
          listener({ type: event.type, sessionId: event.sessionId }),
        ),
      onSettle: (entry, eventType) => settleHandler?.(entry, eventType),
    });
  }
  return instance;
}

let materializer: ((entry: QueueEntry) => Promise<void>) | null = null;

/** Register the worktree/session materialization implementation. */
export function setDispatchMaterializer(fn: (entry: QueueEntry) => Promise<void>): void {
  materializer = fn;
}

let settleHandler: ((entry: QueueEntry, eventType: SettleEventType) => void) | null = null;

/** Register the on-settle handler (advances kanban phase when a task settles). */
export function setDispatchSettleHandler(
  fn: (entry: QueueEntry, eventType: SettleEventType) => void,
): void {
  settleHandler = fn;
}
