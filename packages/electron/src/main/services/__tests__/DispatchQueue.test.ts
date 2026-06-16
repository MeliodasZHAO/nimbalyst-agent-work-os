import { describe, expect, it, vi } from 'vitest';
import { DispatchQueue, type QueueEntry, type SettleEventType } from '../DispatchQueue';
import { deriveDispatchTitle } from '../dispatchTitle';

/** Capture the queue's settle listener so tests can fire session events. */
function makeHarness(maxConcurrent: number) {
  let listener: ((e: { type: string; sessionId: string }) => void) | null = null;
  const materialized: string[] = [];
  const settled: Array<{ sessionId: string; type: SettleEventType }> = [];
  const materialize = vi.fn(async (entry: QueueEntry) => {
    materialized.push(entry.sessionId);
  });
  const onSettle = vi.fn((entry: QueueEntry, type: SettleEventType) => {
    settled.push({ sessionId: entry.sessionId, type });
  });
  const queue = new DispatchQueue({
    materialize,
    getMaxConcurrent: () => maxConcurrent,
    subscribeSessionEvents: l => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    onSettle,
  });
  const settle = (sessionId: string, type = 'session:completed') => listener?.({ type, sessionId });
  return { queue, materialize, materialized, settle, onSettle, settled };
}

function entry(sessionId: string, priority: QueueEntry['priority'], enqueuedAt: number): QueueEntry {
  return { sessionId, dispatchId: 'd1', workspacePath: '/ws', priority, enqueuedAt };
}

