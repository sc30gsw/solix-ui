---
name: verify-playground
description: Launches, checks, drives and proves the playground in `apps/playground` with e2e, on its production build in Chromium, Firefox and WebKit, the way a user meets it, and keeps a feature map of what to drive. Its tests pin a text input's look and its error border after the user commits a value, read from the page that hydrated with no console error. Use before claiming a playground change works, when asked to verify a section of the playground with e2e, or when a change touches `e2e.config.ts`, the e2e tests of the playground or their helpers.
---

# Verify the playground

Read the e2e skill first, `.agents/skills/e2e/SKILL.md` (`vp run e2e guide <topic>` prints the installed version). This skill says only what is true of this app. The config is `e2e.config.ts`, with one target for each engine `enginesToVerify()` gives, and tests `apps/playground/tests/**/*.e2e.ts`. Run e2e only through the root script, `vp run e2e <command>`, which turns its telemetry off. `MIGRATION.md`, generated from `scripts/migration.ts`, says which Playwright tests moved here and which stay.

## The promise

On the playground's production build, in each engine, the page hydrates and reports no console error, warning, page error, failed resource or refusal of its content security policy, and its text input has the library's look: the library's border, height, radius, background and text colour, a consumer's class that beats the background only, the primary border while the user types and the field holds the value, the error border only once the user commits an invalid value and the library's border again once the value is valid, the primary border under keyboard focus, and a disabled input that looks disabled and cannot be typed in. A target, a role and an accessible name or, for an element with no role, its text, names the same element to `screen.getByRole` or `screen.getByText` and to the in-page resolver that reads its style.

## The harm when it breaks

A page that never hydrates looks right and ignores every click. An error border that shows while the user is still typing, or stays after the value is fixed, tells the user a valid value is wrong. A console error that no test reads ships unnoticed. A style read from another element than the one the test acts on proves nothing.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `e2e.config.ts` | Each target starts the built playground with `node dist/server/node.js` in `apps/playground`, on a port the runner picks and passes as `PORT`, logs to its own file, and gives no model, agent or key, so every step is deterministic. |
| `apps/playground/tests/text-input.e2e.ts` | Each test acts on the text input by its target as a user does, and reads its computed style through `styleOf`, with every assertion after the action. |
| `apps/playground/tests/targets.e2e.ts` | It holds the in-page resolver to `screen.getByRole` for a name from `aria-label`, from text, from a `<label>` around or pointing at the field, from `aria-labelledby`, and for the disclosure's summary, which has no role and is found by its text. |
| `apps/playground/tests/support/e2e-playground.ts`: `openedHydrated`, `located`, `committed`, `test` | The `hydrated` fixture of `test` installs the console recorder before the page's own scripts, opens `/`, waits until `<html>` carries `hydratedMark`, and fails the test on any console problem afterwards; `expected` and `styleOf` read from that page. |
| `apps/playground/tests/support/targets.ts`: `readTarget` | It finds the one shown element with a target's role and accessible name, or the innermost one that holds a target's text, through open shadow roots. |
| `apps/playground/tests/support/readiness.ts` and `tests/support/console-recorder.ts` | What both runners share: the hydration timeout and its failure, and the init script that records the console. |
| `tests/e2e-suite.test.ts`, `scripts/migration.ts` and `tests/migration.test.ts` | The config's allowed keys, engines, port and folder, the root `e2e` script, the shared `playwright-core`, and the ledger that `MIGRATION.md` is generated from. |

