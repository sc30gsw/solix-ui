---
name: verify-visual-spec
description: Checks the computed look of each component, per variant, state and colour scheme, against the values the visual reference's own tokens give, in Chromium, Firefox and WebKit, where an entry that holds must compute the same value and a pending one must differ until the parity-gap item it names lands, and checks that every exported component has a look spec or is listed as not yet written or as drawing no look. Use when a change edits a component's styles, a colour, size, radius or motion token, the colour rules, a look spec entry, the spec runner, or Solid, the Solid plugin, StyleX, Vitest or Playwright.
---

# Verify the visual spec

## The promise

Every component that draws a look has a look spec in `packages/core/spec/look/<Component>.ts`, beside the shared looks in `packages/core/spec/look/foundations.ts`. Each entry states one computed style of one part, in one state (rest, hover, pressed, keyboard focus or reduced motion, with a disabled, data-disabled, loading or fieldset fixture for those looks), in the light or the dark scheme, and at a narrow or a wide viewport. Its value is the visual reference's: the colour, length, scale or timing its tokens and component styles give, written as a literal value or a `color-mix()` of them, never read back from the library's own tokens.

An entry that `holds` computes, in that state and scheme, what the browser computes for the given value on a probe beside the part: a colour painted within 2 of 255 on each channel, any other property as the same computed text. A `pending` entry names the parity-gap item that will make it hold and must differ today; once it matches, it fails with `now holds: mark it holds`. Among them is Button's `:disabled` look, opacity 0.5, the not-allowed cursor and no pointer events, which waits for the Button pull request (Q182).

Every component the built library exports has a look spec, or is listed in `looksNotYetWritten` with the step that will write it, or as one that draws no look of its own.

## The harm when it breaks

A variant renders like another, a hover or a pressed state draws nothing, the dark scheme keeps a light colour, or a disabled button looks pressable, and no check says so because each story only looks right to whoever last opened it.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/spec/look` | The look entries, each exported as `spec`, from the visual reference's values. |
| `packages/core/spec/format.ts`: `defineLook`, `held`, `style` | A look entry is an entry whose check is a computed style; `held` applies the holds and pending rule. |
| `packages/core/spec/runner.ts`: `runSpecs` | It mounts each fixture in a host with the entry's `data-color-scheme` and viewport, enters the state with the user's pointer, a held press or the keyboard's Tab, waits for every CSS transition to finish, and compares the computed value with a probe's. |
| `packages/core/spec/computed.ts`: `sameColour`, `sameLength` | The colour comparison on a canvas. |
| `packages/core/spec/commands.ts`: `specCommands` | The press held down and the reduced-motion emulation, through Playwright. |
| `packages/core/spec/specs.ts`: `lookSpecs`, `functionSpecs` | Every look spec the runner reads. |
| `packages/core/spec/not-yet-written.ts`: `looksNotYetWritten`, `drawsNoLook` | Each component without a look spec, with its step or as drawing none. |
| `packages/core/tests/visual-spec.browser.test.ts` | It runs every look spec through `runSpecs`. |
| `packages/core/tests/spec-coverage.test.ts` | The coverage rule, read from the build. |
| `packages/core/src` | The styles, tokens and colour rules, built to `packages/core/dist/styles.css`. |
| `vite.config.ts` | It defines the `component spec` project in every engine with `specCommands`. |
| `scripts/browser-instances.ts`: `browserInEveryEngine` | The engines the project runs in. |
| `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `@stylexjs/stylex`, `vite-plus`, `@vitest/browser-playwright` and `playwright` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `dba0e2b`. Run `git diff dba0e2b -- packages/core/spec/look packages/core/spec/format.ts packages/core/spec/runner.ts packages/core/spec/computed.ts packages/core/spec/commands.ts packages/core/spec/specs.ts packages/core/spec/not-yet-written.ts packages/core/tests/visual-spec.browser.test.ts packages/core/tests/spec-coverage.test.ts packages/core/src vite.config.ts scripts/browser-instances.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/visual-spec.browser.test.ts packages/core/tests/spec-coverage.test.ts
```

It takes about half a minute with one engine installed, most of it the build every run starts with. With `CI` set, all three engines must be installed.

## The tool and why

No tool proves what a browser paints, so this is not a proof. Each entry reads the engine's own computed style in its real state, entered the way a user enters it, and compares it with what the same engine computes for the visual reference's value, so the comparison does not depend on how an engine writes a colour or a length. A screenshot would also compare pixels the spec does not name, so the check reads values instead.

## What a pass covers

- Every entry of `lookSpecs`, one test each, in each installed engine: 11 shared looks (6 hold, 5 pending) on TextInput and Tabs.Tab, and 175 of Button (92 hold, 83 pending): each of its eight variants in both schemes at rest, hovered, pressed, focused by the keyboard and disabled, the disabled, data-disabled, loading and fieldset looks, the sizes below and from the md breakpoint, and its motion and reduced motion.
- That every exported component has a look spec, a listed follow-up or is listed as drawing none, and that the list is not stale.

## What a pass does not cover

- Pseudo-elements, and looks the spec does not name.
- Touch and forced colours.
- A state reached only by script, such as a pending request, beyond the props the fixtures give.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **`<part>, <property>: expected <value>, computed <probe>; it is <actual>`.** The part computes another value than the visual reference's. For an entry that holds that is a regression of the look; compare the value with the token the component reads.
- **`now holds: mark it holds`.** The look landed, or matches by chance. If the component now draws it on purpose, mark the entry `holds`.
- **`The keyboard did not move focus to the part`.** The fixture's first tab stop is another element, so its focus look was not read.
- **`the canvas cannot paint this colour`.** The engine computes a colour syntax its canvas does not take. Report it with the engine's name.

## When the change is intended

- A look lands: run the check, and mark each entry that now fails with `now holds` as `holds`.
- The visual reference changes a value: change the value in the look spec, from its token, before you change the component.
- Mutation check after editing a component's styles: in `packages/core/src/Button.tsx` change `outlineOffset: "0.125rem",` to `outlineOffset: "0.25rem",` and run `vp test packages/core/tests/visual-spec.browser.test.ts`. It must fail on every Button entry `focus-visible ... outline-offset is 2px`. Then add `opacity: { default: 1, ":disabled": 0.5 },` to the root styles of `packages/core/src/Button.tsx` and run the same command: each Button entry `rest ... opacity is 0.5` with the disabled fixture, and the fieldset entries, must fail with `now holds: mark it holds`. Restore both afterwards.
- Mutation check after editing the comparison: in `packages/core/spec/computed.ts` change `const channelTolerance = 2;` to `-1` and run `vp test packages/core/tests/visual-spec.browser.test.ts`. Every colour entry that holds must fail, but those where both colours are fully transparent. Restore it afterwards.
