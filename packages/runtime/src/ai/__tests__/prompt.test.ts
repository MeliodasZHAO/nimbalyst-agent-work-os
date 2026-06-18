import { describe, expect, it } from 'vitest';
import { buildClaudeCodeSystemPrompt } from '../prompt';

describe('buildClaudeCodeSystemPrompt', () => {
  it('includes interactive input guidance for codex-style tool references', () => {
    const prompt = buildClaudeCodeSystemPrompt({
      toolReferenceStyle: 'codex',
    });

    expect(prompt).toContain('## Interactive User Input');
    expect(prompt).toContain('`AskUserQuestion` (server: `nimbalyst-mcp`)');
    expect(prompt).toContain('`PromptForUserInput` (server: `nimbalyst-mcp`)');
    expect(prompt).toContain('call an interactive tool instead');
    expect(prompt).toContain('Combine multiple questions into one multi-field prompt');
  });

  it('formats interactive input tool references for claude-style prompts', () => {
    const prompt = buildClaudeCodeSystemPrompt({
      toolReferenceStyle: 'claude',
    });

    expect(prompt).toContain('`mcp__nimbalyst-mcp__AskUserQuestion`');
    expect(prompt).toContain('`mcp__nimbalyst-mcp__PromptForUserInput`');
  });

  it('always includes the mandatory task-triage protocol', () => {
    const prompt = buildClaudeCodeSystemPrompt({
      toolReferenceStyle: 'claude',
    });

    // The triage section is the heart of single-entry auto-routing: the agent
    // (not the user) decides inline vs worktree vs dispatch vs work packet.
    expect(prompt).toContain('## Task Triage (mandatory first step)');
    expect(prompt).toContain('classify it BEFORE doing any work');
    // All four routing lanes
    expect(prompt).toContain('**Inline (default)**');
    expect(prompt).toContain('**Isolated worktree**');
    expect(prompt).toContain('**Parallel dispatch**');
    expect(prompt).toContain('**High-risk**');
    // The tools backing each lane
    expect(prompt).toContain('`mcp__nimbalyst-mcp__agent_work_os_dispatch`');
    expect(prompt).toContain('`mcp__nimbalyst-mcp__tracker_create`');
    // Transparency rules: routing must be announced, merge stays with the user
    expect(prompt).toContain('FIRST sentence must say where the work is happening');
    expect(prompt).toContain('Never auto-merge');
  });

  it('tells the agent to assess complexity from code and configure model/effort itself', () => {
    const prompt = buildClaudeCodeSystemPrompt({
      toolReferenceStyle: 'claude',
    });

    // Complexity is the agent's job to judge from real code, never the user's
    // to label.
    expect(prompt).toContain('Judge Size and Risk from the actual code');
    expect(prompt).toContain('Never ask the user to rate complexity, difficulty, or effort');
    // The agent picks model + effort by self-assessed difficulty when dispatching.
    expect(prompt).toContain('Match the model and reasoning effort to the difficulty you assessed');
    expect(prompt).toContain('claude-code:opus');
    expect(prompt).toContain('effortLevel');
    expect(prompt).toContain('low | medium | high | xhigh | max');
  });

  it('tells the agent to go deep in-place (subagents/Workflow) for hard unsplittable tasks', () => {
    const prompt = buildClaudeCodeSystemPrompt({
      toolReferenceStyle: 'claude',
    });

    // The ultracode dimension: a deep-but-unsplittable task uses the SDK's
    // in-session orchestration, distinct from horizontal dispatch.
    expect(prompt).toContain('go deep IN PLACE rather than wide across worktrees');
    expect(prompt).toContain('Spawn subagents');
    expect(prompt).toContain('`Task`/`Agent`');
    expect(prompt).toContain('author a `Workflow`');
    // Must not be confused with dispatch — it stays inside the current worktree.
    expect(prompt).toContain('INSIDE the current session and worktree');
  });

  it('formats triage tool references for codex-style prompts', () => {
    const prompt = buildClaudeCodeSystemPrompt({
      toolReferenceStyle: 'codex',
    });

    expect(prompt).toContain('`agent_work_os_dispatch` (server: `nimbalyst-mcp`)');
    expect(prompt).toContain('`tracker_create` (server: `nimbalyst-mcp`)');
  });
});