describe('DispatchQueue', () => {
  it('runs at most maxConcurrent entries, highest priority first', () => {
    const { queue } = makeHarness(2);
    queue.enqueue([
      entry('a', 'low', 1),
      entry('b', 'high', 2),
      entry('c', 'medium', 3),
      entry('d', 'high', 4),
      entry('e', 'low', 5),
    ]);

    const running = queue.getSnapshot().running.map(e => e.sessionId).sort();
    // Two highest-priority: b and d (both high, earliest enqueuedAt).
    expect(running).toEqual(['b', 'd']);
    expect(queue.getSnapshot().waiting.map(e => e.sessionId)).toEqual(['c', 'a', 'e']);
  });

  it('promotes the next-highest-priority entry when a running session completes', () => {
    const { queue, settle } = makeHarness(2);
    queue.enqueue([
      entry('a', 'low', 1),
      entry('b', 'high', 2),
      entry('c', 'medium', 3),
    ]);
    // Running: b (high), c (medium). Waiting: a (low).
    expect(queue.getSnapshot().running.map(e => e.sessionId).sort()).toEqual(['b', 'c']);

    settle('b', 'session:completed');
    // Slot freed → a promoted (only one waiting).
    expect(queue.getSnapshot().running.map(e => e.sessionId).sort()).toEqual(['a', 'c']);
    expect(queue.getSnapshot().waiting).toHaveLength(0);
  });

  it('frees a slot on session:error and session:interrupted', () => {
    const { queue, settle } = makeHarness(1);
    queue.enqueue([entry('a', 'high', 1), entry('b', 'high', 2), entry('c', 'high', 3)]);
    expect(queue.getSnapshot().running.map(e => e.sessionId)).toEqual(['a']);

    settle('a', 'session:error');
    expect(queue.getSnapshot().running.map(e => e.sessionId)).toEqual(['b']);

    settle('b', 'session:interrupted');
    expect(queue.getSnapshot().running.map(e => e.sessionId)).toEqual(['c']);
  });

  it('ignores settle events for sessions it is not running', () => {
    const { queue, settle } = makeHarness(1);
    queue.enqueue([entry('a', 'high', 1), entry('b', 'high', 2)]);
    expect(queue.getSnapshot().running.map(e => e.sessionId)).toEqual(['a']);

    // Unrelated session completes — must not free a slot or promote.
    settle('zzz', 'session:completed');
    expect(queue.getSnapshot().running.map(e => e.sessionId)).toEqual(['a']);
    expect(queue.getSnapshot().waiting.map(e => e.sessionId)).toEqual(['b']);
  });

  it('ignores non-settle events', () => {
    const { queue, settle } = makeHarness(1);
    queue.enqueue([entry('a', 'high', 1), entry('b', 'high', 2)]);
    settle('a', 'session:streaming');
    expect(queue.getSnapshot().running.map(e => e.sessionId)).toEqual(['a']);
  });

  it('invokes onSettle with the entry and event type when a running session settles', () => {
    const { queue, settle, onSettle, settled } = makeHarness(2);
    queue.enqueue([entry('a', 'high', 1), entry('b', 'high', 2)]);

    settle('a', 'session:completed');
    settle('b', 'session:error');

    expect(onSettle).toHaveBeenCalledTimes(2);
    expect(settled).toEqual([
      { sessionId: 'a', type: 'session:completed' },
      { sessionId: 'b', type: 'session:error' },
    ]);
  });

  it('does not invoke onSettle for a session it is not running', () => {
    const { queue, settle, onSettle } = makeHarness(1);
    queue.enqueue([entry('a', 'high', 1), entry('b', 'high', 2)]);

    // 'b' is still waiting (only one slot); a settle for it must not fire onSettle.
    settle('b', 'session:completed');
    expect(onSettle).not.toHaveBeenCalled();

    // Unrelated session id either.
    settle('zzz', 'session:completed');
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('releases the slot when materialize rejects', async () => {
    let listener: ((e: { type: string; sessionId: string }) => void) | null = null;
    const materialize = vi.fn(async (e: QueueEntry) => {
      if (e.sessionId === 'a') throw new Error('git boom');
    });
    const queue = new DispatchQueue({
      materialize,
      getMaxConcurrent: () => 1,
      subscribeSessionEvents: l => {
        listener = l;
        return () => undefined;
      },
    });
    void listener; // referenced to satisfy lint; events not needed here
    queue.enqueue([entry('a', 'high', 1), entry('b', 'high', 2)]);

    // Let the chained materialize promise settle.
    await new Promise(r => setTimeout(r, 0));

    // 'a' failed and released its slot, so 'b' should now be running.
    expect(queue.getSnapshot().running.map(e => e.sessionId)).toEqual(['b']);
  });
});

describe('deriveDispatchTitle', () => {
  it('keeps a strong agent title', () => {
    expect(deriveDispatchTitle({ agentTitle: 'Add retry to upload handler' })).toBe(
      'Add retry to upload handler',
    );
  });

  it('falls back to the description for weak titles', () => {
    expect(
      deriveDispatchTitle({ agentTitle: 'Task', taskDescription: 'Fix the login page percentage split layout.' }),
    ).toBe('Fix the login page percentage split layout.');
    expect(
      deriveDispatchTitle({ agentTitle: 'Untitled', taskDescription: 'Refactor sync manager identity logic.' }),
    ).toBe('Refactor sync manager identity logic.');
    expect(deriveDispatchTitle({ agentTitle: 'task 2', taskDescription: 'Improve kanban rendering.' })).toBe(
      'Improve kanban rendering.',
    );
  });

  it('falls back to description when title is empty', () => {
    expect(deriveDispatchTitle({ taskDescription: 'Add dark mode toggle to settings.' })).toBe(
      'Add dark mode toggle to settings.',
    );
  });

  it('strips markdown and truncates long descriptions', () => {
    const long = '## Implement ' + 'a'.repeat(100);
    const out = deriveDispatchTitle({ taskDescription: long });
    expect(out.length).toBeLessThanOrEqual(62);
    expect(out).not.toContain('#');
  });

  it('returns Task as last resort when nothing usable', () => {
    expect(deriveDispatchTitle({ agentTitle: '', taskDescription: '' })).toBe('Task');
    expect(deriveDispatchTitle({})).toBe('Task');
  });
});
