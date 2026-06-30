# AI-Operated Workflow Wizard

## Goal

Prevent AI agents from treating `.workflow` as optional reference text.

The wizard is an interactive CMD flow. The AI opens the command, but CMD owns the process. CMD asks one question at a time, the AI answers, and the next step does not start until CMD receives the required answer or artifact.

As of `workflow-v0.3.9`, this is the only supported execution path. The old `run` command is removed so AI agents do not mix the automatic runner with the stateful wizard flow.

As of `workflow-v0.3.10`, wizard output must be readable by non-implementers. Every `start`, `status`, and `resume` response should show the plain-language workflow name, progress count, current step label, blocked reason, next action, and technical run id/state path.

As of `workflow-v0.3.11`, wizard prompts must be prescriptive instead of adaptive. The wizard tells the AI the exact artifact path, file format, required fields, and resume command. For schema-backed JSON artifacts, `resume` validates the JSON and stores the parsed object in workflow context so later `when` conditions can read fields such as `diagnose.confidence`.

## Roles

| Role | Responsibility |
|---|---|
| CMD wizard | Hosts the workflow, asks questions, blocks unsafe progress, records answers and artifacts. |
| Lead AI | Operates the wizard, asks the user when a user choice is required, owns judgment and code edits. |
| 小N | Runs exact low-judgment commands through Hermes when Ollama is available. |
| 小G | Fallback low-judgment worker when 小N is unavailable. |
| Same-level reviewer | Reviews adjacent regression risk after build/test. This is not 小N or 小G work. |
| User | Chooses preferences and approves high-risk or ambiguous decisions. |

## Core Rule

Old mode:

```text
AI reads workflow text
AI decides whether to follow it
```

Wizard mode:

```text
CMD asks the next required question
AI creates the requested artifact in the requested format, or asks the user
CMD blocks until the artifact exists and passes validation
```

No step should advance just because the AI says it remembers the rule.

## Synchronous Flow

The wizard is synchronous by default.

```text
CMD asks one question
AI answers one question
CMD validates the answer
CMD runs or blocks the next step
```

Do not run the Lead AI and a child AI on the same task in parallel. If a task is delegated, the workflow waits for the delegated result before continuing.

## First-Use Flow

```text
AI:
node .workflow/workflow-runner.js wizard

CMD:
No .workflow/config.local.json was found.
Is this the first time using workflow here? [yes/no]

AI:
yes

CMD:
Ask the user which low-model strategy to use:
1. external-free - Hermes 小N first, 小G fallback
2. lead-low-model - create a packet and require explicit low-model handoff

AI asks user, then answers CMD:
1

CMD:
Saved external-free.
```

If config already exists, CMD shows the current strategy and continues with it unless the AI explicitly asks to change it.

## Workflow Selection Flow

```text
CMD:
Choose workflow:
1. feature-dev
2. github-issue-fix
3. pr-review
4. bug-scan

AI:
1

CMD:
Enter feature_request.

AI:
Add a thumbnail read button.

CMD:
Enter feature_keywords, or leave blank.

AI:
thumbnail|read|contextmenu

CMD:
Planned route:
1. collect-status
2. clarify-feature
3. search-existing-code
4. memory-search
5. impact-before-edit
6. implementation-plan
7. implement
8. verify
9. detect-changes
10. adjacent-regression-review
11. closeout-checklist
Start? [yes/no]
```

## Hard Blocking Points

The wizard must block at these points:

| Point | Required before continuing |
|---|---|
| First use | User-selected low-model strategy. |
| `implement` / `fix` | Lead AI completes the code edit and confirms it. |
| `verify` | Build/test command output exists. |
| Structured AI output | JSON artifact exists and includes every required field from `output_schema`. |
| `adjacent-regression-review` | Same-level review artifact exists. |
| Blocking adjacent finding | Lead or user acknowledges, fixes, or explicitly accepts the risk. |
| GitNexus analyze | Only before the normal commit, when a required GitNexus decision needs a fresh index. PostToolUse stale warnings after commit/merge/push are advisory. |
| Closeout | Commit and push are complete unless the user explicitly requested local-only work; after push, `npm run tauri:build` has run with the blocker guard first, unless the user explicitly requested skipping it. |

## Low-Model Paths

### external-free

```text
CMD probes ollama --version
if available: use 小N through Hermes
else: use 小G through Hermes
CMD waits for the result
```

This path can count as completed delegation only after Hermes returns output.

### lead-low-model

```text
CMD creates *.low-model.packet.json
CMD stops with low-model-handoff-required
Lead AI must explicitly hand the packet to a low model
CMD does not count the task as delegated until a result is provided
```

This path must not mean "Lead or same-level model did it instead." If Lead does it directly, the report must say it was not low-model delegation.

## Adjacent Regression Review

This step happens after build/test and change detection.

It is for same-level model review, not 小N or 小G.

Example purpose:

```text
A thumbnail button was added.
Check nearby behavior:
- card click
- right-click context menu
- event propagation
- keyboard/focus behavior
- parent component event forwarding
```

Required output:

```json
{
  "status": "pass | blocked",
  "checked_files": [],
  "adjacent_features_checked": [],
  "blocking_findings": [],
  "suggested_followup_checks": []
}
```

If this artifact is missing, closeout is blocked.

If `status` is `blocked`, closeout is blocked until the Lead fixes it or the user explicitly accepts the risk.

## GitNexus Stats Rule

Run `npx gitnexus analyze` only when a required GitNexus query, impact analysis, or detect_changes result is needed for the next decision and reports a stale index.

A stale warning emitted by a Codex PostToolUse hook after `git commit`, `git merge`, `git push`, or a fast-forward update is advisory. It means the graph may be stale for the next GitNexus query; it is not a closeout gate by itself.

If analyze changes only `AGENTS.md` or `CLAUDE.md` stats:

```text
before commit: include the stats in the same normal commit
after commit: do not create a stats-only commit
```

After commit, merge, push, or fast-forward, use `git status --short` for cleanliness. Do not rerun analyze just to refresh stats or because HEAD advanced.

## Example Full Run

```text
AI:
node .workflow/workflow-runner.js wizard

CMD:
Config found: external-free.
Choose workflow.

AI:
feature-dev

CMD:
Enter feature_request.

AI:
Add thumbnail read button.

CMD:
Start route? [yes/no]

AI:
yes

CMD:
collect-status delegated to 小N.
Result received.

CMD:
implementation-plan requires Lead judgment.
Continue after plan artifact exists.

CMD:
implement is a manual code-edit step.
Complete the edit, then type done.

AI:
done

CMD:
verify will run npm run build through 小N.
Run? [yes/no]

AI:
yes

CMD:
Build passed.
Running detect-changes.

CMD:
adjacent-regression-review requires same-level review.
Provide review artifact path or type start to generate prompt.

AI:
start

CMD:
Prompt generated.
Closeout is blocked until adjacent-regression-review.json exists.
```

## Non-Goals

- The wizard should not edit code.
- The wizard should not choose files to stage.
- The wizard should not invent commit messages.
- The wizard should not run long-lived dev servers by default.
- The wizard should not treat prompt text as completed work.
