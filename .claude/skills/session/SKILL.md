---
name: session
description: Generate a daily development session report in sessions/ directory. Use when wrapping up work for the day or when asked to summarize what was done.
disable-model-invocation: true
allowed-tools: Bash(git log *) Bash(git diff *) Bash(npm test) Read Glob Write
argument-hint: [topic-override]
---

Create a development session report for today.

## Steps

1. Run `git log --oneline` to find commits since the last session report in `sessions/`
2. Read the latest file in `sessions/` to understand the format and what was previously listed as "not done yet"
3. Run `git diff --stat {last-session-commit}..HEAD` to get file change statistics
4. Run `npm test` to get the current test count
5. Create a new file `sessions/YYYY-MM-DD-{short-topic}.md` where the date is today and the topic is a 2-4 word slug describing the main work done (or use $ARGUMENTS if provided)

## Report format

```markdown
# YYYY-MM-DD — Title

## What was done

One paragraph summary.

## Commits

| Hash | Message |
|------|---------|
| `abc1234` | Commit message here |
| `def5678` | Another commit |

## Changes

### Feature/section name
- Bullet points of what changed
- Be specific: file names, function names, route paths

### Files changed
Summary from `git diff --stat` — total files changed, insertions, deletions.

## Tests
N total (was M). Run: `npm test`
New tests:
- List new test descriptions

## What's not done yet
- Carry forward undone items from previous session
- Remove items that were completed
- Add any new items discovered
```

## Rules

- Be factual — describe what the code does, not intentions
- Include function names, routes, file paths where relevant
- The "not done yet" section should be an honest backlog — carry forward from previous session, remove completed items, add new ones
- Always include the commit hash table — these are anchors for navigating history later
- After creating the file, stage and commit it with message "Add session report: YYYY-MM-DD" but do NOT push — ask the user first
