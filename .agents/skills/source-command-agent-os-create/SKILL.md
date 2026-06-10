---
name: "source-command-agent-os-create"
description: "Create a Work Packet from a natural language description with auto-detected complexity, risks, and routing"
---

# /agent-os-create — Create Work Packet

Parse a natural language task description into a structured Work Packet with auto-detected complexity, risks, and agent routing. The created Work Packet starts at the `spec` gate.

## Usage

```
/agent-os-create <task description>
```

## Execution steps

### Step 1: Parse the description

Extract from the user's description:

- **title**: concise imperative sentence, max 80 characters
- **intent**: the full description as provided
- **successCriteria**: infer observable outcomes. If ambiguous, ask the user with AskUserQuestion before creating.
- **verification**: infer how to verify (tests, visual check, logs, manual inspection). If ambiguous, ask.

### Step 2: Auto-detect complexity

Scan the description for heuristic signals:

| Complexity | Signals |
|-----------|---------|
| `tiny` | single file, typo, config change, one-liner, copy/text tweak |
| `small` | 1-3 files, well-understood change, no schema or wire-format changes |
| `medium` | 3-10 files, new component/feature, some architectural decisions |
| `large` | 10+ files, cross-cutting concern, new subsystem, refactor |
| `risky` | any mention of database, migration, security, auth, production, destructive operations |

Default to `medium` if unclear.

### Step 3: Auto-detect risks

Scan the description for risk keywords using these patterns:

- **database**: database, db, schema, migration, index, seed, backfill, truncate, delete, cleanup, stored data
- **security**: security, auth, authentication, authorization, permission, secret, token, key, credential
- **runtime**: ci, release, deploy, deployment, production, runtime, server
- **destructive**: destructive, remove, delete, reset, force, overwrite

Combine detected risks into a text summary. Example: "database risk (migration), runtime risk (deployment)"

### Step 4: Determine routing

Based on complexity and risks:

- **recommendedAgent**:
  - `codex` for backend logic, tests, CI, runtime diagnosis (default)
  - `claude-code` for UI, UX, design, research, investigation-heavy work
  - `mixed` for tasks needing both implementation and cross-agent review
  - `research-only` for pure investigation with no code changes

- **capabilityRoute**:
  - `default` for tiny/small with no risks
  - `plan-first` for medium+ complexity (default for most tasks)
  - `high-reasoning` for risky complexity or security/database risks
  - `second-agent-review` for risky tasks or when dual review is warranted
  - `pursue-goal` only when user explicitly asks for autonomous execution

### Step 5: Create the Work Packet

Call:

```
tracker_create({
  type: "work-packet",
  title: "<extracted title>",
  status: "spec",
  priority: "<inferred: low/medium/high/critical>",
  linkSession: true,
  fields: {
    gate: "spec",
    complexity: "<detected>",
    risks: "<detected risk text or empty>",
    successCriteria: "<extracted>",
    verification: "<extracted>",
    recommendedAgent: "<determined>",
    capabilityRoute: "<determined>",
    intent: "<full description>"
  }
})
```

Priority inference: "critical"/"urgent"/"blocking" in description -> high; "nice to have"/"low priority" -> low; default -> medium.

### Step 6: Present the result

Show a summary:

```
## Work Packet Created

- ID: <id>
- Title: <title>
- Gate: spec
- Complexity: <complexity>
- Risks: <risks or "none detected">
- Recommended Agent: <agent>
- Capability Route: <route>
- Human Approval Required: <yes/no>

Next steps:
- Review and refine the spec: /agent-os-gate <id>
- Launch a session when ready: /agent-os-launch <id>
```

## Important rules

- Gate is ALWAYS `spec` at creation. Never skip to plan or running, even if the user asks. Gate progression must go through `/agent-os-gate`.
- If complexity is detected as `risky`, warn the user: "This Work Packet has [risk type] risk. It will require explicit human approval before advancing past Capability/Plan gates."
- Never fabricate `humanApproval` content. That field is exclusively for the human to fill.
- If the user's description is too vague to extract successCriteria or verification, ask them to clarify before creating.

## Quick paths

For small urgent fixes, suggest `/agent-os-hotfix` instead. For trivial tweaks, suggest `/agent-os-tweak`.

## Related commands

- `/agent-os` — View all active Work Packets
- `/agent-os-gate <id>` — Inspect and advance gates
- `/agent-os-launch <id>` — Launch an agent session
- `/track` — Create a generic tracker item (bug, task, idea) without Work Packet structure
