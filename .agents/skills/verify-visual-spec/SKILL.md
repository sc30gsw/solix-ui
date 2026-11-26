---
name: verify-visual-spec
description: Checks the computed look of each component, per variant, state and colour scheme, against the literal values of the visual reference's tokens and the functional reference's theme, in Chromium, Firefox and WebKit, where an entry that holds must compute the same value and a pending one must fail with the failure it names until the parity-gap item it names lands, and a spec value the engine cannot take fails as a wrong spec. Use when a change edits a component's styles, a colour, size, radius or motion token, the colour rules, a look spec entry, the reference data, the spec runner or its comparison, or Solid, the Solid plugin, StyleX, Vitest or Playwright.
---

# Verify the visual spec

## The promise

Every component that draws a look has a look spec in `packages/core/spec/look/<Component>.ts`, beside the shared looks in `packages/core/spec/look/foundations.ts`, or the registry in `packages/core/spec/registry.ts` names the gap item that will write it, or says it draws no look of its own. Each entry, which `lookEntry` builds, states one computed style of one part, in one state (rest, hover, pressed or focused by the keyboard), in the light or the dark scheme, under the media the entry gives (a viewport width, reduced motion), with a disabled, data-disabled or loading fixture for those looks. Its promise is derived from the property it reads.

Every computed value of the library is here, and only here: the function spec holds the DOM, the attributes, the behaviour and the names of the CSS variables. A value is the reference's literal one, from `packages/core/spec/look/reference.ts`: the visual reference's colours, statuses and breakpoints, and the functional reference's default gradient. A value that names a custom property is a `SpecError`.

An entry that `holds` computes, in its state and scheme, what the engine computes for its value on a probe beside the part, compared as the entry says (`as`): a colour painted over opaque white and over opaque black within 2 of 255 on each channel, a length within half a pixel, or the same text. The value is first resolved in two contexts; a value the engine does not take, or one that computes otherwise in the other context, is a `SpecError`. An entry of a variant fixture first requires the root to carry that `data-variant`, so a variant that is not built fails its whole grid and never passes through another variant's look.

A `pending` entry names the gap item that will make it hold and fails today with the text of `failsWith`, by default the property and the value it expected. Once it matches, it fails with `now holds: mark it holds`. Among them is Button's `:disabled` look, opacity 0.5, the not-allowed cursor and no pointer events, which waits for the Button pull request (Q182).

## The harm when it breaks

A variant renders like another, a hover or a pressed state draws nothing, the dark scheme keeps a light colour, or a disabled button looks pressable, and no check says so because each story only looks right to whoever last opened it.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/spec/look` | The look entries, each exported as `look`, and `reference.ts`, the reference's literal values. |
| `packages/core/spec/format.ts`: `defineLook`, `lookEntry`, `held`, `style` | A look entry is an entry whose check is a computed style. |
| `packages/core/spec/runner.ts`: `runSpecs` | It mounts each fixture in a host with the entry's scheme, under its media, checks the attributes the entry requires, enters the state with the user's pointer, a held press or the keyboard's Tab, up to twenty stops, waits for every CSS transition to finish, and compares the computed value with a probe's. It restores the viewport it read at start. |
| `packages/core/spec/computed.ts`: `sameColour`, `sameLength`, `channelTolerance` | The colour comparison on a canvas over white and over black. |
| `packages/core/spec/commands.ts`: `specCommands` | The press held down and the reduced-motion emulation, through Playwright. |
| `packages/core/spec/fixtures.ts`: `fixture`, `tabs` | The fixtures. |
| `packages/core/spec/registry.ts`: `lookSpecs`, `specs`, `drawsNoLook` | Every look spec the runner reads. |
| `packages/core/tests/visual-spec.browser.test.ts` | It runs `lookSpecs` through `runSpecs`. |
| `packages/core/tests/spec-registry.test.ts` | The registry rule, read from the build. |
| `packages/core/src` | The styles, tokens and colour rules, built to `packages/core/dist/styles.css`. |
| `vite.config.ts` | It defines the `component spec` project in every engine with `specCommands`. |
| `scripts/browser-instances.ts`: `browserInEveryEngine` | The engines the project runs in. |
| `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `@stylexjs/stylex`, `vite-plus`, `@vitest/browser-playwright` and `playwright` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `06bb761`. Run `git diff 06bb761 -- packages/core/spec/look packages/core/spec/format.ts packages/core/spec/runner.ts packages/core/spec/computed.ts packages/core/spec/commands.ts packages/core/spec/fixtures.ts packages/core/spec/registry.ts packages/core/tests/visual-spec.browser.test.ts packages/core/tests/spec-registry.test.ts packages/core/src vite.config.ts scripts/browser-instances.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/visual-spec.browser.test.ts packages/core/tests/spec-registry.test.ts
```

