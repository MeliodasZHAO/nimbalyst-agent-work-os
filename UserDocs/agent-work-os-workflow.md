# Agent Work OS Workflow for Nimbalyst

This workflow uses Nimbalyst's existing strengths -- plans, custom trackers, agent sessions, worktrees, voice mode, and mobile session control -- to create a higher-level operating layer for Codex and Claude Code.

## Goal

Do not replace Codex or Claude Code. Use Nimbalyst to make every agent run better by improving:

- task specification
- capability routing
- worktree isolation
- review and verification evidence
- project memory updates
- mobile/voice control of waiting agents

## Install the Work Packet tracker

Copy this file into a workspace:

```text
UserDocs/examples/work-packet.yaml -> .nimbalyst/trackers/work-packet.yaml
```

Restart Nimbalyst, then type `#work-packet` in any document to create or reference a Work Packet. For a full-document packet, open a Markdown document and choose `Actions -> Set Document Type -> Work Packet`; Nimbalyst adds the Work Packet frontmatter and starter evidence sections when the document is empty or only has a title.

## Work Packet lifecycle

Use the `gate` field as the workflow status:

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

### Capability Gate

Before launching an agent, decide:

- Which agent should run: Codex, Claude Code, or mixed.
- Whether the task needs plan-first, pursue-goal, high reasoning, or second-agent review.
- Which skills or project memory entries are required.
- Whether the work touches database, security, production runtime, CI, or deployment.

### Spec Gate

Write the Work Packet before code starts:

- intent
- scope
- non-goals
- success criteria
- verification
- risks
- required skills
- docs/project memory impact

First prompt to the agent:

```text
Do not edit files yet. Read this Work Packet and the project memory. Identify missing success criteria, risks, verification steps, and human decisions. Then propose a plan.
```

### Plan Gate

Approve the plan before edits for medium, large, or risky tasks.

The plan should include:

- files likely touched
- implementation approach
- test commands
- review focus
- docs updates
- rollback/cleanup notes

### Running

Launch the agent from the plan or session manager.

From a Work Packet detail panel, use Launch Session or Launch Worktree. Nimbalyst reads the Work Packet fields, merges Agent Work OS settings, chooses a real enabled agent provider, builds the first prompt, links the session back to the packet, and writes launch evidence such as `linkedSession`, `worktreeId`, and `worktreePath` when the packet is file-backed or tracker-backed.

Agent Work OS role defaults are capability-aware. Model and reasoning choices are filtered through the selected agent family, so a Codex role only sees concrete Codex-agent model choices, Claude Agent roles only see Claude Agent-compatible choices, and managed modes keep model selection on Auto.

After launch, the Work Packet detail panel shows Launch Evidence with the implementation session, reviewer session when one exists, and worktree id/path. Reviewer rows include a status badge such as review needed, ready, active, or recorded. Use those rows to jump back into the relevant agent session.

The launch prompt also includes `Work Packet Update Rules`. Agents may keep evidence fields current when they have observed facts from the plan, diff, tests, logs, screenshots, or review. The Work Packet detail panel provides `Evidence Writeback` for saving those facts into allowlisted evidence fields. User-approval fields such as `gate`, `humanApproval`, routing fields, and final shipped promotion stay guarded; system launch fields such as `linkedSession`, `reviewerSession`, `worktreeId`, and `worktreePath` are written by Nimbalyst launch plumbing, not fabricated by the agent.

Recommended routing:

```text
Codex:
  backend logic, tests, CI, runtime diagnosis, review

Claude Code:
  UI, UX copy, interaction design, spec refinement

Mixed:
  Claude implements UI, Codex reviews/tests
  Codex implements backend, Claude reviews UX
```

Use worktrees for medium, large, risky, or parallel work. Avoid letting two agents edit the same files in the same worktree.

The merged routing recommendation is visible in the generated draft prompt under `Agent Work OS Launch Recommendation`. When the selected provider supports effort metadata, recommended reasoning is stored on the session so the agent runtime can apply it.

For `mixed`, `implement-review`, `frontend-repair`, `risky-change`, or second-agent-review routes, Nimbalyst also creates a reviewer session:

- regular workspace launches create a workstream with an implementation child and a reviewer child
- worktree launches create a second flat session in the same worktree
- the reviewer session receives a no-edit review prompt and links back to the implementation session
- the Work Packet records `reviewerSession` when launch evidence can be written back

### Review Gate

Collect evidence:

