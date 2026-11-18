---
name: verify-behaviour-protocol
description: Checks that the state of a component that takes its behaviour from UI SDK stays in agreement with the user's clicks and keys, for generated sequences and for every single key from every state, against a small model of each instance the playground renders. Today it covers the selection of `Tabs`. Use when a change edits a behaviour component, `packages/core/src/step-over-disabled.ts`, `packages/core/src/headless.ts`, the setups the playground renders, the SDK's version, or Solid, the Solid plugin, Playwright or fast-check.
---

# Verify the protocol of a behaviour component

## The promise

For any sequence of clicks and keys on an instance of a behaviour component that the playground renders, what the page shows is what a model of that instance says. The model knows only what a user could know about the instance, and nothing about the code.

Each behaviour component has one row here. The next one adds a row, a setups module and its checks, and a model only where the roving list does not describe it.

| Component | Covered code | Setups the playground renders | Model | Checks |
| --- | --- | --- | --- | --- |
| `Tabs` | `packages/core/src/Tabs*.tsx`, `packages/core/src/tabs-context.ts`; `apps/playground/src/sections/TabsSection.tsx`, which renders every entry of `tabsSetups` as a set of tabs whose list is named for the entry, with the entry's direction as `dir` and each panel's text from `panelOf`; and `apps/playground/tests/support/tabs.ts`, whose `keyboardTable` is the tabs pattern written by hand and whose `stateOf` reads the selected tab, the focused tab and the tabs with `tabindex` 0 by their index in the list, names them from the setups module, and reads the panels displayed | `apps/playground/src/sections/tabs-setups.ts` | `apps/playground/tests/support/roving-list-model.ts`, given each setup through `rovingListOf` in `apps/playground/tests/support/tabs.ts` | `apps/playground/tests/roving-list-model.test.ts`, `apps/playground/tests/tabs-protocol.test.ts` and the single steps in `apps/playground/tests/tabs.test.ts` |

**The selection of Tabs.** The model of a list holds two facts, the selected tab and the focused tab. It knows the list's tabs and which are disabled, its orientation, its direction, whether it wraps, whether an arrow selects, and whether a click on the selected tab selects none.

- A click, Enter or Space selects the tab, or selects none where the list allows it and the tab was selected.
- An arrow along the orientation, Home or End moves focus to the next enabled tab that way, wrapping where the list wraps, and selects it where arrows select. In a right-to-left list the left and right arrows change places.
- An arrow across the orientation changes nothing.

After every action the selected tab, the focused tab and the panel shown are the model's, the list has one tab stop, and the tab stop is the selected tab whenever one is selected. In the generated sequences, the tabs that carry `data-active` are also exactly the ones whose `aria-selected` is `true`.

## The harm when it breaks

Focus rests on a tab the user cannot select, an arrow key selects a disabled tab or skips an enabled one, two tabs are tab stops or none is, or the panel on screen is not the selected tab's.

## Does your change touch it?

It does if it edits a file the table above names, or any of these:

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/src/headless.ts`: `createBehaviour`, `bindSlot` | A component's own handler for an event runs before the SDK's, and the SDK's does not run once the default is prevented. |
| `packages/core/src/step-over-disabled.ts`: `stepOverDisabled` | It returns `onKeyDown` for the list, which runs before the SDK's key handler, and `item(value)`, a ref by which each item registers its value. It reads the orientation from `data-orientation` on the list and the direction from the list's computed style, moves focus past a disabled item, prevents the default so the SDK leaves the key alone, and calls `activate` with the value the focused item registered. |
| `tests/support` | It builds the library and the app in production mode before any test and starts the built playground once. |
| `scripts/browser-engines.mjs` | It lists the engines the checks run on. |
| `vite.config.ts` | It sets the test include globs, the global setup and the Solid plugin. |
| `@ui-sdk/core`, `@ui-sdk/solid`, `solid-js`, `@solidjs/signals`, `@solidjs/web`, `@solidjs/compiler`, `@solidjs/vite-plugin`, `playwright` and `fast-check` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `d67b2cc`. Run `git diff d67b2cc -- packages/core/src apps/playground/src/sections apps/playground/tests tests/support scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the tables before you trust a pass. Move the commit forward only after you have confirmed that the tables and the checks still describe the code at the new commit.

## Run it

```bash
vp test apps/playground/tests/roving-list-model.test.ts apps/playground/tests/tabs-protocol.test.ts apps/playground/tests/tabs.test.ts
```

It takes about thirty seconds with one engine installed. With `CI` set, all three engines must be installed.

## The tool and why

No model checker runs on a Solid component or on the SDK, so this is not a proof. The selection is a small state machine, so the checks run the real component against a model of it in three ways.

