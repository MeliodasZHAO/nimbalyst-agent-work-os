---
description: Spin off a sibling AI session to keep working on a side task in parallel
---

# /launch-new-session Command

Spin off a sibling AI session that runs in parallel under the same workstream as the
current session. Use this when the user wants to fork off focused work without losing
context — e.g. "/launch-new-session and keep going on the tests".

A common use case is **escaping a long context**: the current session has accumulated
too much history to keep going productively, so kick the remaining work off into a
fresh session.

## How it works

A sibling session shares a **workstream** with the current session. That means files
edited, tabs, and `get_workstream_overview` span both sessions. If the current session
is not yet part of a workstream, calling `spawn_sibling` will automatically create a
workstream container and reparent the current session under it. From the user's
sidebar this looks like the current session collapsing into a new workstream group
that contains both sessions.

By default the call is **fire-and-forget**: the current session is not notified when
the spawned session completes. Pass `notifyOnComplete: true` only when the caller
specifically wants to wait for the result.

## Steps

When the user types `/launch-new-session [task description]`:

1. **Construct a self-contained handoff brief.** The new session will not see this
   conversation, so the brief must stand on its own. Include:
   - The task in 1-2 sentences (what to do, what success looks like)
   - Relevant file paths the new session should look at
   - Constraints or decisions already made in this session that affect the work
   - This pointer at the bottom: "For more context on what led to this task, call
     `get_session_summary` with `sessionId=<the current session id>`."

2. **Decide on `useWorktree`.** Default to `false` (same workspace). Only set `true`
   when the user's phrasing implies isolation — e.g. "in a new worktree", "in
   parallel without conflicts", or "without touching my current branch".

3. **Decide on `notifyOnComplete`.** Default to `false` (fire-and-forget). Only set
   `true` if the user's phrasing implies they want the result back in this session
   ("...and tell me when it's done", "...and bring back the answer").

4. **Call `spawn_sibling`** with:
   - `prompt`: the handoff brief from step 1
   - `title`: a short descriptive title (e.g. "Finish auth tests")
   - `useWorktree`: per step 2
   - `notifyOnComplete`: per step 3 (omit to use the default)

5. **Report back to the user** with:
   - The new session id
   - A one-line summary of what was handed off
   - A note that the current session is now part of a workstream (if `promotedParent`
     came back true in the tool result)

## Notes

- Do NOT pre-summarize the parent session in the prompt beyond what's needed to act on
  the task. The new session can call `get_session_summary` if it needs more.
- Do NOT spawn a sibling for trivial follow-ups that the current session can handle
  directly — siblings are for parallel work or context-escape hand-offs.
- The new session inherits the workspace; cross-workspace spawning is not supported.