Last confirmed against commit `c0fecfa`. Run `git diff c0fecfa -- e2e.config.ts apps/playground/tests/text-input.e2e.ts apps/playground/tests/targets.e2e.ts apps/playground/tests/support/e2e-playground.ts apps/playground/tests/support/targets.ts apps/playground/tests/support/readiness.ts tests/support/console-recorder.ts tests/e2e-suite.test.ts scripts/migration.ts tests/migration.test.ts`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp run test:e2e
vp test tests/e2e-suite.test.ts tests/migration.test.ts
```

The first builds the packages, then runs every e2e test in each engine; the runner starts and stops the servers. The second checks the config and the ledger. With `CI` set, every engine must be installed; locally a missing one is skipped, never downloaded.

## Launch

Each target's `app.command` runs `node dist/server/node.js` in `apps/playground` with `PORT` set to the free port the runner picked from `http://127.0.0.1:0` and `HOST` set to `127.0.0.1`; the server reads nothing else. The runner waits until the URL answers, logs each server to `.e2e/logs/playground-<engine>.log`, and stops it after the run. Each target gets its own server, so two runs never meet. The server serves `dist`, so build first: `vp run test:e2e` does, and so does `vp run build:packages`. The app needs no seed, database or account.

## Doctor

```bash
vp run e2e list apps/playground/tests/text-input.e2e.ts
vp run e2e run apps/playground/tests/text-input.e2e.ts
```

`list` loads the config and starts nothing: exit 0 and its tests on each target. `run` is the smoke test: exit 0 means the build is served, each engine runs and the page hydrates. `APP_UNREACHABLE` quotes the target's log; a missing `dist/server/node.js` means the build did not run. `vp run e2e doctor` checks the config and the engines without starting the server, and says no model is configured, which is intended. Run Doctor first whenever anything looks off.

## Drive

Scripted: a test under `apps/playground/tests/`, named `*.e2e.ts`, imports `test` from `apps/playground/tests/support/e2e-playground.ts`. Its `hydrated` fixture runs for every test: the page is open and hydrated, and the test fails on any console problem after it, unless the file overrides `reportsToTheConsole` with the exact report. Address an element by a target from `apps/playground/tests/support/targets.ts`, `{ role, name }`, or `{ text }` for an element the tree gives no role, such as a disclosure's summary: `located(screen, target)` acts on it, `styleOf(target, property)` reads its computed style, and `expected` gives the value the library's tokens should give, read from sentinels. `committed(screen, field, value)` fills a field and moves focus away, as a user commits a value. Do not write a name a setups module beside a section holds; import it, as the Playwright tests do.

Live: no e2e MCP server is registered in this repository. When a session has one, `open_session` with the config, `observe`, and `locate` before writing a locator (topic `mcp`). Without one, run the test and read `## Screen at failure` on its trace page.

`agent.act`, `vp run e2e explore` and a bug bash run only locally and on request, with a model in a config of their own; CI runs the deterministic steps only (Q186).

## Evidence

Every run writes `.e2e/report.json`. A failed test gets `.e2e/results/<test>/trace.md` and a failure screenshot under its `attempt-<n>/screenshots`, which e2e always takes; `--trace on` keeps a trace page for passing tests too. The next run clears `.e2e/results/`, Doctor included, so a proof that must outlive it runs with `--output .e2e/proof/<name>`. `.e2e/` is ignored by git, and no workflow uploads it. A proof drives the input the way a user does, by its target, with typing and focus, and reads the state after it: the computed border, the field's value, and the console of the page. The playground keeps nothing on a server; the colour scheme a user picks is the one side effect, in local storage under `playgroundColorSchemeKey` of `apps/playground/src/sections/color-scheme-setups.ts`.

## Bug bash

Not set up, and unproven: the config has no model, so `vp run e2e explore` cannot run here. On request, write `e2e.bugbash.config.ts` beside the config, untracked, that spreads it, adds a model and a skeptic persona, and keeps the one-target-per-engine servers; its `context` says the playground is a gallery of library components on one page, not an app with accounts or data. The charters come from `features/`, in the `slug|target|agent|charter` lines topic `bug-bash` reads. `.e2e/bugbash/` is inside the ignored `.e2e/`. A finding is a bug once `apps/playground/tests/bugbash/<slug>.e2e.ts` fails on the reported defect, as topic `bug-bash` step 6 reads it.

