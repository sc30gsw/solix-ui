---
name: verify-primitives
description: Checks that every primitive in `@solix/primitives` renders on the server without reading a browser resource and gives its server value, keeps every behaviour its browser test pins in each engine with no Solid diagnostic and nothing left after dispose, and, when it keeps its state in `internal-value.ts`, agrees with a plain model for generated sequences of commands and flushes, not only the sequences a component uses. An element primitive also hydrates with its hydration keys aligned in the playground, a primitive that keeps focus in an element follows the engine's own Tab order for generated presses and changes, and a primitive that moves focus passes axe-core at WCAG 2.2 A and AA. Use when a change adds or edits a primitive, a helper or an internal module in `packages/primitives`, touches its test support, the browser project in `vite.config.ts` or the playground's primitives section, or changes Solid, the Solid plugin, Vitest, Playwright, fast-check or axe-core.
---

# Verify the primitives

## The promise

Every `create*` function the built barrel exports renders on the server inside Solid's `renderToString` while every name that `packages/primitives/tests/support/browser-resources.ts` lists throws when read. It reads none of them, gives the server value its case names, and returns nothing, or a tuple or object that holds only functions, so destructuring it never freezes a value. Node's own loader imports the build.

In the browser, each primitive does what its test pins, in every engine that `enginesToVerify()` in `scripts/browser-engines.mjs` returns. Each request decides on the value staged by the requests before it in the same tick; a request that changes nothing writes nothing and calls nothing. Once its owner is disposed, a command writes nothing and calls nothing. No test raises a Solid development diagnostic, and once every root a test mounted is disposed, no listener, timer or observation that the harness recorded is left.

For any sequence of commands with flushes between some of them, every primitive whose source imports `./internal-value` agrees with a plain model after every step.

A primitive that works on an element returns a ref setter, from the element slot in `internal-element.ts`, and adds its listeners through `createAttachment` in `internal-listener.ts`: one memo and one effect, created on the server and the client alike, whose compute reads no browser global and whose apply, which never runs on the server, attaches, and whose cleanup detaches. So a server render and its hydration create the same reactive nodes: in the playground's server render, hydrated in each engine, the element after one is the one the server sent, claimed with the server's hydration id, the listeners attach after hydration, and Solid's development build reports no hydration warning.

Of two nested handlers of one event, the one that handles it prevents its default and the other ignores an event whose default is already prevented. A primitive that listens on its element is reached by the inner one first. One that listens on the document is reached in the order it was attached.

A primitive that keeps focus inside an element lands, for any generated sequence of Tab and Shift+Tab presses among stops that are added, removed, disabled, hidden, made inert or given `tabindex="-1"`, where the engine's own Tab order says, and focus never leaves it. The order comes from real Tab presses through a mirror of the same stops that no primitive holds. Hotkey parsing and matching agree with the exact-match rule for generated chords in Node. A primitive that moves focus passes axe-core on the region it manages with the WCAG 2.2 A and AA tags.

## The harm when it breaks

A primitive that reads `window` or schedules a timer during server rendering crashes the page on the server or keeps the process alive. A primitive that decides on the committed value instead of the staged one runs `onOpen` twice for a double press, so a dialog opens twice or an analytics event doubles, and a toggle pressed twice before a flush lands on the wrong option. A controlled input that drops a request leaves the consumer at the wrong value. A command that still runs after dispose calls back into a component that is gone, and so does a listener or timer left behind. A returned value that is not a function is frozen at its first value in every component that destructures it. An effect that the server does not create shifts every later hydration key, so the server's markup after it is left unclaimed and dead, and a detached copy takes the listeners. A trap that lets Tab or Shift+Tab out leaves a keyboard user behind a modal surface. A press that dismisses on `pointerdown` closes a popover when the user only meant to drag or select, against WCAG 2.5.2. A hotkey that fires during IME composition runs when a Japanese or Chinese user confirms a candidate with Enter. An axe violation in a focus surface is a barrier for assistive technology.

## Does your change touch it?

It does if it edits any of these:

| Covered code | What the check assumes about it |
| --- | --- |
| `packages/primitives/src` | A command writes through `createValue` in `internal-value.ts`, which decides on the staged value, writes only when its comparison says the value changed, applies the same comparison in its memo, and refuses every update once its owner is disposed. `internal-request.ts` tells a request staged earlier in the same tick by the identity of the staged box. `internal-element.ts` writes the element a ref receives into a signal and nothing once its owner is disposed. `internal-listener.ts` creates one memo, compared by value, and one effect on both sides and attaches only in the effect's apply. `internal-tabbable.ts` reads the stops in the order Tab visits them. `internal-hotkey.ts` is pure. |
| `packages/primitives/build.mjs` | It writes `dist/*.js` with Babel's TypeScript preset and ends every relative specifier in `.js`. |
| `packages/primitives/tests/server-render.test.ts` | Its table is a mapped type over the barrel's `create*` exports, and it reads the build that `packages/primitives/tests/built-library.ts` loads. |
| `packages/primitives/tests/support` | `browser-resources.ts` is the one list of browser resources. `server-harness.ts` traps every name in it around a server render. `browser-harness.ts` records a registration made while it runs a primitive's code, by that scope and not by a call stack. `model.ts` commits the staged model at each flush. `accessibility.ts` runs axe-core with exactly the WCAG 2.2 A and AA tags. |
| `apps/playground/src/sections/PrimitivesSection.tsx` | It renders an element primitive's element with a component after it that stamps, from a ref, the hydration id it was claimed with. |
| `apps/playground/tests/primitives-hydration.test.ts` and `apps/playground/tests/dev-diagnostics.test.ts` | The first reads the production server render and its hydration. The second loads the development server, presses inside and outside the region, and fails on any warning, a hydration key miss included. |
| `packages/primitives/tests/fixtures` | Each fixture leaks one thing that `packages/primitives/tests/browser-harness.browser.test.ts` expects the harness to report. |
| `tests/primitive-conventions.test.ts` and `tests/support/syntax.ts` | The rules resolve bindings with the type checker, and each rule passes its allowed fixture and flags every line of its forbidden one. A primitive moves focus when its module calls a `focus` method, and its test runs axe when it calls `axeViolations` imported from the support module. |
| `tests/support` | It builds every package before the node project. |
| `vite.config.ts` | The browser project runs `packages/primitives/tests/**/*.browser.test.{ts,tsx}` with the Playwright provider, pre-bundles the dependencies its tests import, and reads its engines from `enginesToVerify()` in a getter. |
| `scripts/browser-engines.mjs` | With `CI` set, it requires every engine it names. |
| `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `@vitest/browser-playwright`, `playwright`, `fast-check` and `axe-core` in the catalog in `pnpm-workspace.yaml` | A signal's updater runs at once with the staged value, a read returns the committed value until the flush, and a flush notifies a signal whose staged value was written even when it equals the committed one. On the server an effect runs its compute and never its apply, and a memo and an effect each take one hydration id on both sides. An effect's apply runs again whenever its compute runs again, so a value compared by value goes through a memo. A ref is called with the element hydration claims. |

Last confirmed against commit `0421e69`. Run `git diff 0421e69 -- packages/primitives tests/primitive-conventions.test.ts tests/support scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml apps/playground/src/sections/PrimitivesSection.tsx apps/playground/tests/primitives-hydration.test.ts apps/playground/tests/dev-diagnostics.test.ts`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/primitives tests/primitive-conventions.test.ts apps/playground/tests/primitives-hydration.test.ts apps/playground/tests/dev-diagnostics.test.ts
```

It runs the server, build, hotkey and convention tests in the node project, every browser test in each installed engine, and the playground's hydration check against its production server and its development server, also in each installed engine. With `CI` set, every engine must be installed, or the browser project fails as it starts.

## The tool and why

No verifier runs on Solid's reactive runtime, so this is not a proof. The model tests use fast-check's model-based commands inside the engine, against the primitives' source compiled by the Solid plugin with Solid's development build. fast-check generates command sequences, runs each against the primitive and a plain model, compares them after every step, and shrinks a failing sequence to the shortest one that still fails. The model is written from the promise above, not from the code: it holds a staged and a committed copy of the state and commits at each flush. The other browser tests drive real input where a primitive takes an event: presses through Vitest's pointer API and keys through its keyboard API, which Playwright sends as the engine's own input. A key pressed while an input method composes text cannot be sent that way in every engine, so that test dispatches the event. The server test renders the build with Solid's own server renderer. The hydration check is Playwright against the playground's real server render, because hydration needs markup that the server compiled and a client compiled to claim it. The Tab-order check uses the engine itself as the oracle: no specification of the order is written down to drift from it. axe-core checks the region a focus primitive manages against the WCAG rules it implements.

## What a pass covers

- Every `create*` function the built barrel exports, rendered on the server with every name in `browser-resources.ts` trapped.
- For each model test, 100 generated sequences per engine per run, a different set each run, of up to 30 commands drawn at fast-check's medium size, with any number of commands between two flushes.
- The edge cases each browser test names.
- In every browser test, no Solid diagnostic and nothing left that the harness recorded, and the harness's own test, which shows it reports a leaked listener, timer, observation and diagnostic.
- Every rule of the primitive conventions, on the package and on its fixtures.
- For a primitive that keeps focus in an element, 25 generated sequences per engine per run of up to 12 steps, each a Tab or Shift+Tab press or a change to one of up to 4 starting stops of 4 kinds, with the engine's order read again after every change. Its fixed tests add positive `tabindex`, radio groups, shadow roots, a date input, two nested containers and a lost focus.
- For hotkey parsing and matching, 100 generated chords per property in Node, with every casing, alias and order of the parts.
- Hydration of the one element primitive the playground renders, in the production build and the development build. The other element primitives share its slot and its attachment.

## What a pass does not cover

