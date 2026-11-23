---
name: verify-behaviour-protocol
description: Checks that the state of a component that takes its behaviour from UI SDK stays in agreement with the user's clicks and keys, for generated sequences from a fresh page load, against a small model of each instance the playground renders, and that the drive waits for hydration and reports a click that misses its tab. Today it covers the selection of `Tabs`. Use when a change edits a behaviour component, `packages/core/src/step-over-disabled.ts`, `packages/core/src/headless.ts`, the setups the playground renders, the SDK's version, or Solid, the Solid plugin, Playwright or fast-check.
---

# Verify the protocol of a behaviour component

## The promise

For any sequence of clicks and keys on an instance of a behaviour component that the playground renders, from a fresh page load, what the page shows is what a model of that instance says. The model knows only what a user could know about the instance, and nothing about the code. Every single step from every state, the keyboard table, and the model itself against the graph tla-ts checks, are `verify-formal-tabs`'s.

Each behaviour component has one row here. The next one adds a row, a setups module and its checks, and a model only where the roving list does not describe it.

| Component | Covered code | Setups the playground renders | Model | Checks |
| --- | --- | --- | --- | --- |
| `Tabs` | `packages/core/src/Tabs*.tsx`, `packages/core/src/tabs-context.ts`; `apps/playground/src/sections/TabsSection.tsx`, which renders every entry of `tabsSetups` as a set of tabs whose list is named for the entry, with the entry's direction as `dir` and each panel's text from `panelOf`; and `apps/playground/tests/support/tabs.ts`, whose `stateOf` reads the selected tab, the focused tab and the tabs with `tabindex` 0 by their index in the list, names them from the setups module, and reads the panels displayed | `apps/playground/src/sections/tabs-setups.ts` | `apps/playground/tests/support/roving-list-model.ts`, given each setup through `rovingListOf` in `apps/playground/tests/support/tabs.ts` | `apps/playground/tests/tabs-protocol.test.ts` and `apps/playground/tests/tabs.test.ts` |

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

