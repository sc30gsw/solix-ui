---
name: verify-solid2
description: Checks that the code is Solid 2.0 and not React or Solid 1.x, by running solid2-agent-kit's pattern gate over every source file and its doctor over the project's wiring, and then by reviewing the diff against the kit's review checklist for what a pattern cannot see. Use when a change adds or edits a component, a primitive or any other `.ts`, `.tsx` or `.jsx` file, touches a manifest, a tsconfig or `vite.config.ts`, or moves the kit, Solid or the Solid plugin in the catalog.
---

# Verify Solid 2.0

## The promise

No source file holds a React pattern or a Solid 1.x API that the kit's gate knows, no manifest names a package the kit's doctor bans or a Solid 1.x line, and the project is wired for Solid 2. What a pattern cannot see is reviewed by hand against the kit's checklist, and each finding is fixed or answered.

## The harm when it breaks

A component destructures its props and stops updating, an effect copies state instead of deriving it, a list loses its rows' identity, or a React or Solid 1.x API reaches the build and fails there or, worse, runs and does the wrong thing.

## Does your change touch it?

It does if it edits any of these:

| Covered code | What the check assumes about it |
| --- | --- |
| `packages`, `apps`, `scripts` and `tests` | `solid2-kit check --dir .` reads every `.ts`, `.tsx` and `.jsx` file in them with its comments blanked, skipping `node_modules` and dot directories, and `tests/agent-kit.test.ts` runs the kit's doctor on every workspace manifest with the catalog's versions. |
| `package.json` | Its `lint:solid` script runs `solid2-kit check --dir .` and then `solid2-kit doctor`, and `verify` runs `lint:solid`. The doctor reads its dependencies. |
| `tsconfig.base.json` and `tsconfig.json` | The doctor reads `jsx`, which is `preserve`, and `jsxImportSource`, which is `@solidjs/web`. |
| `vite.config.ts` | The doctor reads it for `vite-plugin-solid` and a `jsxImportSource` of `solid-js` or `react`, and its `staged` block runs `solid2-kit check` on each staged source file. |
| `pnpm-workspace.yaml` | The catalog pins `solid2-agent-kit`, whose gate and doctor these are, and the Solid packages, and `overrides` removes every package the doctor bans but `react` from any install. |
| `.agents/skills/solid-2` | The kit's skill, whose "Review checklist" section the review walks. |

Last confirmed against commit `292a5ad`. Run `git diff 292a5ad -- packages apps scripts tests package.json tsconfig.base.json tsconfig.json vite.config.ts pnpm-workspace.yaml .agents/skills/solid-2`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp run lint:solid
vp test tests/agent-kit.test.ts
```

The first line takes about a second. The second runs the manifest check, the overrides check and the check that the kit's guidance is what `scripts/sync-agent-kit.ts` writes.

Then review the diff against the base branch against the "Review checklist" section of `.agents/skills/solid-2/SKILL.md`, file by file, for what a pattern cannot see. Report each finding as `file:line — problem — Solid 2 replacement`, fix it, and run both lines again.

## The tool and why

The kit's gate is a set of regular expressions over comment-stripped source, and its doctor reads the manifests and config files, so both are deterministic and fast, and both run in `vp run verify` before every commit and in CI. They cannot see meaning: a reactive read after an `await`, an effect that copies state, a boundary around the wrong part. Solid's development diagnostics catch some of those at run time, and the playground and story tests fail on any. The rest is the review, which is judgment and is why this is a skill.

## What a pass covers

- Every pattern the kit's gate knows, in every `.ts`, `.tsx` and `.jsx` file outside `node_modules` and dot directories.
- The root's dependencies, tsconfig files and config files, as the doctor reads them, and every workspace manifest's dependencies, as the manifest check reads them.
- The diff, against the kit's review checklist, as far as the review was done.

## What a pass does not cover

- A pattern the gate does not know, and a React or Solid 1.x API spelled in a way its expressions miss, such as one built at run time.
- A banned package that reaches the install through a dependency's own manifest. `react` does, through Storybook's icons, which the row on `react` in `AGENTS.md` holds.
- Anything under a dot directory, such as `.agents`.

## Reading a failure

- **`solid2-kit check` lists `file:line [id] message`.** The id names the pattern and the message names the Solid 2 form. Fix the code; do not change the gate.
- **`solid2-kit doctor` lists `[id] message`.** A dependency, a tsconfig option or a config file is wired for React or Solid 1.x, or a Solid package is older than the kit's baseline. Move the catalog or the setting as the message says.
- **The manifest check names a manifest.** That manifest lists a banned package or a Solid 1.x line. Remove it, or move it to Solid 2.

## When the change is intended

- Moving the kit: change its version in the catalog in `pnpm-workspace.yaml`, install, run `node scripts/sync-agent-kit.ts`, read what it changed, then run the check.
- Mutation check after editing covered code: in `packages/core/src/Button.tsx`, add `const { variant } = props;` as the first line of the component's body and run `vp run lint:solid`, which must fail with `[props-destructure-body]` on that line. Then add `"react": "^19.0.0"` to the `devDependencies` of `packages/core/package.json` and run `vp test tests/agent-kit.test.ts`, which must fail with `packages/core/package.json: package.json depends on "react"`. Restore both files and confirm them with `cmp`.
