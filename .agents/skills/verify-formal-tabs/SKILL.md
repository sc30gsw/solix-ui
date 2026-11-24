---
name: verify-formal-tabs
description: Model-checks the selection and roving focus of `Tabs` with tla-ts, for every list of up to four tabs, every disabled set and every orientation, direction, wrap and activation, proves that the SDK's roving step after the library's step over disabled tabs moves focus where the roving list says, and replays every step of each model's state graph against the real kernel and the built playground in every engine. Use when a change edits `Tabs`, `packages/core/src/roving-step.ts`, `packages/core/src/step-over-disabled.ts`, `packages/core/src/headless.ts`, a model or view under `formal/tabs`, the setups the playground renders, the graph reader or the statechart script, or tla-ts, the SDK, Solid, the Solid plugin or Playwright.
---

# Verify Tabs formally

## The promise

For every list of two to four tabs, every set of disabled tabs that leaves one enabled, both orientations, both directions, with or without wrapping, with arrows that select or not, and with a click on the selected tab that deselects it or not:

- Focus and selection rest only on an enabled tab, the list's one tab stop is the selected tab, else the first enabled one, and where arrows select, a selected tab is the focused one.
- A click, Enter or Space selects the tab, or selects none where the list deselects and the tab was selected. Enter and Space never move focus.
- An arrow along the orientation, Home or End moves focus to the next enabled tab that way, wrapping where the list wraps, and selects it where arrows select. In a right-to-left list the left and right arrows change places. An arrow across the orientation changes nothing.
- A click on a disabled tab changes nothing.
- Every row of the keyboard table beside `tabsSetups` holds.

The SDK's own roving step, which `stepPastDisabled` leaves a key to unless the tab it points at first is disabled, moves focus where the roving list says, and is never sent to a disabled tab.

In a controlled list the shown tab is the app's value. Every request is heard by the app, once. An app that holds its value keeps it, and an app's value changes only to the tab it was asked for, or to none from its own button. A click on a tab whose own handler refuses it asks for nothing.

The page agrees with the models step for step, at once and after it settles: every click and key from every state the models reach in each list of tabs the playground renders.

## The harm when it breaks

