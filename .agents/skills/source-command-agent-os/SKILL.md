---
name: "source-command-agent-os"
description: "Agent Work OS dashboard — scan active Work Packets, show gate status, recommend next actions, support resumption"
---

# /agent-os — Agent Work OS Dashboard

Main entry point for the Agent Work OS workflow. Scans all active Work Packets, evaluates gate readiness, and recommends the next action for each. Use this at the start of a session to see where things stand, or mid-session to check progress.

## When to use

- Starting a new session and want to see what's in progress
- Returning after an interruption
- Checking which Work Packets are blocked
- Deciding what to work on next

## Execution steps

### Step 1: Scan active Work Packets

Call:

```
tracker_list({ type: "work-packet", limit: 50 })
```

### Step 2: Filter and evaluate

From the results, exclude any item where the `gate` field (or `status` field) equals `shipped`.

For each remaining Work Packet, evaluate the current gate's checklist by checking whether evidence fields have text content:

**Gate: spec**
- successCriteria (required)
- verification (required)
- risks (optional)

**Gate: plan**
- successCriteria (required)
- verification (required)
- planEvidence (required)
- humanApproval (required IF risks contain database/security/destructive/runtime keywords)

**Gate: running**
- linkedSession field has a value (required)
- worktreePath or worktreeId has a value (optional, recommended for medium+ complexity)

**Gate: review**
- diffSummary (required)
- reviewEvidence (required)
- successChecklist (optional)
- secondAgentReview (required IF complexity=risky OR risks contain database/security keywords OR capabilityRoute=second-agent-review)
- unresolvedRisks (optional)

**Gate: verification**
- testsRun (required)
- verificationEvidence (required)
- runtimeEvidence (optional)

**Gate: docs**
- docsEvidence (required)
- projectMemoryUpdates (required IF complexity >= medium OR risks are non-empty OR requiredSkills is non-empty)

Classify each Work Packet as:
- **ready** — all required checks for the current gate pass
- **blocked** — one or more required checks are missing (list them)
- **warning** — optional checks are missing but not blocking

### Step 3: Check linked sessions

For any Work Packet with a `linkedSession` field value, verify the session exists:

```
mcp__nimbalyst-extension-dev__database_query({
  query: "SELECT id, title, provider, created FROM ai_sessions WHERE id = $1",
  params: ["<linkedSession value>"]
})
```

### Step 4: Present the dashboard

Output a table:

```
## Agent Work OS Dashboard

| # | ID | Title | Gate | Status | Next Action |
|---|-----|-------|------|--------|-------------|
| 1 | wpkt_... | ... | review | blocked: diff summary | Collect evidence |
| 2 | wpkt_... | ... | plan | ready | Launch session |
```

### Step 5: Recommend next action

For each Work Packet, recommend one of:

- **"Continue in session [id]"** — linkedSession exists and has been used
- **"Advance to [next gate]"** — current gate checks are satisfied
- **"Collect missing evidence: [field list]"** — required fields are empty
- **"Launch new session"** — at plan/running gate with no linked session
- **"Create plan first"** — at plan gate with empty planEvidence

### Step 6: Focus or select

- If only 1 active Work Packet exists, auto-focus it and show full gate checklist
- If multiple exist, present the table and ask user to pick one
- If none exist, say "No active Work Packets. Use `/agent-os-create` to start one."

### Step 7: Output context block

After presenting results, always output:

```
## Agent Work OS Context
- Active Work Packets: <count>
- Focused: <id> "<title>" (gate: <gate>, <status>)
- Session Link: <session_id or "none">
- Next: <recommended action>
```

## Chaining

- Select a Work Packet for gate inspection → `/agent-os-gate <id>`
- Launch a session → `/agent-os-launch <id>`
- Create a new Work Packet → `/agent-os-create <description>`
- Quick fix → `/agent-os-hotfix <description>`
- Tiny tweak → `/agent-os-tweak <description>`

## Important rules

- This skill is **read-only**. Never modify any tracker item state.
- Never guess or fabricate session IDs or evidence content.
- If the tracker_list call returns no items of type "work-packet", the schema may not be installed. Tell the user: "No Work Packet tracker found. Copy `UserDocs/examples/work-packet.yaml` to `.nimbalyst/trackers/work-packet.yaml` and restart Nimbalyst."