Last confirmed against commit `eba5473`. Run `git diff eba5473 -- packages/core/src apps/playground/src/sections apps/playground/tests tests/support scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the tables before you trust a pass. Move the commit forward only after you have confirmed that the tables and the checks still describe the code at the new commit.

## Run it

```bash
vp test apps/playground/tests/tabs-protocol.test.ts apps/playground/tests/tabs.test.ts
```

It takes about thirty seconds with one engine installed. With `CI` set, all three engines must be installed.

## The tool and why

No model checker runs on a Solid component or on the SDK, so this is not a proof. `verify-formal-tabs` checks the selection with tla-ts and replays every step of its graph on the page; this skill keeps the long sequences and the drive that runs them.

- `tabs-protocol.test.ts` uses fast-check's model-based commands. It generates sequences of clicks and keys, runs each against the built app from a fresh page load, and compares the page with the model after every action. A failing sequence is shrunk to the shortest that still fails. Each run opens the page through `opened(page, url, "hydrated")` in `apps/playground/tests/support/opening.ts`, which opens until `commit` and waits, all within `hydrationTimeout`, 10 s, less than the 30 s test timeout, until an effect of the app has marked `<html>` with `data-hydrated` once the page hydrated, so no step acts on the server's markup before its handlers exist and no read waits behind the script; a page that does not get there fails with `the page did not become ready`. Two pages whose client script hydrates late, one that waits and one that keeps the page busy, run the two sequences that failed in CI as the first run in a cold engine, and a page that never hydrates must fail so. `clickTab` in `apps/playground/tests/support/tabs.ts` fails with `the click did not reach the tab` when no click event lands on the tab.

## What a pass covers

- `generatedRuns` generated sequences per engine per run, of up to `longestSequence` actions, as `tabs-protocol.test.ts` sets them, each starting from a fresh page load on one list of `tabsSetups`. The lists differ in every fact the model holds: a disabled tab in the middle, at the end and at both ends, vertical and horizontal, left to right and right to left, wrapping and not, selecting on an arrow and not, and able to select none.

## What a pass does not cover

- A click on a disabled tab, which moves focus differently in each engine. `verify-formal-tabs` replays one from every state and `apps/playground/tests/tabs.test.ts` checks that it selects nothing.
- Every single step from every state, the keyboard table, and the controlled and held lists, which `verify-formal-tabs` replays from tla-ts's graph.
- The lists the section writes by hand, outside `tabsSetups`. Tests of their own in `apps/playground/tests/tabs.test.ts` hold a controlled value, a value the app never changes, and tabs and panels that mount later, and one in `apps/playground/tests/behaviour-seam.test.ts` the arrow keys in a shadow root.
- The Tab key. A test of its own in `apps/playground/tests/tabs.test.ts` holds where it puts focus.
- A click that misses its tab because the page moves under the pointer. An arrow key the list leaves to the page scrolls the page, in Chromium for up to 155 ms; in fifty repetitions per engine of a click, such a key and a click, no click missed its tab, so the drive does not wait for the page to come to rest, and a miss is caught only by the click's own report.
- The clicks of the tests in `apps/playground/tests/tabs.test.ts`, which do not report a click that misses its tab.
- Which tab is the tab stop while none is selected. The checks require one tab stop and do not say which.
- A list whose own direction differs from its tabs', and a list that changes its orientation or direction while the page is open.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **The generated check fails after `Counterexample`.** It prints the list and the shortest sequence, such as `click the enabled tab at position 1, counted round the list, press ArrowLeft`, and the first observation that disagreed. Replay it by hand in the playground. If the page is right and the model wrong, fix the model and say what was wrong; `verify-formal-tabs` then fails too, since it holds the model to tla-ts's graph. If the page is wrong, it is a bug in the component or a change in the SDK; report it in those words and do not loosen the model.
- **`the click did not reach the tab`.** The press went somewhere else, and the message lists the events the page saw with how far it was scrolled at each. The component was not asked to select anything, so this is a fault of the drive, not of `Tabs`: look for what moved the page under the pointer.
- **`the page did not become ready`.** The client script did not mark `<html>` with `data-hydrated` within `hydrationTimeout`, so the drive never acted. The message carries every console message and page error the page raised while it opened, which names a script that failed to load or threw.
- **A timeout in `page.goto` or a click.** The server did not start, or the section no longer renders what `tabsSetups` describes.
- To replay one generated failure, add the printed `seed` and `path` to the parameters passed to `assertProperty`, run again, and remove them afterwards.

## When the change is intended

- A new list of tabs in the playground, or a changed one: change its entry in `tabsSetups`, which the section renders and the model reads, and follow `verify-formal-tabs` for its keyboard table and its model.
- A new fact about a list, such as tabs that close: add it to `TabsSetup`, to `RovingList` through `rovingListOf`, and to the model, and to the models of `verify-formal-tabs`.
- A new way to change the selection: add an action to the model and a command class to `steps` in the generated check.
- A new behaviour component: add its row to the first table, its setups beside the section that renders them, and the checks for it. A list whose items take focus by arrow keys, such as a menu, a listbox or a radio group, describes each setup as a `RovingList` and reuses the model in `roving-list-model.ts`, adding a fact to `RovingList` and the model only where its pattern differs; anything else gets a model of its own beside it.
- Upgrading the SDK, Solid, Playwright or fast-check: run the command above.
- Mutation check after editing covered code: in `packages/core/src/step-over-disabled.ts` make the `onKeyDown` that `stepOverDisabled` returns return at once and run `SOLIX_PROPERTY_SEED=-742600836 vp test apps/playground/tests/tabs-protocol.test.ts`. The generated check must fail, and so must the replay of `firstRunsThatFailedInCi`, whose own seeds press an arrow towards a disabled tab. Restore the file afterwards.