## Cleanup

The runner stops each server it started, and `close_session` stops the one a session started. A server you started by hand is yours to stop, by its pid. Remove `.e2e/bugbash/<slug>/` for a charter whose findings were all rejected. Keep `.e2e/results/`, `.e2e/proof/` and `.e2e/report.json`: that is the proof.

## Helpers

None beyond `apps/playground/tests/support/e2e-playground.ts` and `apps/playground/tests/support/targets.ts`. The e2e CLI, through `vp run e2e`, is the helper.

## What a pass covers

- The playground's production build in every engine `enginesToVerify()` gives, hydrated, with the text input of `features/text-input.md`.

## What a pass does not cover

- A page with scripts off: `web()` takes no `javaScriptEnabled`, so those checks stay in the Playwright suite, which `verify-served-page` drives.
- A message the browser itself logs for a reason the console recorder does not hear.
- The features whose tests `MIGRATION.md` lists as not ported yet.
- How a component looks in pixels.

## Reading a failure

- **`the page did not become ready`.** The client script did not mark `<html>` with `hydratedMark` within `hydrationTimeout`. The message ends with what the console recorder heard.
- **The `hydrated` fixture's console check fails.** It lists each message; fix its cause.
- **`is 0 elements on the page, not one`.** No shown element, or several, has the target's role and accessible name, or holds its text; the name or the markup changed.
- **`Refused to apply a stylesheet` in the trace's App log, at the failing step only.** e2e's capture of the failed screen adds a stylesheet that the playground's policy refuses. It is not the app's.
- **A colour differs.** The value comes from a sentinel, so a component that reads the wrong token fails here, not only one whose token changed.

## When the change is intended

- A new section to drive: add its feature file to `features/`, a test under `apps/playground/tests/`, and the move to `scripts/migration.ts` when it ports a Playwright test, then `node scripts/write-migration.ts`.
- Hydration mutation: in `apps/playground/src/App.tsx` remove the effect that sets `hydratedMark`, run `vp run build:packages`, and run `vp run e2e run apps/playground/tests/text-input.e2e.ts`, which must fail with `the page did not become ready` in every engine. Restore the file and confirm it with `cmp`.
- Console mutation: add `console.warn("probe")` to the body of `App`, build, and run `vp run e2e run apps/playground/tests/text-input.e2e.ts`, which must fail on the `hydrated` fixture's console check with `warning: probe`. Restore the file and confirm it with `cmp`.
- Error border mutation: in `packages/core/src/TextInput.tsx` give `:user-invalid` the border token instead of the error token, build, and run `vp run e2e run apps/playground/tests/text-input.e2e.ts`, which must fail the two tests that commit an invalid value in every engine. Restore the file and confirm it with `cmp`.
- Typing mutation: in `packages/core/src/TextInput.tsx` give `:focus-visible` the border token instead of the primary, build, and run `vp run e2e run apps/playground/tests/text-input.e2e.ts`, which must fail the typing test and the keyboard focus test in every engine. Restore the file and confirm it with `cmp`.
- Resolver mutation: in `apps/playground/tests/support/targets.ts` make `readTarget` take an element whose text contains a text target's text, not only one whose text is it, and run `vp run e2e run apps/playground/tests/targets.e2e.ts`, which must fail the summary test in every engine, since its ancestors and other buttons hold the text too. Restore the file and confirm it with `cmp`.
- Config mutation: add `agents: { default: {} }` to `e2e.config.ts` and run `vp test tests/e2e-suite.test.ts`, which must fail on the check of the config's keys. Restore the file and confirm it with `cmp`.
- Ledger mutation: in `scripts/migration.ts` give the ported text-input row a count of 6, and run `vp test tests/migration.test.ts`, which must fail with `says 6 e2e tests on each target`. Restore the file and confirm it with `cmp`.
