---
name: verify-playground
description: Launches, checks, drives and proves the playground in `apps/playground` with e2e, on its production build in Chromium, Firefox and WebKit, the way a user meets it, and keeps a feature map of what to drive. Its tests pin a text input's look and its error border after the user commits a value, read from the page that hydrated with no console error. Use before claiming a playground change works, when asked to verify a section of the playground with e2e, or when a change touches `e2e.config.ts`, the e2e tests of the playground or their helpers.
---

# Verify the playground

Read the e2e skill first, `.agents/skills/e2e/SKILL.md` (`npx e2e guide <topic>` prints the installed version). This skill says only what is true of this app. The config is `e2e.config.ts`, with one target per engine, `chromium`, `firefox` and `webkit`, and tests `apps/playground/tests/**/*.e2e.ts`. The Playwright suite beside it, run by Vitest, still holds every test it had; `MIGRATION.md` says what moved.

## The promise

On the playground's production build, in each engine, the page hydrates and reports no console error, warning, page error, failed resource or refusal of its content security policy, and its text input has the library's look: the library's border, height, radius, background and text colour, a consumer's class that beats the background only, the error border only once the user commits an invalid value and the library's border again once the value is valid, the primary border under keyboard focus, and a disabled input that looks disabled and cannot be typed in.

## The harm when it breaks

A page that never hydrates looks right and ignores every click. An error border that shows while the user is still typing, or stays after the value is fixed, tells the user a valid value is wrong. A console error that no test reads ships unnoticed.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `e2e.config.ts` | Each target starts the built playground with `node dist/server/node.js` in `apps/playground`, on a port the runner picks and passes as `PORT`, and gives no model, agent or key, so every step is deterministic. |
| `apps/playground/tests/text-input.e2e.ts` | Each test reads the text input by role and name, acts on it as a user does, and reads its computed style through `styleOf`, with every assertion after the action. |
| `apps/playground/tests/support/e2e-playground.ts`: `openedHydrated`, `consoleProblems`, `labelled`, `test` | `openedHydrated` adds the console recorder before the page's own scripts, opens `/` and waits until `<html>` carries `hydratedMark`; the `playground` fixture of `test` gives `expected` and `styleOf`. |
| `tests/e2e-suite.test.ts` | It holds the config to deterministic steps, a target per engine of `scripts/browser-engines.mjs` on port 0, and a glob no Vitest project shares. |

Last confirmed against commit `c0fecfa`. Run `git diff c0fecfa -- e2e.config.ts apps/playground/tests/text-input.e2e.ts apps/playground/tests/support/e2e-playground.ts tests/e2e-suite.test.ts`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp run test:e2e
```

It builds the packages, then runs every e2e test in each engine; the runner starts and stops the server. `vp test tests/e2e-suite.test.ts` checks the config. With `CI` set, retries stay at 0, since the config sets them.

## Launch

Each target's `app.command` runs `node dist/server/node.js` in `apps/playground` with `PORT` set to the free port the runner picked from `http://127.0.0.1:0` and `HOST` set to `127.0.0.1`; the server reads nothing else. The runner waits until the URL answers, logs the server to `.e2e/logs/playground.log`, and stops it after the run. Each target gets its own server, so two runs never meet. The server serves `dist`, so build first: `vp run test:e2e` does, and so does `NODE_ENV=production vp run -r build`. The app needs no seed, database or account.

## Doctor

```bash
E2E_TELEMETRY_DISABLED=1 npx e2e list apps/playground/tests/text-input.e2e.ts
E2E_TELEMETRY_DISABLED=1 npx e2e run apps/playground/tests/text-input.e2e.ts
```

`list` loads the config and starts nothing: exit 0 and seven tests on each of the three targets. `run` is the smoke test: exit 0 means the build is served, each engine runs and the page hydrates. `BROWSER_INSTALL_FAILED` means an engine is missing: run `vp exec playwright install --with-deps chromium firefox webkit`, the browsers `@e2e-dev/web`'s `playwright-core` shares with the pinned `playwright`. `APP_UNREACHABLE` quotes `.e2e/logs/playground.log`; a missing `dist/server/node.js` means the build did not run. `npx e2e doctor` checks the config and the engines without starting the server, and says no model is configured, which is intended. Run Doctor first whenever anything looks off.

## Drive

Scripted: a test under `apps/playground/tests/`, named `*.e2e.ts`, imports `test` from `apps/playground/tests/support/e2e-playground.ts`, so the page is open and hydrated and the console recorder runs, and adds an `afterEach` that expects `consoleProblems(browser)` to be empty. Act through `screen` queries by role and accessible name, as `features/` lists them; read a computed style with `styleOf` on a selector from `labelled`, and the value it should take from `expected`, which reads the library's tokens from sentinels. Do not write a name a setups module beside a section holds; import it, as the Playwright tests do.

