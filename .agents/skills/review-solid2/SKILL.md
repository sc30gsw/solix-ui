---
name: review-solid2
description: Reviews a diff for the Solid 2.0 mistakes that no pattern can see, against the review checklist of the kit's solid-2 skill. Use beside the Thermos reviewers in the review step of open-pull-request, or whenever a change adds or edits Solid code.
---

# Review Solid 2.0

`vp run verify` already runs the kit's pattern gate and its doctor over the whole repository, and the playground and story tests fail on Solid's development diagnostics. This review is for the rest: what only reading the code can tell.

1. Read the section that starts `## Review checklist` in `.agents/skills/solid-2/SKILL.md`.
2. Read each changed `.ts`, `.tsx` and `.jsx` file of the diff against the base branch against that checklist.
3. Report each finding as `file:line — problem — Solid 2 replacement`, fix the ones you confirm, and say why for each one you dismiss.