Focus rests on a tab the user cannot select, an arrow selects a disabled tab or skips an enabled one, a key across the orientation moves the selection, the list has no tab stop, a controlled list shows a value the app does not hold, or a request never reaches the app.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/src/roving-step.ts`: `stepPastDisabled` | The kernel, in tla-ts's TypeScript subset, with no DOM, loop or string method. For a key on the item at `from` it handles the key only when the item the key points at first is disabled, and then walks to the next enabled item that way, wrapping where the list loops, or stays at `from`. Otherwise it leaves the key to the SDK. `formal/tabs/step-over.model.ts` imports it, so the model checks the code itself. |
| `packages/core/src/step-over-disabled.ts`: `stepOverDisabled` | The DOM shell around the kernel. It reads which items are disabled, the orientation from `data-orientation` on the list and the direction from the list's computed style, calls `stepPastDisabled`, prevents the default when it handles the key so the SDK leaves the key alone, focuses the item it steps to and calls `activate` with the value that item registered. Only the replay on the playground covers it. |
| `packages/core/src/Tabs*.tsx`, `packages/core/src/tabs-context.ts` | `Tabs` gives the SDK the value, the orientation, the loop and automatic or manual activation, puts the shell's `onKeyDown` on the list before the SDK's, deselects on a click on the selected tab where `allowTabDeactivation` is set, and in a controlled list shows `value` and tells `onChange` each request. |
| `packages/core/src/headless.ts`: `createBehaviour`, `bindSlot` | A component's own handler for an event runs before the SDK's, and the SDK's does not run once the default is prevented. |
| `formal/tabs` | The models, the spec they share and their chart views. `formal/tabs/roving-list.ts` specifies the roving list on indexes, through `afterClick`, `afterKey` and `tabStopOf`, and `formal/tabs/roving-list.model.ts` narrows its indexes to the model's tabs. `formal/tabs/step-over.model.ts` composes the SDK's roving step, restated from the pinned SDK's `moveIndex` and `stepFor`, with the kernel. `formal/tabs/controlled-tabs.model.ts` restates a controlled list whose app hears each request in a fair step of its own. `formal/tabs/setups.ts` reads the playground's setups as the models' variables, for the replay and the views. |
| `apps/playground/src/sections/tabs-setups.ts`, `apps/playground/src/sections/TabsSection.tsx` | The section renders every entry of `tabsSetups`, and the `Controlled` and `Held` lists from `controlledSetups`: their value, whether the app follows `onChange`, and the tab whose own handler refuses a click. `keyboardTable` holds the tabs pattern written by hand, in the tabs' names. |
| `apps/playground/tests/support/tabs.ts`: `namedListOf`, `afterClickByName`, `afterKeyByName`, `stateFrom`, `snapshotOf`, `clickTab` | The adapter by which the keyboard table and the generated check of `verify-behaviour-protocol` run the spec on the tabs' names, and the reader of the selected tab, the focused tab, the tab stops, the panels shown and the tabs with `data-active`. |
| `apps/playground/tests/support/formal.ts` | It gives the playground's tests the spec, the setups' reading and the formal modules from one place. |
| `scripts/formal`: `compileModel`, `checkCompiled`, `checkedGraph`, `parseStateGraph`, `stepTable`, `varsMatch` | It compiles a model once through the CLI in a scratch directory under `node_modules/.cache`, so no run writes beside it, checks it with tla-ts's `check`, reads the `dot,actionlabels` dump's variables and its action labels with their parameters, and turns a graph into the steps a page can show, following a model's internal steps until they settle and counting them. |
| `tests/support/graph-replay.ts`: `replayGraph` | It replays each step of a step table on a page, from the state the step before it reached, and compares the page at once and after a settle, the count the page keeps included. |
| `scripts/statechart.ts`, `scripts/draw-statechart.ts` | They check a model with tla-ts alone, check it again without each rule that broke to give the shortest path to every one, and draw the chart from the dumped graph through a view. |
| `scripts/formal-verification.ts`: `kernelModules`, `modelFilePatterns` | The kernel list that `tests/formal-kernels.test.ts` holds, and the names a model may have. |
| `tests/support/build-packages.ts`, `tests/support/served-app.ts` | They build the library and the app in production mode before any test and start the built playground once. |
| `scripts/browser-engines.mjs` | It lists the engines the replay runs on. |
| `vite.config.ts` | It sets the test include globs, the global setup, the Solid plugin, and lets a model declare a variable that tla-ts chooses at the start. |
| `tla-ts`, `@ui-sdk/core`, `@ui-sdk/solid`, `solid-js`, `@solidjs/signals`, `@solidjs/web`, `@solidjs/compiler`, `@solidjs/vite-plugin` and `playwright` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. An SDK upgrade is an assumption to read again: `formal/tabs/step-over.model.ts` restates its roving step. |

Last confirmed against commit `eba5473`. Run `git diff eba5473 -- packages/core/src apps/playground/src/sections apps/playground/tests/support formal/tabs scripts/formal tests/support/graph-replay.ts tests/support/build-packages.ts tests/support/served-app.ts scripts/statechart.ts scripts/draw-statechart.ts scripts/formal-verification.ts scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp exec tla-ts -noGenerateSpecTE formal/tabs/roving-list.model.ts
vp exec tla-ts -noGenerateSpecTE formal/tabs/step-over.model.ts
vp exec tla-ts -noGenerateSpecTE formal/tabs/controlled-tabs.model.ts
vp test tests/roving-step.model.test.ts apps/playground/tests/tabs.model.test.ts apps/playground/tests/keyboard-table.test.ts tests/formal-kernels.test.ts tests/statechart.test.ts
```

Each model takes a few seconds: the roving list reaches about 28,600 states, the step over about 4,600 and the controlled list about 600. Each writes its `.tla` and `.cfg` beside itself, which git ignores. The tests compile copies, check them with tla-ts's `check`, dump each graph and replay it; the replay takes a few minutes in three engines, and with `CI` set all three engines must be installed.

To read a result, draw each model's chart with the method of pstack's `statechart`, through the repository's script and the model's view, into a scratch folder:

```bash
node scripts/draw-statechart.ts formal/tabs/roving-list.model.ts --view formal/tabs/roving-list.view.ts --out <scratch>/roving-list
```

It prints the report and the Mermaid chart and writes both to `--out`. The report gives the shortest path to each invariant or step rule that breaks, and a behaviour that breaks each temporal property, in the view's words, and names the rules that hold. A chart above its cap, 30 states unless `--max-states` says otherwise, is refused with the number it would draw; give the view a coarser `state` or a narrower `keep`. A pull request that changes a model puts each chart in its body.

## The tool and why

tla-ts is the one checker: it compiles each TypeScript model to TLA+ and checks every reachable state, so within its bounds this is a proof, not a sample. The roving list and the controlled list restate the code, since `Tabs` is JSX on Solid and the SDK, so the replay ties them to it: it dumps each graph as `dot,actionlabels`, and for each list the playground renders it takes every state the graph reaches from that list's start, brings a page there by the shortest path in the graph from the state the step before reached, applies each click and key, and compares the page with the graph, at once and again after a settle. A click or key the graph has no step for from a state is one whose guard is false there; the page must show nothing changed. The graph keeps a step that changes only the history variable of the roving list, so a key that changes nothing is a step there too. The step over imports the kernel, so the code is the model there; its replay runs the kernel as JavaScript on every state of the graph, which catches a reading of the code that differs between tla-ts and JavaScript. No proof covers the kernel at every size: tla-ts's prover reads no recursive operator.

## What a pass covers

- Every state of each model within its bounds: lists of two to four tabs, every disabled set, every flag, and for the controlled list an app that follows or holds, every refusing tab and every value.
- The keyboard table beside `tabsSetups`, which has rows for every list of it and holds as `formal/tabs/roving-list.ts` specifies; `verify-behaviour-protocol`'s generated check runs the same spec.
- Every click and key from every state of each list of `tabsSetups`, of the `Controlled` list and of the `Held` list, in each engine, with one tab stop, on the selected tab, else the first enabled one, the selected tab's panel alone shown, and `data-active` exactly on the tab whose `aria-selected` is `true`; for `Held`, the count of requests the app heard.
- The kernel against tla-ts's reading of it, on every list, starting tab and move of the step-over model.

## What a pass does not cover

- Where focus goes on a click on a disabled tab and on a click that the `Controlled` list's third tab refuses, which each engine decides. The replay compares the selection or the value there, and reads focus from the page; after a disabled click that leaves focus off the list it starts the list again.
- Home and End from a focused item that is disabled only by `aria-disabled`: the models take focus to rest on enabled tabs, which `Tabs` keeps, since a disabled tab is a disabled button.
- The SDK past the restatement in `formal/tabs/step-over.model.ts`.
- Lists of more than four tabs, tabs and panels that mount later, a list whose orientation or direction changes while the page is open, the Tab key, a shadow root and the hydration of the page, which `verify-behaviour-protocol` keeps.
- Random walks from tla-ts's `-simulate`. Long sequences are still `verify-behaviour-protocol`'s generated check, which runs the same spec.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **tla-ts reports `Invariant <rule> is violated`, `Action property <rule> is violated` or `Temporal property <rule> was violated`.** The model breaks a rule. Run `node scripts/draw-statechart.ts` on it with its view: the report gives the shortest path in words. When the model imports the kernel, the kernel is wrong; when it restates the code, the rule or the restatement is wrong, so read the code before you change either.
- **The keyboard table fails.** A row disagrees with `afterKey` in `formal/tabs/roving-list.ts`, names a list of no setup or starts on a tab its list does not have enabled. Decide from the tabs pattern which is wrong.
- **A replay fails.** Its name is the list, the state, the action and what the model expects, such as `in Account, with Overview selected and focus on Overview, press ArrowRight: with Members selected and focus on Members`. If the page is wrong, it is a bug in the component, the kernel's shell or a change in the SDK; fix it with this test and do not loosen the model. If the page is right, the model is wrong; say what was wrong when you fix it.
- **`<model> has 0 initial states that match the setup, not one`.** The setup no longer fits the model's bounds or its variables, such as a list of five tabs.
- **`the page left the state the last step reached`.** The page changed after the step before was compared, or the step before failed; read that one first.
- **`the app heard each request the model's internal steps deliver, once` fails.** The `Held` app heard a request twice, or none.
- **The kernel and tla-ts's reading of it disagree.** The kernel uses a construct whose meaning differs in TLA+, such as an object spread over an optional key; write it so both read it alike.
- **`tests/formal-kernels.test.ts` fails.** A kernel names a DOM type, a construct tla-ts refuses, or an export no model calls, a model imports a library source that is not a kernel, or a model's generated files are not in `.gitignore` by name.

