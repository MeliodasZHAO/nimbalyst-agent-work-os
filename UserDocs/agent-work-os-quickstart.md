# Agent Work OS Quickstart

Use this guide to try the Work Packet workflow in Nimbalyst before any deeper code changes.

## 1. Install the tracker

Copy:

```text
UserDocs/examples/work-packet.yaml
```

to your workspace:

```text
.nimbalyst/trackers/work-packet.yaml
```

Restart Nimbalyst.

## 2. Create a Work Packet

In a document, type:

```text
#work-packet
```

Or open a Markdown document and use:

```text
Actions -> Set Document Type -> Work Packet
```

Full-document Work Packets get a starter body with sections for intent, scope, non-goals, success criteria, verification, risks, routing, review, and docs evidence.

Create one packet for one engineering task.

Use the fields this way:

- `gate`: current workflow gate.
- `complexity`: tiny, small, medium, large, or risky.
- `recommendedAgent`: Codex, Claude Code, mixed, or research-only.
- `capabilityRoute`: default, plan-first, pursue-goal, high-reasoning, or second-agent-review.
- `successCriteria`: observable completion requirements.
- `verification`: commands, screenshots, logs, or manual checks.
- `risks`: database, security, runtime, CI, deploy, destructive command concerns.
- `requiredSkills`: skills or project memory that should be available before running the agent.
- `projectMemoryUpdates`: docs or memory updates expected after the task.
- `humanApproval`: explicit approval for database, security, destructive, or other risky work.
- `planEvidence`: approved plan notes before implementation starts.
- `diffSummary`: changed files and behavior summary for Review Gate.
- `reviewEvidence`: self-review or reviewer findings.
- `secondAgentReview`: required when the packet is risky or requests second-agent review.
- `testsRun`: commands and results collected at Verification Gate.
- `verificationEvidence`: runtime/manual verification notes.
- `docsEvidence`: Docs Gate decision or documentation links.
- `unresolvedRisks`: known remaining risks or "none".
- `linkedSession`: session launched from the packet.
- `worktreeId` / `worktreePath`: worktree launch evidence when isolation is used.

## 3. Use the first prompt

Before letting an agent edit files, start with:

```text
Do not edit files yet. Read this Work Packet and the project memory. Identify missing success criteria, risks, verification steps, and human decisions. Then propose a plan.
```

## 4. Pick the agent route

Use Codex for:

- backend logic
- tests
- CI
- runtime diagnosis
- review

Use Claude Code for:

- UI
- UX copy
- interaction design
- spec refinement

Use mixed agents for:

- UI implementation plus Codex review
- backend implementation plus Claude UX review
- risky work that needs second opinion

## 4a. Configure managed routing

Open:

```text
Settings -> Agent Work OS
```

Use the User tab for system-level defaults across projects. Use the Project tab for overrides that only apply to the current workspace.

The visual editor supports:

- `controlMode`: manual, assisted, or autopilot.
- `defaultAgent`: auto, Codex, Claude Agent, mixed agents, or research-only.
- `defaultCapabilityRoute`: auto, plan-first, pursue-goal, high-reasoning, or second-agent-review.
- `defaultReasoning`: auto, low, medium, high, or max.
- `defaultCollaborationMode`: solo, plan + implement, implement + review, frontend repair, risky change, or research-only.
- provider enable toggles and connection tests for agent providers.
- role defaults for planner, implementer, reviewer, verifier, frontend inspector, and researcher.
- mobile permission policy.

Role default model and reasoning menus are capability-aware. When a role is set to Codex, Claude Agent, mixed agents, or research-only, the model and reasoning options are filtered to the concrete enabled agent providers that can actually honor that choice. Auto, mixed, and research-only keep model selection managed unless a concrete provider capability exposes safe explicit model choices.

Use the JSON tab for exact configuration import/export. JSON is validated before saving.

When you launch a session from a Work Packet, Nimbalyst merges:

```text
User Agent Work OS settings
  -> Project Agent Work OS settings
    -> Work Packet fields
```

The launch prompt records the final recommendation, and supported providers receive the recommended reasoning effort through session metadata.

After launch, reopen the Work Packet detail panel to see Launch Evidence. It lists the implementation session, reviewer session when created, reviewer status, and the worktree id/path so you can jump back to the right agent run.

The generated first prompt includes `Work Packet Update Rules`. Agents can update evidence fields such as `planEvidence`, `diffSummary`, `reviewEvidence`, `testsRun`, `verificationEvidence`, and `docsEvidence` when they have real evidence. In the Work Packet detail panel, use `Evidence Writeback` to paste observed facts into an allowlisted field through a guarded selector. Guarded fields such as `gate`, `humanApproval`, routing, progress, and final shipped status remain user-controlled.

## 5. Prefer worktrees

Use worktrees for:

- parallel changes
- medium, large, or risky packets
- experiments
- changes that may require review before merge

