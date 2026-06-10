---
name: "source-command-agent-os-tweak"
description: "Quick-path Work Packet for trivial changes — typos, config adjustments, copy edits — create and run in one step"
---

# /agent-os-tweak — Trivial Change

Lightest-weight Work Packet path. For truly trivial changes: typos, config values, copy/text edits, comment fixes, single-line adjustments. Creates a Work Packet with `complexity: tiny` and enters `running` immediately.

## Usage

```
/agent-os-tweak <description of the change>
```

## When to use

- Typo fix
- Config value change
- Copy/text adjustment
- Comment or documentation wording fix
- Single-line code change with obvious correctness

## When NOT to use

- Anything that touches more than 1-2 files
- Anything with database, security, deployment, or destructive implications
- Use `/agent-os-hotfix` for small bug fixes
- Use `/agent-os-create` for anything larger

## Execution steps

### Step 1: Parse the description

Extract:
- **title**: concise description (e.g., "Fix typo in README badge URL")
- **successCriteria**: the expected change
- **verification**: simple check (e.g., "visually confirm the text is correct")

### Step 2: Risk check (MANDATORY)

Same as `/agent-os-hotfix`. Scan for risk keywords:
- database, db, schema, migration, security, auth, token, credential
- destructive, remove, delete, reset, force, overwrite
- ci, release, deploy, production, runtime, server

**If ANY risk keyword is found: REFUSE.** Redirect to `/agent-os-create`.

### Step 3: Create the Work Packet

```
tracker_create({
  type: "work-packet",
  title: "<extracted title>",
  status: "running",
  priority: "medium",
  linkSession: true,
  fields: {
    gate: "running",
    complexity: "tiny",
    risks: "",
    successCriteria: "<extracted>",
    verification: "<extracted>",
    recommendedAgent: "codex",
    capabilityRoute: "default",
    intent: "<full description>"
  }
})
```

### Step 4: Output and begin

```
## Tweak Work Packet Created

- ID: <id>
- Title: <title>
- Gate: running (fast-tracked, tiny complexity)
- Session: linked

Make the change. When done: /agent-os-gate <id> to wrap up.
```

Proceed with the change.

### Step 5: After the change

For tiny changes, the gate progression can be lightweight:
- `review`: a brief self-check of the diff is sufficient
- `verification`: "visually confirmed" or "typecheck passes" is enough
- `docs`: "no docs impact" is the expected answer

```
Change applied. Next: /agent-os-gate <id> to collect minimal evidence and close out.
```

## Related commands

- `/agent-os-gate <id>` — Advance through remaining gates
- `/agent-os-hotfix` — Slightly heavier path for small bug fixes
- `/agent-os-create` — Full path for complex changes
- `/agent-os` — Dashboard overview