- `diffSummary`: changed files and behavior summary
- `reviewEvidence`: agent self-review or reviewer findings
- `secondAgentReview`: second-agent review for risky tasks
- `successChecklist`: success criteria checklist
- `unresolvedRisks`: unresolved comments or remaining risks

Reviewer prompt:

```text
Do not edit files. Review the current diff against the Work Packet success criteria, risks, and verification evidence. Findings first, ordered by severity.
```

### Verification Gate

Attach evidence:

- `testsRun`: test, lint, build, or typecheck output
- lint/build output
- screenshots for UI work
- runtime logs
- `verificationEvidence`: manual check notes and observed results
- `runtimeEvidence`: screenshots, logs, or runtime observations

For frontend repair packets, the launch prompt includes `Frontend Visual Verification`. The agent should use whatever visual tool is available in that environment, such as screenshots, DOM inspection, browser automation, or Playwright. It should check desktop and mobile-sized viewports when layout or interaction changed, and write the observed result or any tool limitation into `verificationEvidence` or `runtimeEvidence`.

When the desktop app is already running in dev mode, agents can collect repeatable desktop/mobile screenshots from the live app without launching a second Electron instance:

```text
npm run agent-work-os:visual-check -- --label work-packet-id
```

The command connects over CDP to the running Nimbalyst window, writes screenshots and a result JSON under `e2e_test_output/agent-work-os-visual/`, and those paths can be copied into `runtimeEvidence` or `verificationEvidence`.

For frontend-related Work Packets, the detail panel also shows a Visual Evidence card with the same command, a copy button, and a development-mode `Run` button. `Run` uses an approval-safe fixed runner: it can only invoke the Agent Work OS visual check helper against the already-open Nimbalyst window. Packaged desktop builds do not run this helper and show an unavailable message.

Use `Evidence Writeback` in the detail panel to save those report paths into `runtimeEvidence` or `verificationEvidence`. It only writes evidence fields and blocks gate, approval, routing, session, worktree, progress, and shipped-state fields.

### Docs Gate

Before shipping, decide whether to update:

- `AGENTS.md`
- `CLAUDE.md`
- README/docs
- `.nimbalyst/trackers/`
- project memory documents
- incident notes

If a task reveals a new runtime gotcha, command, project rule, or review checklist item, capture it. Do not leave it only in an agent transcript.

Record the Docs Gate result in `docsEvidence`, even when the decision is that no docs or project memory update is needed.

## Mobile and voice usage

Nimbalyst's mobile app and voice mode are useful when agents are already running and waiting for human input.

Good mobile/voice actions:

- answer an interactive prompt
- approve or reject a plan
- ask a quick follow-up
- queue the next Work Packet
- review a small diff
- wake a paused session

Bad mobile/voice actions:

- approve database changes without reading the plan
- merge or ship changes
- accept large risky diffs without desktop review
- bypass Verification Gate

When an agent session is linked to a Work Packet, voice mode includes Work Packet gate/risk context in forwarded interactive prompts. Mobile approvals for risky linked Work Packets are blocked for plan approval, tool permission approval, and commit approval until desktop review and required gate evidence are complete. Blocked mobile approvals also show a desktop warning so the user can see why the remote action did not proceed.

Mobile permission policy is configured in `Settings -> Agent Work OS`:

- `strict`: desktop review for plans, tools, commits, and risky approval.
- `balanced`: allow low-risk plan and tool approvals from Android; keep commit and high-risk approvals on desktop.
- `flexible`: allow low-risk commits from Android; keep database/security/destructive approval on desktop.
- `custom`: use the JSON editor to tune individual permissions.

On Android, the same policy is available in Settings. The mobile app stores the selected preset and custom switches locally so you can make the remote control surface stricter or more flexible without returning to the desktop settings panel.

When desktop sync is paired, the User-scope Agent Work OS mobile permission policy is sent to Android inside the encrypted settings sync payload and saved as the Android system-level policy. Project-scope mobile permission policy is sent inside the encrypted project config payload and saved against that Android project, allowing a workspace to override the system default. Local Android edits remain available for quick adjustment, but a later desktop settings sync can refresh the synced policy from desktop.

## First practical test

Create two Work Packets in a low-risk repo:

1. Small backend/test task routed to Codex.
2. Small UI/documentation task routed to Claude Code.

Success means:

- each packet has a gate status
- each agent session is linked to the packet
- each task uses a separate worktree
- review/test evidence is recorded
- one project memory update is proposed