Do not run two agents that edit the same files in the same worktree.

## 6. Review before verification

At Review Gate, collect:

- changed files
- `diffSummary`
- self-review
- `reviewEvidence`
- `secondAgentReview` when required
- unresolved comments

At Verification Gate, collect:

- `testsRun`
- lint/build output
- screenshots for UI work
- logs for runtime work
- `verificationEvidence`

For frontend repair packets, the generated prompt calls out `Frontend Visual Verification`. Use the agent's available browser, screenshot, DOM, or Playwright tools to inspect the rendered UI, including mobile and desktop viewport sizes when relevant. Record the observed result or any tool limitation in `verificationEvidence` or `runtimeEvidence`.

If the desktop app is running in dev mode, capture live desktop/mobile evidence with:

```text
npm run agent-work-os:visual-check -- --label work-packet-id
```

The command saves screenshots and a JSON report under `e2e_test_output/agent-work-os-visual/`.

Frontend-related Work Packet detail panels also show a Visual Evidence card with:

- `Run`: in development mode, capture desktop/mobile screenshots from the already-open Nimbalyst window.
- `Copy`: copy the same command for a terminal or agent-run workflow.

The in-app runner is a development verification tool. Packaged desktop builds show a clear unavailable message instead of running the helper.

Use the `Evidence Writeback` card to save the generated report path into `runtimeEvidence` or `verificationEvidence`. The card does not expose gate, approval, session, worktree, progress, or shipped-state fields.

## 7. Do the Docs Gate

Before marking the packet shipped, decide whether to update:

- `AGENTS.md`
- `CLAUDE.md`
- README/docs
- project memory
- incident notes
- custom tracker schema

If the task revealed a future gotcha, write it down. Do not leave it buried in a transcript.

Use `docsEvidence` to record whether docs or project memory changed, and keep `projectMemoryUpdates` current when the packet requires a memory update.

## 8. Mobile and voice

Use mobile and voice to keep agents moving:

- answer waiting prompts
- approve small plans
- queue next packets
- review small diffs

For linked risky Work Packets, desktop review remains the control point. Mobile approval of plans, tool permissions, or commits is blocked when required gate evidence or human approval is missing, and the desktop app shows the reason.

When desktop sync is paired, the User-scope Agent Work OS mobile permission policy is included in the encrypted settings sync payload. Android stores that synced policy as its system-level default. Project-scope Agent Work OS mobile permission policy is included in the encrypted project config and stored against that Android project, so project overrides can be stricter or more flexible than the system default. Local Android edits remain available for quick adjustment, but a later desktop settings sync can refresh the synced policy again.

Do not use mobile or voice to bypass risky-work review, database approval, or verification evidence.

## 9. Desktop app packaging

Run these Agent Work OS shortcuts from the repository root.

Nimbalyst is an Electron desktop app. For Windows installer builds, use:

```text
npm run agent-work-os:desktop:win
```

For a local Windows desktop build that runs without the browser and does not require installer signing tools, use:

```text
npm run agent-work-os:desktop:win-dir
```

The local desktop executable is:

```text
packages/electron/release/win-unpacked/Nimbalyst.exe
```

The Windows artifact is emitted under:

```text
packages/electron/release/
```

For local unpacked inspection:

```text
npm run agent-work-os:desktop:unpack
```

## 10. Android companion install

For a local debug APK:

```text
npm run agent-work-os:android:debug
```

Install on a connected Android device:

```text
npm run agent-work-os:android:install
```

For release distribution, use a signed release build with your Android signing configuration and distribute the APK through your chosen internal channel. The app stores Agent Work OS config and mobile permission policy in Room, with migration support from database version 1 to 2.

For an unsigned local release APK:

```text
npm run agent-work-os:android:release
```

For a signed release APK, initialize local-only signing material:

```text
npm run agent-work-os:android:release-signing:init
npm run agent-work-os:android:release-signing:verify
```

The init command creates a local keystore under `packages/android/keystores/` and writes the required `NIMBALYST_RELEASE_*` values to `packages/android/local.properties`. Do not commit those files. When all values are present, `npm run agent-work-os:android:release` emits a signed APK.

After pairing the Android app, open:

```text
Settings -> Agent Work OS
```

Choose one of the mobile permission presets:

- `Strict`: keep plan, tool, commit, and risky approvals on desktop.
- `Balanced`: allow low-risk plan and tool approvals from Android.
- `Flexible`: also allow low-risk commit approvals from Android.
- `Custom`: unlock each approval switch individually.

Custom switches cover plan approvals, tool permissions, commit approvals, database risk, security risk, destructive risk, and whether shipped-state promotion requires desktop review.

If the device is paired with desktop sync, Android receives the desktop User-scope mobile permission policy through encrypted settings sync and Project-scope mobile permission policy through encrypted project config sync. Use Android Settings for on-device adjustments; the next desktop settings sync can refresh the synced policy again.