Live: no `e2e mcp` server is registered in this repository. When a session has one, `open_session` with the config, `observe`, and `locate` before writing a locator (topic `mcp`). Without one, run the test and read `## Screen at failure` on its trace page.

`agent.act`, `e2e explore` and a bug bash run only locally and on request, with a model in a config of their own; CI runs the deterministic steps only (Q186).

## Evidence

Every run writes `.e2e/report.json`. A failed test gets `.e2e/results/<test>/trace.md` and a failure screenshot under its `attempt-<n>/screenshots`, which e2e always takes; `--trace on` keeps a trace page for passing tests too. The next run clears `.e2e/results/`, Doctor included, so a proof that must outlive it runs with `--output .e2e/proof/<name>`. `.e2e/` is ignored by git, and no workflow uploads it. A proof drives the input the way a user does, by its label, with typing and focus, and reads the state after it: the computed border, and the console of the page. The playground keeps nothing on a server; the colour scheme a user picks is the one side effect, in local storage under `playgroundColorSchemeKey` of `apps/playground/src/sections/color-scheme-setups.ts`.

## Bug bash

Not set up, and unproven: the config has no model, so `e2e explore` cannot run here. On request, write `e2e.bugbash.config.ts` beside the config, untracked, that spreads it, adds a model and a skeptic persona, and keeps the one-target-per-engine servers; its `context` says the playground is a gallery of library components on one page, not an app with accounts or data. The charters come from `features/`, in the `slug|target|agent|charter` lines topic `bug-bash` reads. `.e2e/bugbash/` is inside the ignored `.e2e/`. A finding is a bug once `apps/playground/tests/bugbash/<slug>.e2e.ts` fails on the reported defect, as topic `bug-bash` step 6 reads it.

## Cleanup

The runner stops each server it started, and `close_session` stops the one a session started. A server you started by hand is yours to stop, by its pid. Remove `.e2e/bugbash/<slug>/` for a charter whose findings were all rejected. Keep `.e2e/results/`, `.e2e/proof/` and `.e2e/report.json`: that is the proof.

## Helpers

None beyond `apps/playground/tests/support/e2e-playground.ts`. The e2e CLI is the helper.

## What a pass covers

- The playground's production build in Chromium, Firefox and WebKit, hydrated, with the text input of `features/text-input.md`.

## What a pass does not cover

- A page with scripts off: `web()` takes no `javaScriptEnabled`, so those checks stay in the Playwright suite, which `verify-served-page` drives.
- A message the browser itself logs for a reason the console recorder does not hear.
- The features `features/README.md` marks `untested`, until their tests move.
- How a component looks in pixels.

## Reading a failure

- **`the page did not become ready`.** The client script did not mark `<html>` with `hydratedMark` within `hydrationTimeout`. The message ends with what the console recorder heard.
- **The `afterEach` console check fails.** It lists each message; fix its cause.
- **`matches 0 elements, not one`.** `styleOf` was given a selector that names no element, or several; the label changed.
- **`Refused to apply a stylesheet` in the trace's App log, at the failing step only.** e2e's capture of the failed screen adds a stylesheet that the playground's policy refuses. It is not the app's.
- **A colour differs.** The value comes from a sentinel, so a component that reads the wrong token fails here, not only one whose token changed.

## When the change is intended

- A new section to drive: add its feature file to `features/`, a test under `apps/playground/tests/`, and a row to `MIGRATION.md` when it ports a Playwright test.
- Hydration mutation: in `apps/playground/src/App.tsx` remove the effect that sets `hydratedMark`, and run `npx e2e run apps/playground/tests/text-input.e2e.ts` after `NODE_ENV=production vp run -r build`, which must fail with `the page did not become ready` in every engine. Restore the file and confirm it with `cmp`.
- Console mutation: add `console.warn("probe")` to the body of `App`, build, and run `npx e2e run apps/playground/tests/text-input.e2e.ts`, which must fail on the `afterEach` console check with `warning: probe`. Restore the file and confirm it with `cmp`.
- Error border mutation: in `packages/core/src/TextInput.tsx` give `:user-invalid` the border token instead of the error token, build, and run `npx e2e run apps/playground/tests/text-input.e2e.ts`, which must fail the two tests that commit an invalid value in every engine. Restore the file and confirm it with `cmp`.
- Config mutation: add `agents: { default: {} }` to `e2e.config.ts` and run `vp test tests/e2e-suite.test.ts`, which must fail on the deterministic-steps check. Restore the file and confirm it with `cmp`.
