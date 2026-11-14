---
name: verify-primitives
description: Checks that every primitive in `@solix/primitives` renders on the server without touching a browser global and gives its server value, keeps every behaviour its browser test pins in each engine with no Solid diagnostic and nothing left after dispose, and agrees with a plain model for generated sequences of commands and flushes, for `createUncontrolled`, `createDisclosure`, `createToggle`, `createCounter` and `createStateHistory`, not only the sequences a component uses. Use when a change adds or edits a primitive or an internal helper in `packages/primitives`, touches the browser harness or the test projects in `vite.config.ts`, or changes Solid, the Solid plugin, Vitest, Playwright or fast-check.
---

# Verify the primitives

## The promise

Every primitive the built barrel exports renders on the server inside Solid's `renderToString` while every browser global it could reach, `setTimeout` included, throws when read. It reads none of them, gives the server value its case names, renders the same markup twice, and returns a tuple or an object that holds only functions, so destructuring it never freezes a value.

In the browser, each primitive does what its test pins, in every installed engine. A command decides on the value as staged before Solid's next flush, so requests within one tick resolve to the last one: `toggle(); toggle()` with two options ends where it started, `open(); open()` runs `onOpen` once, and a request that changes nothing writes nothing and calls nothing. No test raises a Solid development diagnostic, and once every root a test mounted is disposed, no listener, timer, animation frame, idle callback or observer that a primitive registered is left.

For any sequence of commands with flushes between some of them, five primitives agree with a plain model after every step: `createUncontrolled` (requests, consumer writes that switch it between controlled and uncontrolled, and a consumer that follows or refuses `onChange`), `createDisclosure` (open, close, toggle, set and the callbacks), `createToggle` (advance, move to an option, move by an updater, options not in the list), `createCounter` (moves, set, reset and bounds that change while it runs), and `createStateHistory` (set, back, forward and reset).

## The harm when it breaks

A primitive that reads `window` or schedules a timer during server rendering crashes the page on the server or keeps the process alive. A primitive that decides on the committed value instead of the staged one runs `onOpen` twice for a double press, so a dialog opens twice or an analytics event doubles, and a toggle pressed twice before a flush lands on the wrong option. A controlled input that drops a request back to its committed value leaves the consumer at the wrong value. A listener or timer left after dispose keeps firing into a component that is gone. A returned value that is not a function is frozen at its first value in every component that destructures it. Every component in `@solix/core` will build its state on these primitives, so one of these breaks reaches every input.

## Does your change touch it?

It does if it edits any of these:

| Covered code | What the check assumes about it |
| --- | --- |
| `packages/primitives/src` | Each `create-<name>.ts` exports one function, `create<Name>`, and its types. Every changing value it returns is an accessor and every command a function. A command writes through `createValue` in `internal-value.ts`, whose `update` decides on the staged value, writes only when the result differs by `Object.is`, returns whether it did, and refuses every update once its owner is disposed. `createValue` serves its value through a memo, so writes that net to nothing before a flush notify no one. `internal-access.ts` reads a value or an accessor, tracked or untracked. `internal-equal.ts` compares two lists item by item. No primitive here registers a listener, timer or observer yet. |
| `packages/primitives/src/create-uncontrolled.ts`: `createUncontrolled` | While uncontrolled, a request is compared with the staged uncontrolled value. While controlled, it is compared only with a request staged earlier in the same tick, which `stagedThisTick` tells apart, and calls `onChange` when there is none. Controlled or not is the committed `controlled()`. |
| `packages/primitives/src/index.ts` | It re-exports every primitive. The server test reads its build in `dist`, not the source. |
| `packages/primitives/build.mjs` | It writes `dist/*.js` from `src/*.ts` with Babel and the TypeScript preset, and ends every relative specifier in `.js`, so Node's own loader imports the build. |
| `packages/primitives/tests/server-render.test.ts` | Its `serverCases` is a mapped type over the functions the barrel exports, so a primitive without a case fails `vp check`. Each case calls the built primitive and returns what it returned and the server value. It traps the browser globals listed in `browserOnlyGlobals` only around `renderToString`, and restores them after. |
| `packages/primitives/tests/support/browser-harness.ts` | Every browser test imports it, once per file. It wraps the listener methods, the timers and the observers that `browser-resources.ts` lists, and records a registration made while it runs a primitive's code: `mount`'s factory and first flush, its own `flush`, a function the factory returned, or the callback of a recorded registration. It attributes by that scope, not by a call stack. After each test it disposes every root, then fails on any diagnostic `OBSERVE.diagnostics.capture()` caught and on any registration still live. |
| `packages/primitives/tests` | One `<file>.browser.test.ts` per primitive pins its edge cases. The five model tests define their commands as `fc.Command` classes and run 100 generated sequences of up to 30 commands each, drawn at fast-check's medium size, with `flush` as one of the commands. |
| `tests/primitive-conventions.test.ts` | It requires every primitive to have a browser test named for it, and a server-render test for the library. |
| `tests/support` | It runs `vp run -r build` in production mode before the node project, which writes `packages/primitives/dist`. |
| `vite.config.ts` | The node project runs the server test with Solid's server build. The browser project runs `packages/*/tests/**/*.browser.test.ts` in Vitest's browser mode with the Playwright provider and the harness as its setup file, on port 4322, and reads its engines from `enginesToVerify()` in a getter. |
| `scripts/browser-engines.mjs` | It lists the engines the browser project runs on, and with `CI` set it requires all three. |
| `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `@vitest/browser-playwright`, `playwright` and `fast-check` in the catalog in `pnpm-workspace.yaml` | Solid 2.0.0-rc.21, the Solid plugin 3.0.0-next.57, the provider 5.1.0, Playwright 1.63.0 and fast-check 4.10.2. A signal's updater runs at once with the staged value, a read returns the committed value until the flush, and a flush notifies a signal whose staged value was written even when it equals the committed one. |

Last confirmed against commit `a446cf5`. Run `git diff a446cf5 -- packages/primitives tests/primitive-conventions.test.ts tests/support scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/primitives tests/primitive-conventions.test.ts
```

It runs the server test in the node project and every browser test in each installed engine, about ten seconds per engine with the build that every test run starts with. With `CI` set, all three engines must be installed, or the browser project fails as it starts.

## The tool and why

No verifier runs on Solid's reactive runtime, so this is not a proof. The model tests use fast-check's model-based commands inside the engine, against the primitives' source compiled by the Solid plugin with Solid's development build. fast-check generates command sequences, runs each against the primitive and a plain model of a few fields, compares them after every step, and shrinks a failing sequence to the shortest one that still fails. The model is written from the promise above, not from the code: it holds a staged and a committed copy of each value and commits at each `flush`. The other browser tests drive real input where a primitive takes it, `userEvent` typing, clicks and select changes for `createInputState`. The server test renders the build with Solid's own server renderer.

## What a pass covers

- Every function the built barrel exports, rendered twice on the server with `window`, `document`, `navigator`, `location`, `history`, `screen`, both storages, `matchMedia`, `getComputedStyle`, `requestAnimationFrame`, `requestIdleCallback`, `setTimeout`, `setInterval`, the three observers and `HTMLElement` trapped.
- For each of the five model tests, 100 generated sequences per engine per run, a different set each run, of up to 30 commands drawn at fast-check's medium size, with any number of commands between two flushes. `createUncontrolled` draws the starting controlled value, `defaultValue` and `finalValue` from three letters or nothing, and whether the consumer follows `onChange`. `createToggle` draws one to five distinct options and moves to letters outside them. `createCounter` draws its start and bounds from -6 to 6 and changes them while it runs. `createStateHistory` moves up to four steps at once.
- The edge cases each browser test names: the clamping table of `createCounter`, insert at 0, the middle and the end and removal by several indices in `createListState`, a mutator from an older instance and accumulated mutations in `createMap` and `createSet`, the platform's set methods on a set-like, the queue split under a changed limit, the history cut after a set, the last valid value across invalid ones, a checkbox, a select and an event read after its dispatch in `createInputState`, a merge that changes nothing in `createSetState`, and a derived value that returns to the value it held in `createPrevious`.
- In every browser test, no Solid diagnostic and nothing left that a primitive registered.

## What a pass does not cover

- Hydration. No state primitive reads a value only the browser has, so none has a hydration test yet.
- Firefox and WebKit on a machine where only Chromium is installed. CI runs all three.
- A listener, timer or observer that a primitive registers outside the harness's scope: from a method of an object it returned, such as `createMap`'s `set`, or from an effect that re-runs on a flush the harness did not make.
- A primitive used inside a component. No component uses one yet.
- A value whose type is a function passed where a primitive takes a value or an accessor: it is called.
- `createListState`, `createMap`, `createSet`, `createQueue`, `createValidatedState`, `createInputState`, `createSetState` and `createPrevious` against a model. Their browser tests pin fixed cases only.

## Reading a failure

- **`Property 'createX' is missing` from `vp check`, or `add a server case for createX` from the server test.** A primitive was added without a server case. Add it to `serverCases`, with the value the primitive gives on the server.
- **`createX reads these browser globals on the server`.** The primitive reads a browser global in its body or in a memo. Move the read into an effect's apply or a handler, which the server never runs.
- **`return accessors and handlers only`.** A primitive returns a plain value in its tuple or object. Return an accessor.
- **`a primitive raised a Solid development diagnostic`.** The message names the code, such as `REACTIVE_WRITE_IN_OWNED_SCOPE` for a write in the body or a memo. Fix the primitive; do not silence the diagnostic.
- **`a primitive left a listener, timer or observer behind`.** The message names each one, such as `a keydown listener on HTMLDocument`. Return the cleanup from the effect's apply, or register it with `onCleanup` in the body.
- **An `expect` fails after `Counterexample`.** This is a real break. fast-check prints the shortest sequence, for example `[false, toggle(), open()]`, and the message names the observation, such as `the callbacks that ran`. Report it in those terms. Do not loosen the model.
- **A fixed test fails.** Its name says which promise broke, such as `before a flush, open twice runs onOpen once, and toggle twice ends where it started`.
- To replay one failure, add the printed `seed` and `path` to the options object passed to `fc.assert`, run again, and remove them afterwards.

## When the change is intended

- A new primitive: add its server case, a `<file>.browser.test.ts` that pins every edge case it promises, a doc comment and a README section. A primitive whose commands can be issued in any order earns a model test too.
- A new command on a modelled primitive: add a command class to its `commands`, with the model change it makes.
- A primitive that registers a listener, timer or observer: no change to the harness. It records the registration, and the test fails if dispose leaves it.
- Upgrading Solid, the Solid plugin, Vitest, Playwright or fast-check: run the check, then update the versions in the table above.
- Mutation check after editing the covered code: in `packages/primitives/src/create-toggle.ts`, make `toggle()` advance from `index.get()` instead of `staged`, and run `vp test packages/primitives/tests/create-toggle.browser.test.ts`. It must fail with `each request decides on the value staged by the requests before it in the same tick, so two toggles of two options end where they started` and a counterexample. Restore the line afterwards.
