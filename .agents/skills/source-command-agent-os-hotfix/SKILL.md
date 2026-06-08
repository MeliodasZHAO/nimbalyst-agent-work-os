---
name: "source-command-agent-os-hotfix"
description: "Quick-path Work Packet for small bug fixes — create and enter running gate in one step, skipping plan"
---

# /agent-os-hotfix — Quick Bug Fix

Fast-track a small fix. Creates a Work Packet with `complexity: small` and enters the `running` gate immediately, skipping the plan gate. For urgent bug fixes where full gate progression overhead is counterproductive.

## Usage

```
/agent-os-hotfix <description of the fix>
```

## When to use

- Urgent bug fix, well-understood scope
- 1-3 files affected
- No database, security, or destructive risk
- You know what to change and just need tracking

## When NOT to use

- Any mention of database, migration, schema, security, auth, tokens, credentials, destructive operations, deployment, production
- Scope is unclear or multi-file refactor
- Change could break other features
- Use `/agent-os-create` for these cases instead

## Execution steps

### Step 1: Parse the description

Extract:
- **title**: concise imperative sentence (e.g., "Fix import path typo in UserService")
- **successCriteria**: infer the observable fix
- **verification**: infer how to verify (test passes, error goes away, etc.)

### Step 2: Risk check (MANDATORY)

Scan the description for risk keywords:
- database, db, schema, migration, index, seed, backfill, truncate
- security, auth, authentication, authorization, permission, secret, token, key, credential
- destructive, remove, delete, reset, force, overwrite
- ci, release, deploy, deployment, production, runtime, server

**If ANY risk keyword is found: REFUSE the hotfix.** Say:

```
This change has [risk type] risk and cannot use the hotfix path.
Use `/agent-os-create <description>` for full gate progression with proper risk tracking and human approval.
```

### Step 3: Create the Work Packet

```
tracker_create({
  type: "work-packet",
  title: "<extracted title>",
  status: "running",
  priority: "high",
  linkSession: true,
  fields: {
    gate: "running",
    complexity: "small",
    risks: "",
    successCriteria: "<extracted>",
    verification: "<extracted>",
    recommendedAgent: "codex",
    capabilityRoute: "default",
    intent: "<full description>"
  }
})
```

### Step 4: Output summary and begin

```
## Hotfix Work Packet Created

- ID: <id>
- Title: <title>
- Gate: running (fast-tracked)
- Complexity: small
- Session: linked

You can start working on the fix now. When done:
1. Run tests and collect evidence: /agent-os-gate <id>
2. The gate skill will help you advance through review -> verification -> docs
```

Then proceed to work on the fix directly.

### Step 5: After fixing

Remind the user (or yourself) to collect evidence:

```
Fix applied. Next: /agent-os-gate <id> to collect review and verification evidence.
```

## Related commands

- `/agent-os-gate <id>` — Advance through remaining gates after the fix
- `/agent-os-tweak` — Even lighter path for trivial changes (typos, config)
- `/agent-os-create` — Full Work Packet creation for complex/risky changes
- `/agent-os` — Dashboard overview
