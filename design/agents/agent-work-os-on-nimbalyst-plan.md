# Agent Work OS on Nimbalyst

## Context

Nimbalyst already has the hard parts that an agent work operating layer needs:

- Codex and Claude Code agent providers
- resumable sessions
- worktrees
- trackers and custom tracker schemas
- plans with agent session links
- voice mode
- mobile session dashboard and prompt response flow
- open storage in markdown, YAML, and plain files

The next step is not to replace these systems. It is to compose them into a stricter work protocol around Work Packets, Capability Gates, and Review/Verification evidence.

## First no-schema-change step

This branch adds:

- `UserDocs/examples/work-packet.yaml`
- `UserDocs/agent-work-os-workflow.md`
- README links for the new workflow

This lets users copy a Work Packet tracker into `.nimbalyst/trackers/` and start using the flow without database migrations or provider changes.

## Target architecture

```text
Work Packet tracker
  -> Capability Gate
  -> Plan document / agent prompt
  -> Worktree session
  -> Codex / Claude Code provider
  -> Review Gate
  -> Verification Gate
  -> Docs Gate
  -> Project memory update
```

## Integration points

### Trackers

Work Packet is a custom tracker model. It uses schema roles:

- `title`
- `workflowStatus`
- `priority`
- `progress`
- `tags`

This means Nimbalyst can reuse existing tracker UI, kanban grouping, table views, and MCP tracker tools.

### Plans

For complex tasks, a full plan document should reference one or more Work Packets. The existing plan frontmatter can continue to track agent sessions.

Future enhancement:

```yaml
planStatus:
  workPackets:
    - wpkt_...
```

### Agent providers

Capability Gate should be implemented above provider execution. It should not fork Codex or Claude Code behavior.

Inputs:

- provider inventory from `docs/AI_PROVIDER_TYPES.md`
- CLI presence from `CLIManager`
- model/provider settings
- MCP configuration
- workspace/project memory
- Work Packet fields

Output:

- recommended provider
- recommended session mode
- plan-first requirement
- second-agent review requirement
- skills/project-memory notes

### Worktrees

For medium, large, or risky Work Packets, the default action should be creating a worktree session, not a regular session.

Existing worktree service and session association should remain the source of truth.

### Voice and mobile

Mobile and voice are best used as control surfaces for waiting agents:

- answer interactive prompts
- approve or reject plans
- queue next Work Packets
- review small diffs
- wake sleeping sessions

They should not bypass Review Gate or Verification Gate for risky work.

## Future implementation phases

### Phase 1: Documented workflow

Done in this branch.

### Phase 2: Work Packet helper UI

Add a command or panel action:

```text
Create Work Packet
```

It should create a tracker item with the Work Packet schema and optionally open a full document template.

Current no-schema implementation exposes this through the existing custom tracker and document type paths: `#work-packet` creates inline packets, and Markdown `Set Document Type -> Work Packet` creates a full-document packet with starter sections.

### Phase 3: Capability Gate panel

Add a panel that reads a selected Work Packet and suggests:

- Codex vs Claude Code vs mixed
- worktree vs regular session
- plan-first vs direct execution
- high reasoning / pursue-goal notes
- required project memory docs
- second-agent review requirement

### Phase 4: Launch agent from Work Packet

Add an action:

```text
Launch Agent From Work Packet
```

It should:

1. build a prompt from the Work Packet
2. include relevant project memory
3. create a worktree when required
4. start the selected agent session
5. link the session back to the tracker item or plan

### Phase 5: Evidence gates

Add structured evidence sections for:

- diff summary
- tests run
- screenshots/logs
- second-agent review
- documentation impact

## Non-goals

- Do not add database schema changes in the first phase.
- Do not replace Codex or Claude Code transports.
- Do not auto-install unknown third-party skills without explicit user approval.
- Do not let mobile/voice approvals bypass risky-work gates.
- Do not mark work done automatically; leave final promotion to the user.