- Hydration of an element primitive the playground does not render, and of one that does not use `createAttachment`.
- Nesting of two regions or two page-wide hotkeys that listen on the document: they decide in the order they were attached, not by depth. A Tab pressed while nothing has focus reaches every active focus container at the document, and the first one attached takes it.
- Links, scroll containers, positive `tabindex` and radio groups in the generated Tab sequences. Engines differ on links and scroll containers; the fixed tests cover the other two.
- Composition from a real input method. The composing event is dispatched.
- An axe rule outside the WCAG 2.2 A and AA tags, and markup other than the test's region. A primitive writes no attribute, so axe checks the markup a consumer builds around it.
- Firefox and WebKit on a machine where only Chromium is installed. CI runs every engine.
- A listener, timer or observer that a primitive registers outside the harness's scope: from a method of an object it returned, such as a `Map` that `createMap` returned, or from an effect that re-runs on a flush the harness did not make.
- A primitive used inside a component.
- A value whose type is a function passed where a primitive takes a value or an accessor: it is called.
- A primitive that keeps its state without `internal-value.ts` against a model. Its browser test pins fixed cases only.

## Reading a failure

- **`Property 'createX' is missing` from `vp check`.** A primitive was added without a server case. Add it to `serverCases`, with the value the primitive gives on the server.
- **`createX reads these browser resources on the server`.** The primitive reads a browser resource in its body or in a memo. Move the read into an effect's apply or a handler, which the server never runs.
- **`return accessors and handlers only`.** A primitive returns a plain value in its tuple or object. Return an accessor.
- **`a primitive raised a Solid development diagnostic`.** The message names the code, such as `REACTIVE_WRITE_IN_OWNED_SCOPE` for a write in the body or a memo. Fix the primitive; do not silence the diagnostic.
- **`a primitive left a listener, timer or observer behind`.** The message names each one, such as `a keydown listener on HTMLDocument` or `a pointerdown listener on HTMLDocument`. Return the cleanup from the effect's apply, or register it with `onCleanup` in the body. For an element primitive, the attachment's cleanup did not remove what its apply added.
- **`the client claimed the server's element with the server's id: expected null`**, or **`Hydration key miss`** in the development diagnostics. The server and the client created different reactive nodes before the probe. Look for an effect, memo or signal that one side skips, such as one created behind `typeof window`.
- **`focus stays in the trap` or `focus lands where the engine's order says`, after `Counterexample`.** fast-check prints the starting stops and the steps, for example `[[],[{"type":"add","at":0,"kind":"button"},{"type":"add","at":0,"kind":"button"},{"type":"toggle","at":0,"change":"inert"},{"type":"tab","backwards":false}]]` when the stops stopped skipping an inert subtree. Replay it by hand in that engine before you change the primitive.
- **An axe message such as `aria-roles: ARIA roles used must conform to valid values (div)`.** The region's markup breaks a WCAG rule. Fix the markup, not the tag list.
- **An `expect` fails after `Counterexample`.** This is a real break. fast-check prints the shortest sequence, for example `[false, toggle(), open()]`, and the message names the observation, such as `the callbacks that ran`. Report it in those terms. Do not loosen the model.
- **A fixed test fails.** Its name says which promise broke.
- **A fixture test of `tests/primitive-conventions.test.ts` fails.** A rule now flags code it allows, or misses code it forbids. Fix the rule; change a fixture only when the rule's promise changed.
- To replay one failure, add the printed `seed` and `path` to the options object passed to `fc.assert`, run again, and remove them afterwards.

## When the change is intended

- A new primitive: its server case, a `<file>.browser.test.ts` that imports the harness and pins every edge case it promises, a model test built on `tests/support/model.ts` when it keeps its state in `internal-value.ts`, an axe check when it moves focus, and a doc comment on what the barrel exports.
- A new element primitive: take its ref from `createElementSlot` and its listeners from `createAttachment`, so it inherits the hydration the playground checks. Only one that builds its effects another way needs its own hydration probe in the playground.
- A new plain helper: a Node test named for it.
- A new command on a modelled primitive: add a command to its `commands`, with the model change it makes.
- A primitive that registers a listener, timer or observer: no change to the harness. A new kind of browser resource: add it to `browser-resources.ts`, which both the server trap and the harness read.
- Upgrading Solid, the Solid plugin, Vitest, Playwright, fast-check or axe-core: change the versions in the catalog in `pnpm-workspace.yaml`, then run the check.
- Mutation check after editing the covered code: in `packages/primitives/src/create-toggle.ts`, make `toggle()` advance from `index.get()` instead of `staged`, and run `vp test packages/primitives/tests/create-toggle.browser.test.ts`. It must fail with `each request decides on the value staged by the requests before it in the same tick, so two toggles of two options end where they started` and a counterexample. Restore the line afterwards.
- Hydration mutation: in `packages/primitives/src/internal-listener.ts`, make `createAttachment` return before its memo when `typeof window === "undefined"`, and run `vp test apps/playground/tests/primitives-hydration.test.ts apps/playground/tests/dev-diagnostics.test.ts`. It must fail with `the client claimed the server's element with the server's id: expected null` and a `Hydration key miss` warning. Restore the file afterwards.
- Focus mutation: in `packages/primitives/src/create-focus-trap.ts`, make the container's listener return on `event.shiftKey`, and run `vp test packages/primitives/tests/create-focus-trap.browser.test.ts`. The generated test must fail with `focus stays in the trap` and a counterexample. Restore the file afterwards.
