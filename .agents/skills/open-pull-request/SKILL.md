---
name: open-pull-request
description: The steps every pull request in this repository goes through before it opens, in order. Verify, then pstack `correct`, then pstack `no-comments`, then Thermos, then a stacked pull request with the six-section body. Use before opening or updating any pull request.
---

# Open a pull request

Every pull request goes through these steps in this order. A step that finds something sends you back to the first step after the fix.

The pstack and Thermos skills named below set `disable-model-invocation`, so the Skill tool does not list them. Read each one from the path given.

## 1. Verify

```bash
vp run verify
```

Run the matching `verify-*` skill for the code the change touches. Drive the changed feature with `vp run evidence`.

## 2. Correct

Read `.agents/skills/correct/SKILL.md` and follow it over this branch's work. Find each mistake that happened twice, in the commits, the review threads and the corrections the operator gave. Fix each class at the highest level that works: architecture, then types, then a lint whose message names the fix, then a test. Show each new check failing on the mistake. Add the rule and its check to the table in `AGENTS.md`.

## 3. No comments

Read `.agents/skills/no-comments/SKILL.md` and follow it over the diff against the base branch. It starts the `comment-sicko` agent in `.claude/agents`. `tests/workspace-rules.test.ts` already fails on a comment in a script file, so this step is for what that test cannot see: a constraint that a comment used to carry and that no name, type or test carries yet.

## 4. Thermos

Read `.agents/skills/thermos/SKILL.md` and follow it. The Skill tool does not list it, because it is set to run only when asked. Start the two reviewers in `.claude/agents`, and give each one the diff against the base branch, the full contents of the changed files, and the path of its rubric: `.agents/skills/thermo-nuclear-review/SKILL.md` or `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`. Fix each finding you confirm, and say why for each one you dismiss. Run step 1 again after a fix.

## 5. Open it

- Stack the branch on the pull request it builds on, and target that branch. Target `main` only for work that builds on nothing unmerged.
- Title: Conventional Commits, `type(scope): subject`.
- Body: `## Why`, `## What changed`, `## Scope`, `## Tradeoffs`, `## Blast Radius`, `## Verification`, in that order. Drop a section with nothing to say. Keep `## Scope`.
- Open it ready, not as a draft.

## What this skill does not cover

- Merging. A person merges.
