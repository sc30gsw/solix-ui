---
name: verify-headless-seam
description: Checks two promises of the behaviour seam for generated inputs and not only the cases the app uses. The merge order of a part bound to a UI SDK slot, for generated consumer props, component props and slot props. And the selection of `Tabs`, for generated sequences of clicks and keys against a model of each list. Use when a change edits `packages/core/src/headless.ts`, `createParts`, `Tabs` or its parts, the SDK's version, or Solid, the Solid plugin, Playwright or fast-check.
---

# Verify the behaviour seam

## The promises

**The merge order.** A part bound to a slot is given three sets of props: the consumer's and the styles' (`ours`), the component's own (`own`), and the SDK's for the slot. `bindSlot` in `packages/core/src/headless.ts` merges them in one order, whatever they hold:

- The SDK is told only attributes, the consumer's over the component's, and the id that is the consumer's, else the component's. It is told no handler, ref, class or style.
- An event reaches the consumer's handler, then the component's, then the SDK's, and stops after the first that prevents its default. A handler written as Solid's bound pair `[handler, data]` counts as one.
- A ref receives the element in the same order.
- The id is the consumer's, else the component's, else the SDK's.
- The class is ours alone, even if the SDK gave one.
- A declaration of the SDK's style gives way to ours, whether ours is an object or a string.
- Every other attribute the SDK returns is on the part.

Bound to the SDK's real tabs slots, each part keeps exactly our classes and style, takes the slot's role, takes our id where we gave one and the SDK's where we did not, with the panel labelled by whichever id the tab has, and a click reaches the component's handler and then selects through the SDK unless the component prevented the default or the tab is disabled.

**The selection of Tabs.** For any sequence of clicks on enabled tabs, arrow keys, Home, End, Enter and Space, on any list of tabs the playground renders, the selected tab, the focused tab, the panel shown and the list's one tab stop are what a model of the list says. The model knows only the list: its tabs and which are disabled, its orientation, whether it wraps, whether an arrow selects, and whether a click on the selected tab selects none. A click or Enter or Space selects the tab, or selects none where the list allows it and the tab was selected. An arrow along the orientation, Home or End moves focus to the next enabled tab that way, wrapping where the list wraps, and selects it where arrows select. The tab stop is the selected tab whenever one is selected.

## The harm when it breaks

