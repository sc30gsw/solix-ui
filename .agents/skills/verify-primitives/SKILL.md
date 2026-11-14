---
name: verify-primitives
description: Checks that every primitive in `@solix/primitives` renders on the server without reading a browser resource and gives its server value, keeps every behaviour its browser test pins in each engine with no Solid diagnostic and nothing left after dispose, and, when it keeps its state in `internal-value.ts`, agrees with a plain model for generated sequences of commands and flushes, not only the sequences a component uses. Use when a change adds or edits a primitive, a helper or an internal module in `packages/primitives`, touches its test support or the browser project in `vite.config.ts`, or changes Solid, the Solid plugin, Vitest, Playwright or fast-check.
---

# Verify the primitives

## The promise

Every `create*` function the built barrel exports renders on the server inside Solid's `renderToString` while every name that `packages/primitives/tests/support/browser-resources.ts` lists throws when read. It reads none of them, gives the server value its case names, and returns nothing, or a tuple or object that holds only functions, so destructuring it never freezes a value. Node's own loader imports the build.

In the browser, each primitive does what its test pins, in every engine that `enginesToVerify()` in `scripts/browser-engines.mjs` returns. Each request decides on the value staged by the requests before it in the same tick; a request that changes nothing writes nothing and calls nothing. Once its owner is disposed, a command writes nothing and calls nothing. No test raises a Solid development diagnostic, and once every root a test mounted is disposed, no listener, timer or observation that the harness recorded is left.

For any sequence of commands with flushes between some of them, every primitive whose source imports `./internal-value` agrees with a plain model after every step.

## The harm when it breaks

A primitive that reads `window` or schedules a timer during server rendering crashes the page on the server or keeps the process alive. A primitive that decides on the committed value instead of the staged one runs `onOpen` twice for a double press, so a dialog opens twice or an analytics event doubles, and a toggle pressed twice before a flush lands on the wrong option. A controlled input that drops a request leaves the consumer at the wrong value. A command that still runs after dispose calls back into a component that is gone, and so does a listener or timer left behind. A returned value that is not a function is frozen at its first value in every component that destructures it.

## Does your change touch it?

It does if it edits any of these:

| Covered code | What the check assumes about it |
| --- | --- |
| `packages/primitives/src` | A command writes through `createValue` in `internal-value.ts`, which decides on the staged value, writes only when its comparison says the value changed, applies the same comparison in its memo, and refuses every update once its owner is disposed. `internal-request.ts` tells a request staged earlier in the same tick by the identity of the staged box. |
| `packages/primitives/build.mjs` | It writes `dist/*.js` with Babel's TypeScript preset and ends every relative specifier in `.js`. |
| `packages/primitives/tests/server-render.test.ts` | Its table is a mapped type over the barrel's `create*` exports, and it reads the build that `packages/primitives/tests/built-library.ts` loads. |
| `packages/primitives/tests/support` | `browser-resources.ts` is the one list of browser resources. `server-harness.ts` traps every name in it around a server render. `browser-harness.ts` records a registration made while it runs a primitive's code, by that scope and not by a call stack. `model.ts` commits the staged model at each flush. |
| `packages/primitives/tests/fixtures` | Each fixture leaks one thing that `packages/primitives/tests/browser-harness.browser.test.ts` expects the harness to report. |
| `tests/primitive-conventions.test.ts` and `tests/support/syntax.ts` | The rules resolve bindings with the type checker, and each rule passes its allowed fixture and flags every line of its forbidden one. |
| `tests/support` | It builds every package before the node project. |
| `vite.config.ts` | The browser project runs `packages/primitives/tests/**/*.browser.test.{ts,tsx}` with the Playwright provider and reads its engines from `enginesToVerify()` in a getter. |
| `scripts/browser-engines.mjs` | With `CI` set, it requires every engine it names. |
| `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `@vitest/browser-playwright`, `playwright` and `fast-check` in the catalog in `pnpm-workspace.yaml` | A signal's updater runs at once with the staged value, a read returns the committed value until the flush, and a flush notifies a signal whose staged value was written even when it equals the committed one. |

Last confirmed against commit `a8cf5ab`. Run `git diff a8cf5ab -- packages/primitives tests/primitive-conventions.test.ts tests/support scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/primitives tests/primitive-conventions.test.ts
```

It runs the server, build and convention tests in the node project and every browser test in each installed engine. With `CI` set, every engine must be installed, or the browser project fails as it starts.

## The tool and why

No verifier runs on Solid's reactive runtime, so this is not a proof. The model tests use fast-check's model-based commands inside the engine, against the primitives' source compiled by the Solid plugin with Solid's development build. fast-check generates command sequences, runs each against the primitive and a plain model, compares them after every step, and shrinks a failing sequence to the shortest one that still fails. The model is written from the promise above, not from the code: it holds a staged and a committed copy of the state and commits at each flush. The other browser tests drive real input where a primitive takes an event. The server test renders the build with Solid's own server renderer.

## What a pass covers

- Every `create*` function the built barrel exports, rendered on the server with every name in `browser-resources.ts` trapped.
- For each model test, 100 generated sequences per engine per run, a different set each run, of up to 30 commands drawn at fast-check's medium size, with any number of commands between two flushes.
- The edge cases each browser test names.
- In every browser test, no Solid diagnostic and nothing left that the harness recorded, and the harness's own test, which shows it reports a leaked listener, timer, observation and diagnostic.
- Every rule of the primitive conventions, on the package and on its fixtures.

## What a pass does not cover

- Hydration: the server test renders, and nothing hydrates its markup.
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
- **`a primitive left a listener, timer or observer behind`.** The message names each one, such as `a keydown listener on HTMLDocument`. Return the cleanup from the effect's apply, or register it with `onCleanup` in the body.
- **An `expect` fails after `Counterexample`.** This is a real break. fast-check prints the shortest sequence, for example `[false, toggle(), open()]`, and the message names the observation, such as `the callbacks that ran`. Report it in those terms. Do not loosen the model.
- **A fixed test fails.** Its name says which promise broke.
- **A fixture test of `tests/primitive-conventions.test.ts` fails.** A rule now flags code it allows, or misses code it forbids. Fix the rule; change a fixture only when the rule's promise changed.
- To replay one failure, add the printed `seed` and `path` to the options object passed to `fc.assert`, run again, and remove them afterwards.

## When the change is intended

- A new primitive: its server case, a `<file>.browser.test.ts` that imports the harness and pins every edge case it promises, a model test built on `tests/support/model.ts` when it keeps its state in `internal-value.ts`, a doc comment, and its name in the README list.
- A new plain helper: a Node test named for it.
- A new command on a modelled primitive: add a command to its `commands`, with the model change it makes.
- A primitive that registers a listener, timer or observer: no change to the harness. A new kind of browser resource: add it to `browser-resources.ts`, which both the server trap and the harness read.
- Upgrading Solid, the Solid plugin, Vitest, Playwright or fast-check: change the versions in the catalog in `pnpm-workspace.yaml`, then run the check.
- Mutation check after editing the covered code: in `packages/primitives/src/create-toggle.ts`, make `toggle()` advance from `index.get()` instead of `staged`, and run `vp test packages/primitives/tests/create-toggle.browser.test.ts`. It must fail with `each request decides on the value staged by the requests before it in the same tick, so two toggles of two options end where they started` and a counterexample. Restore the line afterwards.
