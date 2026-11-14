---
name: verify-playground
description: Drives the playground (a server-rendered Solid 2.0 page that consumes the StyleX-authored library in `packages/core` and the primitives in `packages/primitives`) in Chromium, Firefox and WebKit the way a user does, and records screenshots, a recording and observed values as evidence. Use after any change to the library, its build pipeline, the playground, or their dependencies, and whenever a claim about what the page shows or does needs proof.
---

# Verify the playground

The app is the web page in `apps/playground`. A user sees four buttons, `Default`, `Overridden`, `Themed` and `Emphasise`, a disclosure whose summary reads `Follows`, and a disclosure whose summary reads `Toggle` with a third, `Inner`, inside it. Below them are three text inputs, an `Open modal` button, and a line saying whether the app records the modal as opened or closed. The button opens a modal dialog named `Settings`. A section named `Style props`, built from `Box` with style props, holds a button named `Background from a style prop`, the lines `Style prop margin`, `Consumer class margin`, `Consumer style margin`, `Longhand padding` and `Unset margin`, and the lines `Hidden from md` and `Visible from md`, only one of which shows at a time. A section named `Styles API` holds a button named `Class from classes.root`, a disclosure whose summary reads `Styled parts`, a button named `Unstyled`, and a button named `Plain button` that the library does not style. A section named `Primitives` holds a region that counts presses outside it, built with `createClickOutside`, a region that counts clicks on it, built with `createEventListener`, the lines `Presses outside the region:` and `Clicks on the region:` with those counts, a line `Headroom callbacks:` that lists the callbacks a headroom has called, and one probe for each case in `packages/primitives/tests/support/server-cases.ts`, each with a region when the case has a ref and a line when it reads a value. The libraries the page consumes are `packages/core` and `packages/primitives`. There is no other surface: no CLI, no API, no stored data.

All helpers are in `.agents/skills/verify-playground/scripts`. Run them from anywhere inside the repository. Run `vp install` first in a fresh checkout.

## Record the evidence for a change

```bash
vp run evidence
```

This one command runs the checks, then Launch, Doctor, every journey in the feature map on every installed browser engine, and Cleanup. It writes two reports to `docs/verification`, and both name any engine that was not installed:

- `README.md`, the full report, with the steps, screenshots, a recording of each journey and the observed values.
- `SUMMARY.md`, with the same header and the steps condensed, one table row per journey and one column per engine, and the Solid diagnostics line. Each row links once, to that journey's section of `README.md`, by the anchor GitHub gives its heading. Each cell counts the observations that passed in that engine, or names those that failed.

`scripts/evidence-summary.mjs` builds both reports.

`docs/verification` is ignored by git. Never commit it. On a pull request the CI `evidence` job runs the same command on all three engines, stores the result in a commit outside every branch under `refs/evidence/pull-<number>`, and posts `SUMMARY.md` as a comment, with its links pointing into `README.md` at that commit. A pull request comment holds at most 65,536 characters, so the comment carries no step, screenshot, recording or observed value, and `tests/evidence-summary.test.ts` keeps it under that limit for 200 journeys on every engine. Pushing the change is all it takes.

The sections below are the same steps run one at a time, for driving a single journey or investigating a failure.

## Launch

```bash
.agents/skills/verify-playground/scripts/launch.sh
```

It builds the library and then the app in production mode, starts the built server, and prints `ready: http://127.0.0.1:4331/ (pid N)` once the page serves markup whose `class` attribute holds a library class, one that contains `solix-`. Set `VERIFY_PLAYGROUND_PORT` to use another port. The app has no data, migrations or sign-in.

It refuses to start while this checkout already runs an instance. Two checkouts can run side by side on different ports. State lives in `.verify-playground/` at the repository root: `server.pid`, `server.port`, `server.log`.

## Doctor

```bash
.agents/skills/verify-playground/scripts/doctor.sh
```

Read-only. It prints one `ok` or `FAIL` line for each of: an instance was launched from this checkout, its process is alive, the process runs from this checkout's app directory, the page serves markup whose `class` attribute holds a library class, and the build is newer than every source file. Exit code 0 means the instance is worth driving. Run it first whenever a result looks wrong. A stale build means: run Cleanup, then Launch.

## Drive

```bash
.agents/skills/verify-playground/scripts/drive.mjs <journey> [engine]
```

Journeys: `button-default`, `consumer-override`, `token-theme`, `changing-props`, `disclosure`, `text-input`, `modal`, `box`, `styles-api`, `server-render`. Each is described in [features/](features/README.md). Engines: `chromium`, `firefox`, `webkit`. Without an engine the script uses the first one installed. The list of engines lives in `scripts/browser-engines.mjs` at the repository root; an engine that is not installed cannot be driven, and with `CI` set a missing engine is an error. The script uses Playwright, finds buttons by role and name and a disclosure by its summary text, prints one `PASS` or `FAIL` line per observation, and exits non-zero if any fails.

To check something no journey covers, add a journey to `drive.mjs` and a file to `features/`. Do not drive the page by test id or class when a role, a name or visible text exists.

## Evidence

Each run of `drive.mjs` writes a new directory `.verify-playground/evidence/<engine>/<journey>-<timestamp>/` holding:

- one numbered screenshot per step, taken after the action
- `recording.webm`, a recording of the whole journey
- `observations.json`, with the engine and its version, each step, and each observed value beside the expected one
- `response.html` for `server-render`, the exact bytes the server sent

A proof drives the built app through the page, not through a test hook. It shows the action and the state that follows, and it includes the console: every journey fails on a console error or warning.

## Cleanup

```bash
.agents/skills/verify-playground/scripts/cleanup.sh
```

It stops only the process this checkout launched, by the recorded pid, and removes `server.pid`, `server.port` and `server.log`. It never removes `.verify-playground/evidence`. Run it after a failed attempt too.

## What this skill does not cover

- Solid's development build. `apps/playground/tests/dev-diagnostics.test.ts` covers that, and `vp run evidence` runs it.
- An engine that is not installed on the machine. Run `vp exec playwright install --with-deps chromium firefox webkit` where the network allows it.
