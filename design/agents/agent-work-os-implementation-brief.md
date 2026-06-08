# Agent Work OS Implementation Brief

This brief is for the next coding agent session that implements Agent Work OS features on top of Nimbalyst.

## Objective

Turn the documented Work Packet workflow into product behavior while preserving Nimbalyst's existing architecture:

- custom trackers
- plans
- agent sessions
- worktrees
- Codex and Claude Code providers
- voice/mobile prompt handling
- open markdown/YAML storage

Do not replace Codex or Claude Code. The implementation must route work into the existing agent providers and keep their native capabilities intact.

## Required reading before code changes

Read these files first:

- `CLAUDE.md`
- `docs/AI_PROVIDER_TYPES.md`
- `docs/WORKTREES.md`
- `docs/PLANNING_SYSTEM.md`
- `docs/TRACKER_WORKFLOWS.md`
- `docs/VOICE_MODE.md`
- `docs/AGENT_PERMISSIONS.md`
- `docs/INTERACTIVE_PROMPTS.md`
- `docs/FILE_WATCHING_AND_CHANGE_TRACKING.md`
- `UserDocs/agent-work-os-workflow.md`
- `design/agents/agent-work-os-on-nimbalyst-plan.md`

If implementation touches database schema, migrations, or query behavior, stop and read:

- `packages/electron/DATABASE.md`

Then ask for explicit approval before writing schema/migration code.

## Current no-schema foundation

Already added:

- `UserDocs/examples/work-packet.yaml`
- `UserDocs/agent-work-os-workflow.md`
- `design/agents/agent-work-os-on-nimbalyst-plan.md`
- UserDocs index links

The first implementation should build on this foundation, not bypass it.

## Product model

Work Packet is a structured item that moves through gates:

```text
Capability Gate
  -> Spec Gate
  -> Plan Gate
  -> Running
  -> Review Gate
  -> Verification Gate
  -> Docs Gate
  -> Shipped
```

Key invariant:

```text
Medium, large, or risky Work Packets must be plan-first and should default to worktree sessions.
```

Risky work includes:

- database
- production data
- auth/security
- CI/release
- production runtime behavior
- destructive commands
- multi-repo or broad refactors

## Phase 1: Work Packet creation UX

Goal:

Make it easy to create a Work Packet using the custom tracker model.

Likely areas:

- tracker creation UI
- command palette or slash commands
- plan/tracker integration
- UserDocs examples

Expected behavior:

- User can create a Work Packet from a document or command.
- The created packet uses `work-packet` tracker type.
- The user can set gate, complexity, priority, recommendedAgent, capabilityRoute.
- Full-document Work Packet items should include a useful template with sections:
  - Intent
  - Scope
  - Non-goals
  - Success Criteria
  - Verification
  - Risks
  - Capability Route
  - Review Gate
  - Docs Gate

Acceptance:

- Existing custom tracker tests still pass.
- Work Packet YAML validates with `parseTrackerYAML`.
- UserDocs explain the flow.

Suggested tests:

```text
npx vitest --run packages/runtime/src/plugins/TrackerPlugin/models/__tests__/schemaRoles.test.ts packages/runtime/src/plugins/TrackerPlugin/models/__tests__/tagsAutoDefault.test.ts
```

## Phase 2: Capability Gate helper

Goal:

Given a Work Packet, suggest how to run the agent.

Initial implementation can be pure client-side logic; avoid DB changes.

Inputs:

- complexity
- risks
- recommendedAgent
- capabilityRoute
- requiredSkills
- project memory paths
- provider availability

Output:

- provider: Codex, Claude Code, or mixed
- session mode: plan-first, normal, reviewer-only
- worktree recommended: yes/no
- second-agent review: yes/no
- docs gate required: yes/no

Suggested pure function:

```typescript
routeWorkPacket(packet): CapabilityRouteRecommendation
```

Acceptance:

- Unit tests for tiny/small/medium/large/risky routing.
- Risky packets require plan-first and second-agent review.
- Database risk always requires human approval.

## Phase 3: Launch Agent From Work Packet

Goal:

Create an agent session from a selected Work Packet.

Expected flow:

1. Read selected Work Packet fields.
2. Build a prompt.
3. If route requires worktree, create a worktree using existing worktree service.
4. Start selected provider session in the correct workspace path.
5. Link session to plan/tracker context where current architecture permits.
6. Open the session UI.

Prompt must include:

- Work Packet fields
- project memory references
- capability route
- gate instructions
- explicit stop conditions

For plan-first:

```text
Do not edit files yet. Read this Work Packet and the project memory. Identify missing success criteria, risks, verification steps, and human decisions. Then propose a plan.
```

Acceptance:

- Codex and Claude Code native provider paths are reused.
- Worktree session runs in worktree path.
- No provider-specific capability is stripped.
- User can see session and return to Work Packet context.

## Phase 4: Review and Verification evidence

Goal:

Make evidence visible and durable.

Initial implementation can use document sections or tracker fields before schema changes.

Evidence to capture:

- changed files
- diff summary
- tests run
- screenshots/logs
- second-agent review
- unresolved risks
- docs impact

Acceptance:

- Review Gate cannot be marked ready unless required evidence is present.
- Risky packets require second-agent review.
- Docs Gate prompts for project memory updates before shipping.

## Phase 5: Mobile and voice guardrails

Goal:

Let mobile/voice control waiting agents without bypassing gates.

Allowed mobile/voice actions:

- answer interactive prompt
- approve plan for non-risky work
- ask follow-up
- queue next Work Packet
- review small diff

Disallowed without desktop review:

- approve database change
- approve destructive command
- mark risky packet shipped
- bypass verification evidence

Acceptance:

- Voice/mobile prompt wording includes gate/risk context.
- Risky Work Packets require explicit desktop review or stronger confirmation.
- Mobile blocked approvals surface a desktop warning so remote users know the Work Packet guardrail intervened.
- File-backed and database-backed Work Packets use the same linked-session guardrails.

## Non-goals for the first implementation

- No database schema changes unless separately approved.
- No direct DB inspection with external tools.
- No new provider transport.
- No replacement of Codex or Claude Code SDK/CLI integration.
- No automatic installation of untrusted skills.
- No automatic PR merge.
- No "done" state without user action.

## First prompt for Codex

```text
Read CLAUDE.md and the Agent Work OS docs:
- UserDocs/agent-work-os-workflow.md
- design/agents/agent-work-os-on-nimbalyst-plan.md
- design/agents/agent-work-os-implementation-brief.md

Do not edit files yet. Map the existing tracker, plan, worktree, and agent session code paths that should be used for Phase 1 and Phase 2. Identify the smallest no-schema-change implementation plan, tests to add, and any approval needed before coding.
```

## Definition of done for the first coding phase

- Work Packet creation path exists or is clearly exposed through existing custom tracker UX.
- Capability routing exists as tested logic.
- Docs remain accurate.
- No database schema changes were introduced.
- Existing tracker model tests pass.
- Any new tests for routing pass.
- The implementation preserves Codex/Claude Code native capabilities.