- `roving-list-model.test.ts` runs in Node. It checks every row of the hand-written keyboard table against the model, so the model and the pattern as a person wrote it down agree before a browser opens.
- The single steps in `tabs.test.ts` take every state the model can reach in each list and every key, bring the page to that state by the shortest way the model knows, press the key, and compare the page with the model. This covers every key from every state, once.
- `tabs-protocol.test.ts` uses fast-check's model-based commands. It generates sequences of clicks and keys, runs each against the built app from a fresh page load, and compares the page with the model after every action. A failing sequence is shrunk to the shortest that still fails. An arrow key the list leaves to the page scrolls the page, so `clickTab` in `apps/playground/tests/support/tabs.ts` begins a click only once the page has not scrolled for `stillFrames` animation frames, and fails with `the click did not reach the tab` when no click event lands on the tab.

## What a pass covers

- Every row of the keyboard table against the model.
- Every key of `keys` in `roving-list-model.ts` from every state the model can reach, in each list `tabsSetups` describes, per engine. The lists differ in every fact the model holds: a disabled tab in the middle, at the end and at both ends, vertical and horizontal, left to right and right to left, wrapping and not, selecting on an arrow and not, and able to select none.
- `generatedRuns` generated sequences per engine per run, of up to `longestSequence` actions, as `tabs-protocol.test.ts` sets them, each starting from a fresh page load on one list of `tabsSetups`.

## What a pass does not cover

- A click on a disabled tab, which moves focus differently in each engine. `apps/playground/tests/tabs.test.ts` checks that it selects nothing.
- The lists the section writes by hand, outside `tabsSetups`. Tests of their own in `apps/playground/tests/tabs.test.ts` hold a controlled value, a value the app never changes, and tabs and panels that mount later, and one in `apps/playground/tests/behaviour-seam.test.ts` the arrow keys in a shadow root.
- The Tab key. A test of its own in `apps/playground/tests/tabs.test.ts` holds where it puts focus.
- That a still page stays still. `clickTab` waits for `stillFrames` frames without a scroll, measured in Chromium only, and a scroll that starts after that is caught only by the click's own report.
- The clicks of the single steps and of the other tests in `apps/playground/tests/tabs.test.ts`, which click without that wait.
- Which tab is the tab stop while none is selected. The checks require one tab stop and do not say which.
- A list whose own direction differs from its tabs', and a list that changes its orientation or direction while the page is open.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **`the roving-list model agrees with the keyboard table` fails.** The table and the model disagree, and no browser was involved. Decide from the tabs pattern which is wrong. A row whose start the model cannot reach names a disabled tab or a tab the list does not have.
- **A single step fails.** Its name is the list, the state, the key and what the model expects, such as `in Vertical, with Gamma selected and focus on Gamma, after ArrowDown Alpha is selected and focus is on Alpha`. Replay it by hand in the playground. If the page is right and the model wrong, fix the model and say what was wrong. If the page is wrong, it is a bug in the component or a change in the SDK; report it in those words and do not loosen the model.
- **The generated check fails after `Counterexample`.** It prints the list and the shortest sequence, such as `click the enabled tab at position 1, counted round the list, press ArrowLeft`, and the first observation that disagreed. Treat it as a single step that the single steps missed, and say which state they do not reach.
- **`the click did not reach the tab`.** The press went somewhere else, and the message lists the events the page saw with how far it was scrolled at each. The component was not asked to select anything, so this is a fault of the drive, not of `Tabs`: look for what moved the page after `clickTab` found it still.
- **A timeout in `page.goto` or a click.** The server did not start, or the section no longer renders what `tabsSetups` describes.
- To replay one generated failure, add the printed `seed` and `path` to the parameters passed to `assertProperty`, run again, and remove them afterwards.

## When the change is intended

- A new list of tabs in the playground, or a changed one: change its entry in `tabsSetups`, which the section renders and the model reads, and give it a row in `keyboardTable`.
- A new fact about a list, such as tabs that close: add it to `TabsSetup`, to `RovingList` through `rovingListOf`, and to the model, with a row in the table that shows it.
- A new way to change the selection: add an action to the model and a command class to `steps` in the generated check.
- A new behaviour component: add its row to the first table, its setups beside the section that renders them, and the three checks for it. A list whose items take focus by arrow keys, such as a menu, a listbox or a radio group, describes each setup as a `RovingList` and reuses the model in `roving-list-model.ts`, adding a fact to `RovingList` and the model only where its pattern differs; anything else gets a model of its own beside it.
- Upgrading the SDK, Solid, Playwright or fast-check: run the command above.
- Mutation check after editing covered code: in `packages/core/src/step-over-disabled.ts` make the `onKeyDown` that `stepOverDisabled` returns return at once and run the command. The single steps must fail on a key that points at a disabled tab, such as `in Account, with Overview selected and focus on Overview, after ArrowRight Members is selected and focus is on Members`, and the generated check must fail with a sequence that presses an arrow towards a disabled tab. Restore the file afterwards.
