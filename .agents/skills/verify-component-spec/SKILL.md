---
name: verify-component-spec
description: Checks every entry of the written spec of the shared foundations, of the owner's decisions and of each component against the built library in Chromium, Firefox and WebKit, where an entry that holds must pass and a pending one must fail until the parity-gap item it names lands, and checks that every exported component has a spec file or is listed as not yet written. Its entries include the functional reference's own test suites, ported into entries. Use when a change adds or edits a component, a spec entry, the spec format or its runner, the Button stories a spec names, the component spec project, or Solid, the Solid plugin, Vitest, Playwright or axe-core.
---

# Verify the component spec

## The promise

Every component has a written spec: a list of entries in `packages/core/spec/<Component>.ts`, beside the spec of the shared foundations in `packages/core/spec/foundations.ts` and the owner's decisions Q168 and Q171 to Q178 in `packages/core/spec/decisions.ts`. Each entry states one promise of the functional reference, which the library matches exactly (Q166): a prop and its value, a part, a data attribute, a CSS variable, a behaviour, or a default. Each names how it is checked: a DOM assertion on a rendered fixture, a computed-style assertion, or a story's play. Each carries a status:

- `holds`: the check passes against the built library today, and must keep passing.
- `pending`, with the parity-gap item that will make it hold, written `<section> <n>` for the n-th check to write first of that section of the parity audit, or `step <n>` for a step of its recommended order. The check must fail today. Once it passes, the entry fails with `now holds: mark it holds`, so red stays visible and never turns green unnoticed.

Every component the built library exports has a spec file, or is listed in `specsNotYetWritten` with the step that will write it. The list fails as soon as it goes stale.

