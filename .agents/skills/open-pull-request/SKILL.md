---
name: open-pull-request
description: The eight steps every pull request in this repository goes through, in order, from the first commit to after it opens - verify, pstack correct, pstack no-comments until clean, Thermos rounds with review-solid2, the verification skills with their mutation checks, pstack statechart for each tla-ts model, opening it, and pstack reflect. Use before opening or updating any pull request, and when asked what a pull request still needs.
---

# Open a pull request

Run the steps in order. Batch the fixes a step finds into as few commits as you can, then go back to step 1 once for the batch.

The pstack skills come from the pstack plugin that `.claude/settings.json` enables. Only a person can start them as commands, so read `pstack/skills/<name>/SKILL.md` and follow it, from the installed plugin or from a clone of `cursor/plugins`. When a skill starts an agent that `.claude/agents` does not hold, start a general-purpose agent whose first instruction is to read `pstack/agents/<agent>.md` from the same place and act as it. A session that cannot start agents asks the person who started it to run steps 3 and 4, and leaves their lines in the body unfilled.

## 1. Verify

```bash
vp run verify
```

Then run the `Run it` command of each `verify-*` skill whose covered-code table covers a file the branch changes. Leave their mutation checks to step 5.

## 2. Correct

Follow pstack `correct` over this branch: its commits, its review findings and every correction the operator gave. A rule you add gets a row in `AGENTS.md` that names its check, and that check fails first on the mistake.

## 3. No comments

Follow pstack `no-comments` over the diff against the base branch. It starts `subagent_type: "comment-sicko"`. After you fix its findings, start it again on the new commits, and repeat until a pass finds nothing to fix. Note the commit of that clean pass for the body.

## 4. Review

Start two reviewers, each an agent of its own. The first instruction of one is to read and follow `.agents/skills/thermo-nuclear-review/SKILL.md`, and the first instruction of the other is to read and follow `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`. Give each the diff against the base branch and the full text of the changed files. Beside them, review the diff with `.agents/skills/review-solid2/SKILL.md`. `.agents/skills/thermos/SKILL.md` says how to merge their findings.

- There is no round limit. Resolve every finding at Medium or higher. A quality reviewer's presumptive blocker, a wrong layer or a missed simplification that would remove a whole class of defect, counts as Medium.
- Judge each finding below Medium as fixed, follow-up or dismissed with a reason. You may open the pull request with them open. Record every judgement and every follow-up only in the coordinator's private notes, never in an issue or in this repository. The body gives only their counts.
- Fix all the findings of one round together, then run step 3 on the fixes.
- Set the scope of each next round and state it in the reviewers' brief: the fix delta, and every caller, shared layer and use of the same pattern in the pull request that a fix touches. When a fix changes structure, the scope is the whole pull request.
- Stop once a round finds nothing at Medium or higher and comment-sicko is clean on the same commit.

## 5. Verification skills

Once the code is final, bring the skills that verify it back in line.

- pstack `maintain-verification-skill` for each `verify-*` skill whose covered-code table covers a changed file.
- pstack `create-verification-skill` when the branch adds behaviour a user can see that no `verify-*` skill drives.
- pstack `maintain-formal-verification-skill` for each `verify-formal-*` skill whose covered code changed.
- pstack `create-formal-verification-skill` when the branch adds code whose promise a model or a prover can check and no `verify-formal-*` skill checks it.

A skill whose check runs tla-ts is named `verify-formal-*`, and every other verification skill `verify-*`. Run each skill's mutation checks once, here, on the final code commit, with the seed each one names. Commit each skill's corrections on this branch, in a commit of its own. A bug a skill finds is a fix commit of its own, with its test, and it sends you back to step 1.

## 6. Statechart

For each tla-ts model the branch adds or changes, a `*.tla`, `*.cfg` or `*.model.ts` file, check it with the command its `verify-formal-*` skill gives and draw it with pstack `statechart`. Put each chart in `## Verification` as a `mermaid` code block, with the model's path in backticks on the line before it.

## 7. Open it

- Stack the branch on the pull request it builds on and target that branch, or `main` when it builds on nothing unmerged.
- Write the title on line 1 of a file and the body from line 3. The body is a one-minute briefing in the sections of pstack's opening-a-pr playbook. The history of each review round goes to the coordinator's private notes, not the body. `## Verification` holds these two lines, each naming the commit its clean pass reviewed:

  ```md
  - comment-sicko: clean at <commit>.
  - Thermos: no Medium or higher at <commit>, after <n> rounds; <n> below Medium fixed, <n> follow-ups, <n> dismissed.
  ```

- Check the file as CI will check the opened pull request:

  ```bash
  node scripts/check-pull-request-text.ts --file <file> --base origin/<base branch>
  ```

- Open it as a draft, with `gh pr create --draft --body-file <body>` or the PR tool's `draft: true`. Read the body back, and restore it if the tool changed the footer. Then mark it ready, with `gh pr ready` or the tool's `draft: false`. CI checks only the private terms of a draft and the rest when it is marked ready.

## 8. Reflect

After it opens, follow pstack `reflect` over the session. Route each lesson to an edit of a skill in `.agents/skills`, once the person who started you approves it, and each lesson a check can hold to step 2 of the next pull request.

## What this skill does not cover

Merging. A person merges, with a merge commit: a squash leaves out the commits the verification skills were confirmed against.
