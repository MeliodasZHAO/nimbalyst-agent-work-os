---
name: "source-command-agent-os-gate"
description: "Inspect and advance Work Packet quality gates with evidence collection and guard validation"
---

# /agent-os-gate — Gate Inspection and Transition

Core quality gate skill. Reads a Work Packet's current gate, shows checklist status, helps collect missing evidence, and validates transitions before allowing gate advancement.

## Usage

```
/agent-os-gate [work-packet-id]
```

If no ID is provided, attempts to find the Work Packet linked to the current session.

## Execution steps

### Step 1: Resolve the Work Packet

If an argument is provided, use it as the reference. Otherwise, find the linked Work Packet:

```
mcp__nimbalyst-extension-dev__database_query({
  query: "SELECT metadata FROM ai_sessions ORDER BY created DESC LIMIT 1"
})
```

Extract `linkedTrackerItemIds` from the metadata JSON. Use the first one.

Then retrieve the full Work Packet:

```
tracker_get({ id: "<reference>" })
```

If not found, tell the user: "No Work Packet found. Use `/agent-os` to see active packets or `/agent-os-create` to make one."

### Step 2: Determine the current gate

Read the `gate` field (or `status` field if `gate` is absent). Valid gates in order:

```
capability -> spec -> plan -> running -> review -> verification -> docs -> shipped
```

### Step 3: Evaluate gate checklist

Check each field for the current gate. A field "has content" when its text value is non-empty after trimming.

#### Gate: capability
- [required] successCriteria
- [required] verification
- [optional] risks
- [required IF humanApprovalRequired] humanApproval

#### Gate: spec
- [required] successCriteria
- [required] verification
- [optional] risks

#### Gate: plan
- [required] successCriteria
- [required] verification
- [required] planEvidence
- [required IF humanApprovalRequired] humanApproval

#### Gate: running
- [required] linkedSession OR linked session in system metadata
- [optional, recommended if complexity >= medium] worktreePath or worktreeId

#### Gate: review
- [required] diffSummary
- [required] reviewEvidence
- [optional] successChecklist
- [required IF secondAgentReviewRequired] secondAgentReview
- [optional] unresolvedRisks

#### Gate: verification
- [required] testsRun
- [required] verificationEvidence
- [optional] runtimeEvidence

#### Gate: docs
- [required] docsEvidence
- [required IF docsGateRequired] projectMemoryUpdates

#### Gate: shipped
- All of the above must be complete
- [warning] Final promotion to shipped is a user action

**Determining conditional requirements:**

`humanApprovalRequired` is true when risks contain: database, db, schema, migration, security, auth, token, credential, destructive, remove, delete, force, overwrite.

`secondAgentReviewRequired` is true when: complexity=risky, OR risks contain database/security keywords, OR capabilityRoute=second-agent-review.

`docsGateRequired` is true when: complexity >= medium, OR risks are non-empty, OR requiredSkills is non-empty.

### Step 4: Present the checklist

Output:

```
## Gate: <current gate>

- [x] Success criteria (complete)
- [ ] Verification plan (MISSING - required)
- [x] Risk notes (complete)
- [ ] Human approval (MISSING - required: database risk detected)

Status: BLOCKED
Missing: Verification plan, Human approval
```

### Step 5: Offer actions

Present the user with options:

**If blocked:**
- "I can help collect evidence for: [list of missing allowed fields]"
- "Human-only fields that need attention: [list of missing guarded/forbidden fields]"

**If ready:**
- "Ready to advance to [next gate]. Shall I proceed?"

**Always available:**
- "Roll back to [previous gate]"
- "Show routing recommendation"

### Step 6: Collect evidence (when requested)

For each missing evidence field, use the appropriate method:

**diffSummary**: Run `git diff --stat` and `git diff --name-only`, then summarize what changed and why. Write with:
```
tracker_update({ id: "<ref>", fields: { diffSummary: "<summary text>" } })
```

**testsRun**: Run the project's test command (look at package.json scripts for `test`, `test:unit`, etc.), capture the output, summarize pass/fail. Write with:
```
tracker_update({ id: "<ref>", fields: { testsRun: "<test output summary>" } })
```

**reviewEvidence**: Perform a self-review of the current diff. Focus on: correctness, security, performance, edge cases. Or invoke `/code-review` for a structured review. Write the findings.

**verificationEvidence**: Describe what was verified and how. Include: what was tested, what was observed, any remaining concerns.

**runtimeEvidence**: If the Work Packet mentions frontend/UI, run:
```bash
npm run agent-work-os:visual-check -- --label <work-packet-id>
```
Or capture logs from the running app. Record the paths or observations.

**docsEvidence**: Check if documentation was updated. Record the decision: "Updated CLAUDE.md section X" or "No docs impact for this change."

**planEvidence**: Summarize the implementation plan. Reference the plan document if one was created via `/design`.

**successChecklist**: Go through each success criterion and mark pass/fail with evidence.

**unresolvedRisks**: List any known remaining risks, or write "none" if all risks are mitigated.

### Step 7: Advance gate (when requested)

To advance from gate A to gate B:

1. For every gate between A and B (inclusive of A, exclusive of B), verify all required checks pass.
2. If any required check fails, REFUSE and list what's missing.
3. If all pass, propose the update:
   ```
   I will advance the gate from "<current>" to "<next>".
   This will call: tracker_update({ id: "<ref>", fields: { gate: "<next>" } })
   ```
4. Wait for user confirmation (gate is a guarded field).
5. Execute the update.

### Step 8: Roll back gate (when requested)

Rolling back is always allowed without validation:

```
tracker_update({ id: "<ref>", fields: { gate: "<previous gate>" } })
```

### Step 9: Output context block

After any action, output:

```
## Agent Work OS Context
- Focused: <id> "<title>" (gate: <gate>, <status>)
- Session Link: <linkedSession or "none">
- Next: <recommended next step>
```

## Field classification

### Allowed fields (agent can write directly with evidence)
successCriteria, verification, risks, requiredSkills, projectMemoryUpdates, planEvidence, diffSummary, reviewEvidence, successChecklist, secondAgentReview, testsRun, verificationEvidence, runtimeEvidence, docsEvidence, unresolvedRisks

### Guarded fields (propose change, wait for user confirmation)
gate, recommendedAgent, capabilityRoute, complexity, priority, humanApproval, progress

### Forbidden fields (never write)
linkedSession, reviewerSession, worktreeId, worktreePath, shipped

## Hard rules

1. **Never set gate to `shipped`.** Say: "Final promotion to shipped is a user action. Please update the gate in the Nimbalyst tracker panel."
2. **Never write `humanApproval`.** Say: "This field requires human input. Please fill it in directly."
3. **Never fabricate evidence.** Only write fields when you have concrete observed information from the plan, diff, tests, logs, screenshots, or review.
4. **Never skip intermediate gates.** Advancing from spec to review requires plan and running gates to also pass their checks.
5. **Always propose guarded field changes** and wait for user confirmation before executing.

## Related commands

- `/agent-os` — Dashboard overview
- `/agent-os-launch <id>` — Launch session from Work Packet
- `/agent-os-create` — Create a new Work Packet
- `/write-tests` — Generate tests (useful for testsRun evidence)
- `/code-review` — Structured review (useful for reviewEvidence)
- `/commit` — Commit changes (useful before collecting diffSummary)