## When the change is intended

- A new list of tabs in the playground, or a changed one: change its entry in `tabsSetups` or `controlledSetups`, and give it rows in `keyboardTable`.
- A new fact about a list, such as tabs that close: add it to the spec, the models and `formal/tabs/setups.ts`, add an invariant that says it, and let the replay compare it.
- New pure logic that a model should check: put it in a kernel module beside the component, in tla-ts's subset, list it in `kernelModules`, call it from the component and import it into a model.
- A new model: name it `*.model.ts` under `formal`, give it a view, add the spec and config tla-ts writes beside it to `.gitignore` by name, run it here, and chart it.
- Upgrading tla-ts, the SDK, Solid or Playwright: run the commands above. For the SDK, read its roving step against `sdkStep` in `formal/tabs/step-over.model.ts` again.
- Shell mutation: in `packages/core/src/step-over-disabled.ts` make the `onKeyDown` that `stepOverDisabled` returns return at once, and run `vp test apps/playground/tests/tabs.model.test.ts`. The models still pass, and the replay must fail on every key that points at a disabled tab, such as `in Account, with Overview selected and focus on Overview, press ArrowRight: with Members selected and focus on Members`. Restore the file afterwards.
- Kernel mutation: in `packages/core/src/roving-step.ts` make `walkPast` return `index` without checking that the item there is enabled, and run `vp test tests/roving-step.model.test.ts apps/playground/tests/tabs.model.test.ts`. tla-ts must find `theKeyMovesFocusWhereTheRovingListSays` violated, and the replay must fail on a key that points at two disabled tabs in a row, such as in `Optional`. Restore the file afterwards.
- Controlled mutation: in `packages/core/src/Tabs.tsx` make the `onChange` that `Tabs` gives `createUncontrolled` call nothing, and run `vp test apps/playground/tests/tabs.model.test.ts`. The replay of `Controlled` must fail on the first click on another tab, and that of `Held` on its count of requests. Restore the file afterwards.