The reference's test suites are ported as entries: each ported entry names the test it translates in `ported`. For Button that is the reference's Button suite (7 tests), its axe suite (2), its focus-events suite, and the shared system-props suite it calls (class, others, id, ref, children, style, polymorphic, variant, size, mod, the Styles API selectors root, inner, label, loader and section, provider defaults, extend, withProps, static classes and varsResolver, the first four among the foundations' entries on Button), its Button.Group suite and its Button.GroupSection suite. The foundations port the shared suite's mod, variant, size, style, Styles API and polymorphic tests on Box.

## The harm when it breaks

A component ships without a feature of the reference and nothing says so, or a feature lands and the spec still calls it missing, so nobody knows what parity is left. A pending entry that passes by accident would hide that the check never tested the feature.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/spec/format.ts`: `held`, `nowHolds`, `defineSpec`, `checksBy`, `dom`, `style`, `story` | The types of an entry, a fixture and a check. `held` runs a check and applies the holds and pending rule. |
| `packages/core/spec/runner.ts`: `runSpecs` | It imports the built library from `packages/core/dist` and links its stylesheet, mounts each fixture in a host that carries `data-color-scheme`, inside a `SolixProvider` or a disabled `fieldset` when the fixture asks, and gives a DOM check the root, the parts by their stable class, a reactive `update`, an axe scan with every WCAG 2 A and AA tag, and the user's clicks and keys. It skips story entries. |
| `packages/core/spec/computed.ts`: `sameColour`, `sameLength` | A colour is compared by painting both on a canvas, within 2 of 255 on each channel; a length within half a pixel. |
| `packages/core/spec/commands.ts`: `specCommands` | The browser commands that hold a press down and emulate reduced motion through Playwright. |
| `packages/core/spec/specs.ts`: `functionSpecs`, `lookSpecs` | Every spec a runner reads. |
| `packages/core/spec/not-yet-written.ts`: `specsNotYetWritten`, `looksNotYetWritten`, `parityGapSteps` | Each component without a spec file, with its step. |
| `packages/core/spec/foundations.ts`, `packages/core/spec/decisions.ts` and `packages/core/spec/Button.ts` | The entries, each exported as `spec`. |
| `packages/core/tests/component-spec.browser.test.ts` | It runs every function spec through `runSpecs`. |
| `packages/core/tests/spec-format.test.ts` | It holds `held` to the rule on a passing, a failing and a rejecting check. |
| `packages/core/tests/spec-coverage.test.ts` | The coverage rule, read from the build. |
| `apps/storybook/tests/spec-stories.test.ts` | It holds a story entry when Storybook indexes the story in the component's story file with the `play-fn` tag, which a story with a play function carries; the stories projects run that play. |
| `apps/storybook/tests/support/stories.ts`: `storyIndex`, `storyFileOf` | It builds Storybook's index. |
| `apps/storybook/src/Button.stories.tsx` | The stories the Button spec names. |
| `packages/core/tests/built-library.ts`: `componentExports` | The components the build exports. |
| `packages/core/src` | The components under spec, built to `packages/core/dist`. |
| `vite.config.ts` | It defines the `component spec` project, rooted at `packages/core`, in every engine with `specCommands`. |
| `scripts/browser-instances.ts`: `browserInEveryEngine` | The engines the project runs in. |
| `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `vite-plus`, `@vitest/browser-playwright`, `playwright`, `axe-core` and `storybook` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `dba0e2b`. Run `git diff dba0e2b -- packages/core/spec/format.ts packages/core/spec/runner.ts packages/core/spec/computed.ts packages/core/spec/commands.ts packages/core/spec/specs.ts packages/core/spec/not-yet-written.ts packages/core/spec/foundations.ts packages/core/spec/decisions.ts packages/core/spec/Button.ts packages/core/tests/component-spec.browser.test.ts packages/core/tests/spec-format.test.ts packages/core/tests/spec-coverage.test.ts apps/storybook/tests/spec-stories.test.ts apps/storybook/tests/support/stories.ts apps/storybook/src/Button.stories.tsx packages/core/tests/built-library.ts packages/core/src vite.config.ts scripts/browser-instances.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/component-spec.browser.test.ts packages/core/tests/spec-format.test.ts packages/core/tests/spec-coverage.test.ts apps/storybook/tests/spec-stories.test.ts
```

It takes under a minute with one engine installed, most of it the build every run starts with and Storybook's index. With `CI` set, all three engines must be installed.

## The tool and why

No model checker runs on a rendered component, so this is not a proof. Each entry is one concrete check against the built library in a real engine, the way the reference's own suites check it. The holds and pending rule is plain code, `held`, which its own test holds on every case.

## What a pass covers

- Every entry of `functionSpecs`, one test each, in each installed engine: 40 of the foundations (14 hold, 26 pending), 14 of the decisions (7 hold, 7 pending) and 93 of Button (44 hold, 49 pending), and 5 story entries of Button (3 hold, 2 pending). 57 of them port a test of the reference's suites.
- That every exported component has a spec file or a listed follow-up, that the list is not stale and that every spec file is read.

## What a pass does not cover

- A foundation entry is checked on Box or Button only, not on every component; the step that writes a component's spec brings the entries for it.
- A pending entry's check may fail for a reason other than the missing feature, such as a wrong fixture. Read why each pending entry fails before you trust it: the runner prints a pending entry's error only once it is marked `holds`.
- The look of a component. `.agents/skills/verify-visual-spec` covers that.
- A story entry checks that the story exists with a play; whether the play passes is held by the stories projects, which `vp run verify` runs.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **`now holds: mark it holds`.** The feature the entry waited for landed, or the check passes for another reason. Read the check against the code; if the feature is there, mark the entry `holds` and drop `until`.
- **An entry that holds fails.** A regression, unless the entry is wrong. The message names the part, the property and both values, or the assertion.
- **`the built library exports no component by this name`.** The fixture names a component or static member the build lacks. For a pending entry that is the expected failure.
- **`it renders no <part> part`.** The part has no stable class `solix-<Component>-<part>`.
- **`The keyboard did not move focus to the part`.** The fixture's first tab stop is another element.
- **A coverage failure.** Its message says which file to write or which list entry to remove.

## When the change is intended

- A feature lands: run the check, and mark each entry that now fails with `now holds` as `holds`.
- A component gets its spec: write `packages/core/spec/<Component>.ts`, add it to `functionSpecs`, remove it from `specsNotYetWritten`, and move its entries out of `packages/core/spec/decisions.ts` if it has any there.
- Mutation check after editing `held`: in `packages/core/spec/format.ts` replace the `throw new Error(` after `if (outcome.passed) {` with `return void new Error(` and run `vp test packages/core/tests/spec-format.test.ts`. It must fail on `a pending entry whose check passes fails with "now holds: mark it holds"`. Restore it afterwards.
- Mutation check after editing a component: in `packages/core/src/Button.tsx` change `const unlistedVariant = "filled";` to `"light"` and run `vp test packages/core/tests/component-spec.browser.test.ts`. It must fail on `with no props the root has data-variant="filled"` and the other entries that hold the filled default, and on the two pending entries a light default happens to satisfy, with `now holds: mark it holds`. Then, in `packages/core/src/color-table.ts`, delete the line `orange: "yellow",` and run the same command: `orange is a palette of its own` must fail with `now holds: mark it holds`. Restore both afterwards.
- Mutation check after editing the coverage list: add `Button: "step 6",` to `specsNotYetWritten` in `packages/core/spec/not-yet-written.ts` and run `vp test packages/core/tests/spec-coverage.test.ts`. It must fail, saying the list is stale. Restore it afterwards.
- Mutation check after editing the stories a spec names: rename the story `Pressed` in `apps/storybook/src/Button.stories.tsx` to `Pressed2` and run `vp test apps/storybook/tests/spec-stories.test.ts`. It must fail with `Storybook indexes no story Pressed`. Restore it afterwards.
