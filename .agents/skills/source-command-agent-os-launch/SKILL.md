---
name: "source-command-agent-os-launch"
description: "Build a launch plan from a Work Packet and prepare an agent session with structured prompt, routing, and evidence tracking"
---

# /agent-os-launch — Launch Agent Session from Work Packet

Reads a Work Packet's fields, builds a structured agent prompt, generates a routing recommendation, and guides the user to launch the session through Nimbalyst's tracker panel.

## Usage

```
/agent-os-launch <work-packet-id>
```

## Execution steps

### Step 1: Retrieve the Work Packet

```
tracker_get({ id: "<reference>" })
```

If not found, tell the user and suggest `/agent-os` or `/agent-os-create`.

### Step 2: Validate launch readiness

Check the current gate:

- If gate is `shipped` or `docs`: refuse. Say "This Work Packet is past the implementation phase."
- If gate is `spec` and `planEvidence` is empty: warn "Consider completing the plan gate first. Use `/agent-os-gate <id>` to review what's needed."
- If `humanApproval` is required (risks contain database/security/destructive keywords) and empty: warn "This Work Packet requires human approval before implementation proceeds."

### Step 3: Determine routing recommendation

Based on the Work Packet fields, determine:

**Provider selection** (from `recommendedAgent` field):
- `codex` -> OpenAI Codex (backend, tests, CI, runtime, review)
- `claude-code` -> Claude Agent (UI, UX, design, research, spec refinement)
- `mixed` -> one agent implements, another reviews
- `research-only` -> no code changes, information gathering only

**Session mode** (from complexity and risks):
- `plan-first` if complexity >= medium, or has high-impact risks, or capabilityRoute is plan-first
- `normal` for tiny/small with no risks
- `reviewer-only` if capabilityRoute is second-agent-review
- `research-only` if recommendedAgent is research-only

**Worktree recommendation**:
- Recommended if complexity >= medium or has database/security/runtime/destructive risks
- Not needed for tiny/small

**Second agent review**:
- Required if complexity is risky, or risks contain database/security keywords, or capabilityRoute is second-agent-review

**Reasoning level**:
- high for risky complexity or security/database risks
- auto for everything else

### Step 4: Build the Work Packet prompt

Construct a prompt following this format:

```
Do not edit files yet. Read this Work Packet and the project memory. Identify missing success criteria, risks, verification steps, and human decisions. Then propose a plan.

# Work Packet: <title>

- id: <issueKey or id>
- gate: <current gate>
- complexity: <complexity>
- priority: <priority>
- recommendedAgent: <agent>
- capabilityRoute: <route>
- source: <document path or source ref>

## Intent / Scope
<intent or scope field>

## Success Criteria
<successCriteria field>

## Verification
<verification field>

## Risks
<risks field>

## Required Skills / Project Memory
<requiredSkills field>

## Capability Gate Recommendation
- provider: <provider>
- sessionMode: <session mode>
- worktreeRecommended: <yes/no>
- secondAgentReviewRequired: <yes/no>
- docsGateRequired: <yes/no>
- humanApprovalRequired: <yes/no>

## Work Packet Update Rules
- currentGate: <gate>
- allowedEvidenceFields: successCriteria, verification, risks, requiredSkills, projectMemoryUpdates, planEvidence, diffSummary, reviewEvidence, successChecklist, secondAgentReview, testsRun, verificationEvidence, runtimeEvidence, docsEvidence, unresolvedRisks
- guardedUserApprovalFields: gate, recommendedAgent, capabilityRoute, complexity, priority, humanApproval, progress
- systemManagedFields: linkedSession, reviewerSession, worktreeId, worktreePath, shipped
- Keep the Work Packet current when facts change, but only write fields you can support with observed evidence.
- Do not set gate to shipped or mark the work complete; final promotion remains a user action.

## Stop Conditions
- Stop before code edits if success criteria, risks, verification, or approvals are incomplete.
- Do not make database changes without explicit human approval.
- Do not mark the Work Packet shipped or completed; leave final promotion to the user.
```

If the Work Packet mentions frontend/UI keywords (frontend, ui, ux, layout, css, style, visual, screenshot, browser, responsive, mobile, desktop, dom), append:

```
## Frontend Visual Verification
- required: yes
- Before Verification Gate, inspect the rendered UI with an available browser, screenshot, DOM, or Playwright-capable tool.
- When the Nimbalyst desktop app is running in dev mode, prefer: npm run agent-work-os:visual-check -- --label <id>
- Check both desktop and mobile-sized viewports when the change affects layout or interaction.
- Record what was inspected in verificationEvidence or runtimeEvidence.
```

### Step 5: Present the launch plan

```
## Launch Plan: <title>

- Provider: <provider>
- Session Mode: <session mode>
- Worktree: <recommended / not needed>
- Second Agent Review: <required / not required>
- Human Approval: <required / not required>
- Reasoning: <level>

### How to launch

Open the Work Packet in the Nimbalyst tracker detail panel and click:
- **"Launch Session"** for a regular session
- **"Launch Worktree"** for isolated worktree session (recommended for this packet)

Nimbalyst will:
1. Create the session with the correct provider and routing metadata
2. Pre-populate the draft input with the Work Packet prompt
3. Create a reviewer session if second-agent review is required
4. Link the session back to the Work Packet
5. Record launch evidence (linkedSession, worktreeId, worktreePath)

### After launching

Link this session to the Work Packet if not already linked:
```
tracker_link_session({ trackerId: "<id>" })
```

Then advance the gate to running:
```
/agent-os-gate <id>
```
```

### Step 6: Offer to show the full prompt

Tell the user: "I can output the full Work Packet prompt for you to copy, or you can let Nimbalyst generate it automatically from the Launch button."

## Important rules

- Do not attempt to create sessions via MCP tools. Session creation requires renderer state management, workstream structures, and draft input — these are handled by the Nimbalyst UI launch flow.
- Always suggest using the Nimbalyst tracker panel Launch buttons.
- After launch, the session should be linked via `tracker_link_session`.
- Gate advancement to `running` should go through `/agent-os-gate` for proper validation.

## Related commands

- `/agent-os-gate <id>` — Check and advance gates
- `/agent-os` — Dashboard overview
- `/agent-os-create` — Create a new Work Packet
- `/design` — Create a plan document (useful for plan evidence)
- `/implement` — Execute a plan with progress tracking
