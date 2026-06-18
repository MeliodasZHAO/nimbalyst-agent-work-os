import { describe, it, expect } from 'vitest';
import { deriveDispatchTitle } from '../dispatchTitle';

describe('deriveDispatchTitle', () => {
  it('保留足够强的 agent 标题', () => {
    expect(deriveDispatchTitle({ agentTitle: '修复看板命名bug', taskDescription: 'whatever' }))
      .toBe('修复看板命名bug');
  });

  it('弱标题(Task)时从描述派生真名', () => {
    const t = deriveDispatchTitle({ agentTitle: 'Task', taskDescription: '把徽章语义改成只数需要你回应的会话' });
    expect(t).not.toMatch(/^task$/i);
    expect(t.length).toBeGreaterThanOrEqual(6);
  });

  it('空标题时从描述派生', () => {
    const t = deriveDispatchTitle({ agentTitle: '', taskDescription: '左侧列表按 parentSessionId 折叠成树' });
    expect(t).toContain('左侧列表');
  });

  it('弱标题+空描述时保留弱名(源码设计:保留弱名胜过空,但绝不是 New conversation)', () => {
    const t = deriveDispatchTitle({ agentTitle: 'fix', taskDescription: '' });
    expect(t).toBe('fix'); // dispatchTitle.ts:65 `return agentTitle || 'Task'` —— 'fix' 非空故保留
    expect(t).not.toMatch(/new conversation/i);
  });

  it('超长描述截断并加省略号', () => {
    const long = 'a'.repeat(200);
    const t = deriveDispatchTitle({ agentTitle: null, taskDescription: long });
    expect(t.length).toBeLessThanOrEqual(61); // 60 + '…'
    expect(t.endsWith('…')).toBe(true);
  });
});
