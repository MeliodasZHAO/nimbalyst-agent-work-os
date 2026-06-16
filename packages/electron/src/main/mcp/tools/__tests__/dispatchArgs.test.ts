import { describe, expect, it } from 'vitest';
import { mapDispatchArgs } from '../dispatchArgs';

describe('mapDispatchArgs', () => {
  it('passes through a valid effortLevel', () => {
    const [task] = mapDispatchArgs({
      tasks: [{ title: 'Hard refactor', prompt: 'do it', effortLevel: 'max' }],
    });
    expect(task.effortLevel).toBe('max');
  });

  it('drops an invalid effortLevel rather than forcing a default', () => {
    const [task] = mapDispatchArgs({
      tasks: [{ title: 'x', prompt: 'y', effortLevel: 'banana' }],
    });
    // undefined => child session keeps its provider default, not coerced to 'high'.
    expect(task.effortLevel).toBeUndefined();
  });

  it('leaves effortLevel undefined when omitted', () => {
    const [task] = mapDispatchArgs({ tasks: [{ title: 'x', prompt: 'y' }] });
    expect(task.effortLevel).toBeUndefined();
  });

  it('maps the remaining fields with sensible defaults', () => {
    const [task] = mapDispatchArgs({
      tasks: [{ prompt: 'only a prompt' }],
    });
    expect(task).toMatchObject({
      title: 'Untitled task',
      prompt: 'only a prompt',
      provider: 'auto',
      createWorkPacket: false,
    });
  });

  it('preserves explicit provider, model, complexity, and priority', () => {
    const [task] = mapDispatchArgs({
      tasks: [{
        title: 'T',
        prompt: 'P',
        provider: 'claude-code',
        model: 'claude-code:opus',
        complexity: 'large',
        priority: 'high',
        createWorkPacket: true,
        effortLevel: 'xhigh',
      }],
    });
    expect(task).toEqual({
      title: 'T',
      prompt: 'P',
      provider: 'claude-code',
      model: 'claude-code:opus',
      complexity: 'large',
      priority: 'high',
      effortLevel: 'xhigh',
      createWorkPacket: true,
    });
  });

  it('returns an empty array when tasks is missing', () => {
    expect(mapDispatchArgs({})).toEqual([]);
    expect(mapDispatchArgs(undefined)).toEqual([]);
  });
});
