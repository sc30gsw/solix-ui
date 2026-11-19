---
name: open-pull-request
description: The steps every pull request in this repository goes through before it opens, in order. Verify, then pstack `correct`, then pstack `no-comments`, then Thermos, then the verification skills, then a stacked pull request with the six-section body. Use before opening or updating any pull request.
---

# Open a pull request

Every pull request goes through these steps in this order. A step that finds something sends you back to the first step after the fix.

The pstack skills come from the pstack plugin that `.claude/settings.json` enables. They are set so that only a person can start them with `/pstack:<name>`, so an agent reads each one and follows it. Read `pstack/skills/<name>/SKILL.md` from the installed plugin, or from a clone of `cursor/plugins` when the session did not load the plugin. When a pstack skill starts an agent that `.claude/agents` does not hold, start a general-purpose agent whose first instruction is to read `pstack/agents/<agent>.md` from the same place and act as it. The Thermos skills and their agents are in this repository. If the Skill tool does not list one, read it from the path given.

## 1. Verify

```bash
vp run verify
```

Run the matching `verify-*` skill for the code the change touches. Drive the changed feature with `vp run evidence`.

## 2. Correct

Follow the pstack `correct` skill over this branch's work. Find each mistake that happened twice, in the commits, the review threads and the corrections the operator gave. Fix each class at the highest level that works: architecture, then types, then a lint whose message names the fix, then a test. Show each new check failing on the mistake. Add the rule and its check to the table in `AGENTS.md`.

## 3. No comments

Follow the pstack `no-comments` skill over the diff against the base branch. It starts the `comment-sicko` agent. `tests/rules/workspace-rules.test.ts` fails on a comment in a script file, but it does not see files under a directory whose name starts with a dot, such as `.agents`. Neither check sees a constraint that a comment used to carry and that no name, type or test carries yet.

## 4. Thermos

Read `.agents/skills/thermos/SKILL.md` and follow it. Start the two reviewers in `.claude/agents`, and give each one the diff against the base branch, the full contents of the changed files, and the path of its rubric: `.agents/skills/thermo-nuclear-review/SKILL.md` or `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`. Fix each finding you confirm, and say why for each one you dismiss. Run step 1 again after a fix.

## 5. Verification skills

Bring the skills that verify the changed code back in line with it, once the fixes of the steps above are in.

- Follow the pstack `maintain-verification-skill` skill for each `verify-*` skill whose covered-code table covers a file the branch changes.
- Follow the pstack `maintain-formal-verification-skill` skill for each check that one of those skills runs against a model or a prover.
- When the branch adds code whose promise a model or a prover can check and no skill checks it, follow the pstack `create-formal-verification-skill` skill.

Each of the two maintain skills ships its corrections as a pull request of its own. Here they go on this branch, in commits of their own, because `tests/repository-conventions.test.ts` holds every verification skill to a commit that HEAD contains and to the files its tables cover. Neither one edits product code: a bug that one finds is fixed in its own commit, with a test that fails first.

## 6. Open it

- Stack the branch on the pull request it builds on, and target that branch. Target `main` only for work that builds on nothing unmerged.
- Title: Conventional Commits, `type(scope): subject`.
- Body: `## Why`, `## What changed`, `## Scope`, `## Tradeoffs`, `## Blast Radius`, `## Verification`, in that order. Drop a section with nothing to say. Keep `## Scope`.
- Before you open it, write the title and the body to a file and run `node scripts/check-private-terms.mjs --text <file>`. It must pass.
- Open it ready, not as a draft.

## What this skill does not cover

- Merging. A person merges.