It takes about a minute with all three engines installed, most of it the build every run starts with. With `CI` set, all three engines must be installed.

## The tool and why

No tool proves what a browser paints, so this is not a proof. Each entry reads the engine's own computed style in its real state, entered the way a user enters it, and compares it with what the same engine computes for the reference's value, so the comparison does not depend on how an engine writes a colour or a length. A screenshot would also compare pixels the spec does not name, so the check reads values instead.

## What a pass covers

- Every entry of `lookSpecs`, one test each, in each installed engine: the shared looks on TextInput and Tabs.Tab, and Button's eight variants in both schemes at rest, hovered, pressed, focused by the keyboard and disabled, its status looks, its sizes below and from the md breakpoint, its parts and its motion. To count the entries of a look spec and how many hold, filter its `entries` by `status` in a Node script that imports `packages/core/spec/registry.ts`.

## What a pass does not cover

- Pseudo-elements, and looks the spec does not name.
- Touch and forced colours.
- Whether a pending entry's expected value is the reference's: a reviewer reads it against the token when it is written.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **`<part>, <property>: expected <value>, computed <probe>; it is <actual>`.** The part computes another value than the reference's. For an entry that holds that is a regression of the look.
- **`data-variant="<variant>" is not on it`.** The variant is not built, or falls back to another.
- **`now holds: mark it holds`.** The look landed. If the component draws it on purpose, mark the entry `holds`.
- **`SpecError`.** The spec is wrong; its message says how: a value that names a custom property, one the engine does not take, one that follows its context, a colour the canvas cannot paint, or a part the keyboard does not reach.

## When the change is intended

- A look lands: run the check, and mark each entry that fails with `now holds` as `holds`.
- The reference changes a value: change it in `packages/core/spec/look/reference.ts` before you change the component.
- Mutation check after editing a component's styles: in `packages/core/src/Button.tsx` change `outlineOffset: "0.125rem",` to `outlineOffset: "0.25rem",` and run `vp test packages/core/tests/visual-spec.browser.test.ts`. It must fail on each Button entry `focus-visible … outline-offset is 2px`. Then add `opacity: { default: 1, ":disabled": 0.5 },` to the root styles of `packages/core/src/Button.tsx` and run the same command: each built variant's entry `disabled=true … opacity is 0.5` must fail with `now holds: mark it holds`. Restore both afterwards.
- Mutation check after editing the comparison: in `packages/core/spec/computed.ts` change `export const channelTolerance = 2;` to `-1` and run `vp test packages/core/tests/visual-spec.browser.test.ts`. Every colour entry that holds must fail. Then in `packages/core/spec/look/reference.ts` change `const accent = "oklch(0.6204 0.195 253.83)";` to `const accent = "var(--solix-color-blue-6)";` and run the same command: every entry that reads the accent must fail with a `SpecError` that says the value reads a custom property. The entries of the `white` and `gradient` grids that name the accent read no value: they fail first with `data-variant="<variant>" is not on it`, the failure they are pending with, so they pass. Restore both afterwards.
