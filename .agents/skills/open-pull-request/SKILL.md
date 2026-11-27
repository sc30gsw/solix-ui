---
name: open-pull-request
description: The steps every pull request in this repository goes through, in order, from the first commit until after it opens. Use before opening or updating any pull request, when a review round finishes, and when asked what a pull request still needs.
---

# Open a pull request

Run the steps in order. Batch the fixes a step finds into as few commits as you can, then go back to step 1 once for the batch.

The pstack skills come from the pstack plugin that `.claude/settings.json` enables. Only a person can start them as commands, so read `pstack/skills/<name>/SKILL.md` and follow it, from the installed plugin or from a clone of `cursor/plugins`. When a skill starts an agent that `.claude/agents` does not hold, start a general-purpose agent whose first instruction is to read `pstack/agents/<agent>.md` from the same place and act as it. A session that cannot start agents asks the person who started it to run steps 4 and 5, and leaves their lines in the body unfilled.

## 1. Verify

```bash
vp run verify
```

Then run the `Run it` command of each `verify-*` skill whose covered-code table covers a file the branch changes.

## 2. Correct

Follow pstack `correct` over this branch: its commits, its review findings and every correction the operator gave. A rule you add gets a row in `AGENTS.md` that names its check, and that check fails first on the mistake.

## 3. Verification skills

Bring the skills that verify the changed code in line with it before anyone reviews it, so the review covers them too.

- pstack `maintain-verification-skill` for each `verify-*` skill whose covered-code table covers a changed file, and `create-verification-skill` when the branch adds behaviour a user can see that no skill drives.
- pstack `maintain-formal-verification-skill` for each `verify-formal-*` skill whose covered code changed, and `create-formal-verification-skill` when the branch adds code whose promise a model or a prover can check and no skill checks it.
- Run each skill's mutation checks once, on the last code commit, with the commands they give. Commit each skill's corrections in a commit of its own. A bug a skill finds is a fix commit of its own, with its test, and sends you back to step 1.

## 4. No comments

Follow pstack `no-comments` over `git diff origin/<base branch>...HEAD`. It starts `subagent_type: "comment-sicko"`, and it takes the place of the `/deslop` pass that pstack's opening-a-pr playbook asks for. After you fix its findings, start it again on the new commits, and repeat until a pass finds nothing to fix.

## 5. Review

Start two reviewers, each an agent of its own. The first instruction of one is to read and follow `.agents/skills/thermo-nuclear-review/SKILL.md`, and the first instruction of the other is to read and follow `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`. Give each `git diff origin/<base branch>...HEAD` and the full text of the changed files. Beside them, review the diff with `.agents/skills/review-solid2/SKILL.md`. `.agents/skills/thermos/SKILL.md` says how to merge their findings.

- State this bar in each reviewer's brief. A finding is Medium or higher only when it shows a concrete failure, and the reviewer gives its inputs and its result: wrong behaviour of the library, its build or its published files; a CI job that passes on such a failure or fails on correct code; or a command, script or message a contributor meets that fails, does harm or misleads them.
- A change of structure that fixes no failure, a presumptive blocker of the quality rubric among them, is Low at most. A way around a check the repository's own tests run is Low when the AGENTS.md row of that check states what the check does not see; when the row does not, adding that statement is the finding's fix in this pull request.
- Resolve every finding at Medium or higher here: fix it, or, when it is beyond what the pull request is for or the person who started you says so, move it to a follow-up or accept it. A finding moved or accepted counts with the follow-ups or the dismissed in the body, and is not open.
- Judge each finding below Medium as fixed, follow-up or dismissed with a reason. You may open the pull request with them open. Record every judgement, every follow-up and the history of each round only in the coordinator's private notes, never in an issue or in this repository. The body gives only their counts.
- Fix all the findings of one round together, run step 3 for any covered code they change, then step 4 on the fixes.
- Set the scope of each next round and state it in the reviewers' brief. Round 1 covers the whole pull request. Round 2 covers the whole pull request when a fix changed structure, and otherwise the fix delta with every caller, shared layer and use of the same pattern it touches. From round 3 the scope is only the fix delta. A merge of the base branch adds to the scope how its conflicts were resolved (`git show --remerge-diff`), and a round of its own when nothing else is in scope; that round does not count toward round 3.
- When round 3 or a later round still finds anything at Medium or higher, stop and ask the person who started you whether to fix it here, move it to a follow-up, or accept it.
- Stop once a round leaves nothing at Medium or higher open and comment-sicko is clean on the same commit. What may follow it is what `filesAfterReview` in `scripts/pull-request-text.ts` and the text check allow; anything else goes through steps 4 and 5 again, scoped to what it adds.

## 6. Statechart

For each tla-ts model the branch adds or changes, a file that `modelFilePatterns` in `scripts/formal-verification.ts` matches, follow the method of pstack `statechart` with tla-ts as the only checker: report the shortest path to each rule that breaks, and draw the model as a Mermaid statechart from tla-ts's `-dump dot,actionlabels` through the repository script that the first `verify-formal-*` skill brings, and that its skill names. A rule that tla-ts finds broken is a bug in the code: fix it in a commit with its test, and go back to step 1.

## 7. Open it

- Stack the branch on the pull request it builds on and target that branch, or `main` when it builds on nothing unmerged.
- Write the title by the title rule of `pstack/skills/poteto-mode/playbooks/opening-a-pr.md`, and the body as the one-minute briefing in the sections it names. `## Verification` holds the lines that `reviewLines` in `scripts/pull-request-text.ts` begins, the Thermos one with the counts of the findings below Medium, and the chart of each model from step 6.
- Write both to a file and check it as CI will check the opened pull request, and fix what it reports:

  ```bash
  node scripts/check-pull-request-text.ts --file <file> --base <base branch>
  ```

- Open it ready, with `gh pr create --title <title> --body-file <body>` or the PR tool. Read the body back. If the tool changed the footer, restore the body with `gh pr edit --body-file <body>` or the tool's update.

## 8. Reflect

After it opens, follow pstack `reflect` over the session. Each lesson the person who started you approves goes into the next pull request: an edit of a skill in `.agents/skills`, or a check through step 2 when one can hold it.

## What this skill does not cover

Merging. A person merges, with a merge commit: a squash leaves out the commits the verification skills were confirmed against.