A consumer's `onClick` runs after the SDK already selected, or cannot stop it. A ref points at nothing, a label points at an id no element has, the SDK's class or inline style replaces the look a consumer set. In `Tabs`, focus rests on a tab the user cannot select, an arrow key selects a disabled tab or skips an enabled one, two tabs are tab stops or none is, or the panel on screen is not the selected tab's.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/src/headless.ts`: `bindSlot`, `createBehaviour`, `Behaviour` | `bindSlot(ours, own, slot)` calls `slot` once with the attributes and merges what it returns. `createBehaviour` wraps the SDK's `usePrimitive`, and its `parts` gives `createParts` one binder per named part that calls `bindSlot` with the SDK's slot getter. |
| `packages/core/src/parts.ts`: `createParts`, `PartsBehaviour`, `PartProps` | Given a behaviour before the kept keys, `createParts` binds the root and every named part once, when it is called, and throws for a part its styles do not name. |
| `packages/core/src/Tabs.tsx`, `packages/core/src/TabsList.tsx`, `packages/core/src/TabsTab.tsx`, `packages/core/src/TabsPanel.tsx`, `packages/core/src/tabs-context.ts` and `packages/core/src/tabs-keyboard.ts` | `Tabs` always gives the SDK a value, so the SDK never selects the first tab itself. A tab's own click handler selects none and focuses the tab. The list's own key handler runs before the SDK's and steps over a disabled tab. |
| `apps/playground/src/sections/TabsSection.tsx` | It renders the lists `Account`, `Manual vertical`, `Vertical` and `Optional` exactly as `tabsSetups` describes them. |
| `apps/playground/tests/support/tabs.ts`: `tabsSetups`, `stateOf`, `tabNamed` | `tabsSetups` is the model's knowledge of each list. `stateOf` reads the selected tab, the focused tab, the panels displayed and the tabs with `tabindex` 0 from the page. |
| `packages/core/tests/headless.test.tsx` | The merge-order check. Its first test draws three sets of props and a stand-in slot. Its second binds a probe component to the SDK's tabs slots and renders it with Solid's server renderer from `packages/core/dist`. |
| `apps/playground/tests/tabs-protocol.test.ts` | The selection check. It holds the model, `destinationOf` and `pressOn`, and runs the commands against the built playground in each installed engine. |
| `tests/support` | It builds the library and the app in production mode before any test and starts the built playground once. |
| `scripts/browser-engines.mjs` | It lists the engines the selection check runs on. |
| `vite.config.ts` | It sets the test include globs, the global setup and the Solid plugin. |
| `@ui-sdk/core`, `@ui-sdk/solid`, `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `playwright` and `fast-check` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `e1fe171`. Run `git diff e1fe171 -- packages/core/src/headless.ts packages/core/src/parts.ts packages/core/src/Tabs.tsx packages/core/src/TabsList.tsx packages/core/src/TabsTab.tsx packages/core/src/TabsPanel.tsx packages/core/src/tabs-context.ts packages/core/src/tabs-keyboard.ts apps/playground/src/sections/TabsSection.tsx apps/playground/tests/support/tabs.ts packages/core/tests/headless.test.tsx apps/playground/tests/tabs-protocol.test.ts tests/support scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/headless.test.tsx apps/playground/tests/tabs-protocol.test.ts
```

It takes about thirty seconds with one engine installed, most of it the build that every test run starts with. With `CI` set, all three engines must be installed.

## The tool and why

No model checker or verifier runs on a Solid component or on the SDK, so neither check is a proof. Both use fast-check on the real code. The merge order is a pure function of three objects, so the first test generates the objects and a stand-in for the slot, and checks the function for 300 draws; the second test generates our props and the tab's slot props and checks the same order against the SDK itself, rendered on the server. The selection is a state machine, so the check uses fast-check's model-based commands against the built app in a real browser, and compares the page with the model after every command. A failing sequence is shrunk to the shortest that still fails.

## What a pass covers

- 300 draws per run of the stand-in test. Each of the three sources may give an id, a ref, a class, a style as an object or a string, any of four attributes, and any of `onClick`, `onKeyDown` and `onFocus`, each a plain function or a bound pair, each preventing the default or not.
- 300 draws per run against the SDK's `root`, `list`, `tab` and `panel` slots: a consumer class and id on the root, a component id on the tab, the tab disabled or not, and a component click handler that prevents the default or not.
- That `createParts` throws for a behaviour that binds a part its styles do not name, and that a symbol key of ours does not break the binding.
- 15 generated sequences per engine per run, of up to twelve commands, each starting from a fresh page load on one of the four lists. The lists differ in every fact the model holds: a disabled tab in the middle, disabled tabs at both ends, vertical and horizontal, wrapping and not, selecting on an arrow and not, and able to select none.

## What a pass does not cover

- Handlers and refs in a browser. The stand-in test calls merged handlers with a stand-in event, and the SDK test calls the tab's click handler directly in Node. `apps/playground/tests/tabs.test.ts` holds one real case: a tab whose own click handler prevents the default is not selected.
- An SDK slot whose attributes include a style. No tabs slot has one, so the style order is checked against the stand-in only.
- A slot bound inside a list callback. `createParts` binds every part in the component's body, and no component binds one per item yet.
- A click on a disabled tab, which moves focus differently in each engine. `apps/playground/tests/tabs.test.ts` checks that it selects nothing.
- A right-to-left list, the `Controlled` list, the Tab key, and a tab or panel added or removed after the first render. The keyboard table in `apps/playground/tests/tabs.test.ts` holds right to left and the Tab key.
- Firefox and WebKit where they are not installed. The selection check has only been seen to pass in Chromium outside CI.

## Reading a failure

- **The stand-in test fails.** fast-check prints the three drawn sources under `Counterexample`. Say which rule broke in the terms above, for example "a component handler that prevents the default did not stop the SDK's". A failure in `expect(seen)` means the SDK is being told something other than attributes.
- **The SDK test fails on a class, a style or a role.** The SDK's slot began to write a class or a style attribute, or its role changed. Read the SDK's release notes before changing `bindSlot`.
- **The SDK test fails on `aria-labelledby`.** The SDK no longer labels the panel by the id it was told. A component's own id reaches the SDK only through `bindSlot`'s attributes.
- **The selection check fails after `Counterexample`.** It prints the list and the shortest sequence, such as `click the enabled tab at position 1, counted round the list, press ArrowLeft`, and the first observation that disagreed. Replay it by hand in the playground. If the page is right and the model wrong, fix `destinationOf` or `pressOn` and say what was wrong. If the page is wrong, it is a bug in `Tabs` or a change in the SDK; report the sequence in those words and do not loosen the model.
- **A timeout in `page.goto` or a click.** The server did not start, or `TabsSection.tsx` no longer matches `tabsSetups`.
- To replay one failure, add the printed `seed` and `path` to the options object passed to `fc.assert`, run again, and remove them afterwards.

## When the change is intended

- A new source of props in the order, or a new kind of prop: change `bindSlot`, then the sources and the expectations in the first test, from the rule you intend, before you rerun.
- A new list of tabs in the playground, or a changed one: change its entry in `tabsSetups` in the same commit as `TabsSection.tsx`.
- A new way to change the selection, such as a close button on a tab: add a command class to `steps`, with its precondition and what it does to the model.
- Upgrading the SDK, Solid, Playwright or fast-check: run both checks.
- Mutation check after editing covered code: in `packages/core/src/headless.ts` change `const inOrder = [ours, own, behaviour];` to put `behaviour` first and run the first file, which must fail with a counterexample whose consumer has a handler. In `packages/core/src/tabs-keyboard.ts` make `stepOverDisabledTabs` return at once and run the second file, which must fail with a sequence on `Account` or `Optional` that presses an arrow towards a disabled tab. Restore both afterwards.
