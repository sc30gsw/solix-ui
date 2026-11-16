---
name: verify-behaviour
description: Drives a component that takes its behaviour from UI SDK, in the playground, the way a keyboard user does, in Chromium, Firefox and WebKit, and records screenshots, a recording and observed values as evidence. It covers the keyboard table, where focus goes, and what the SDK writes into the page at run time. Use after a change to `packages/core/src/headless.ts`, to a component built on it such as `Tabs`, to the SDK's version, or to Solid, and whenever a claim about keys or focus needs proof.
---

# Verify a behaviour component

A behaviour component keeps its own elements and takes keyboard, focus, selection and ARIA from `@ui-sdk/core` and `@ui-sdk/solid` through `packages/core/src/headless.ts`. Today there is one, `Tabs`, with `Tabs.List`, `Tabs.Tab` and `Tabs.Panel`. The playground, `apps/playground`, renders it in a section named `Tabs`.

This skill drives that section. It shares its instance with `.agents/skills/verify-playground`: Launch, Doctor and Cleanup are that skill's scripts, and this one adds a drive script of its own. Run everything from anywhere inside the repository. Run `vp install` first in a fresh checkout.

## Launch

```bash
.agents/skills/verify-playground/scripts/launch.sh
```

It builds the library and the app in production mode, starts the built server, and prints `ready: http://127.0.0.1:4331/ (pid N)`. Set `VERIFY_PLAYGROUND_PORT` to use another port. It refuses to start while this checkout already runs an instance. State lives in `.verify-playground/` at the repository root.

## Doctor

```bash
.agents/skills/verify-playground/scripts/doctor.sh
```

Read-only. Exit code 0 means the instance is this checkout's, alive, and built from the current sources. Run it before the first drive and after any drive that fails.

## Drive

```bash
.agents/skills/verify-behaviour/scripts/drive.mjs <component> [engine]
```

Components: `tabs`. Each is described in [features/](features/README.md). Engines: `chromium`, `firefox`, `webkit`; without one the script uses the first installed. It prints one `PASS` or `FAIL` line per observation and exits non-zero if any fails.

For `tabs` the script does three things, in this order:

- **What the SDK writes.** After hydration, and again after every key below, it reads the `<style>` elements whose text starts `@layer ui-sdk {`, the `style` attribute of every element that carries `data-slot`, the `style` attribute of `<html>`, the number of `inert` elements, the number of adopted style sheets, and whether any part carries a class that is neither `sx…` nor `solix-…`.
- **The keyboard table.** For every row of `keyboardTable` in `apps/playground/tests/support/tabs.ts` it sets the list's direction, starts at the row's tab, presses the row's keys, takes a screenshot, and observes the focused tab, the selected tab, the panels shown and the list's tab stops.
- **Focus.** It leaves the `Account` list with Shift+Tab and returns with Tab, observes that focus is on the selected tab with an outline in the primary token, then presses Tab twice and observes focus on the panel and then on the selected tab of the next list.

The script finds a list with `tabList` and a tab with `tabNamed` from that support file. Do the same in anything you add: a tab's accessible name includes its sections, and `tests/playground-verification-conventions.test.ts` fails a test that looks a tab up by role.

To cover a new behaviour component, add an entry to `components` in the script, a file to `features/`, and its rows beside `keyboardTable`.

## Evidence

Each run writes a new directory `.verify-playground/evidence/<engine>/behaviour-<component>-<timestamp>/` holding:

- one numbered screenshot per step, taken after the keys were pressed
- `recording.webm`, a recording of the whole run
- `observations.json`, with the engine and its version, each step, and each observed value beside the expected one

A proof drives the built app with real key presses, not through a test hook or the component's props, and it includes the console: every run fails on a console error or warning.

## Cleanup

```bash
.agents/skills/verify-playground/scripts/cleanup.sh
```

It stops only the process this checkout launched and never removes `.verify-playground/evidence`. Run it after a failed attempt too.

## Does your change touch it?

| Covered code | What the script assumes about it |
| --- | --- |
| `packages/core/src/headless.ts` | It is the only file that loads the SDK, and `bindSlot` gives each bound part the slot's attributes, which include `data-slot`. |
| `packages/core/src/Tabs.tsx`, `packages/core/src/TabsList.tsx`, `packages/core/src/TabsTab.tsx`, `packages/core/src/TabsPanel.tsx`, `packages/core/src/tabs-context.ts` and `packages/core/src/step-over-disabled.ts` | The list has role `tablist`, a tab role `tab` and a `label` part, a panel role `tabpanel`. A selected tab has `aria-selected="true"` and the one `tabindex="0"`. `stepOverDisabled` moves past a disabled tab. |
| `packages/core/build-pipeline.mjs`: `BEHAVIOUR_SDK_LAYER` | It names the layer the SDK's style elements open with. |
| `apps/playground/src/sections/TabsSection.tsx` | It renders the lists `Account`, `Manual vertical`, `Vertical`, `Optional` and `Controlled`, with the tabs, disabled tabs and props that `tabsSetups` describes, and one panel, `Members panel`, with a `display` style prop. |
| `apps/playground/tests/support/tabs.ts` | It holds `keyboardTable`, `tabsSetups`, `tabList`, `tabNamed`, `startAt`, `stateOf` and `sdkStyles`, which the script and `apps/playground/tests/tabs.test.ts` share. |
| `.agents/skills/verify-behaviour/scripts/drive.mjs` | It is the drive script. |
| `.agents/skills/verify-playground/scripts` | `launch.sh`, `doctor.sh` and `cleanup.sh` own the instance. |
| `scripts/browser-engines.mjs` and `scripts/expected-values.ts` | The engines, and the computed value of a token in the engine that runs. |
| `@ui-sdk/core`, `@ui-sdk/solid`, `solid-js`, `@solidjs/web` and `playwright` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `e1fe171`. Run `git diff e1fe171 -- packages/core/src/headless.ts packages/core/src/Tabs.tsx packages/core/src/TabsList.tsx packages/core/src/TabsTab.tsx packages/core/src/TabsPanel.tsx packages/core/src/tabs-context.ts packages/core/src/step-over-disabled.ts packages/core/build-pipeline.mjs apps/playground/src/sections/TabsSection.tsx apps/playground/tests/support/tabs.ts .agents/skills/verify-behaviour/scripts/drive.mjs .agents/skills/verify-playground/scripts scripts/browser-engines.mjs scripts/expected-values.ts pnpm-workspace.yaml`. If it shows changes, read them against the table and the feature file before you trust a pass.

## What this skill does not cover

- An engine that is not installed. Only Chromium was installed where this skill was first run; Firefox and WebKit run in CI through `apps/playground/tests/tabs.test.ts`, not through this script.
- A screen reader. The script reads roles, names and states from the page, not what is announced.
- A popup. No component with one exists yet, so nothing here observes the inline placement the SDK writes on a popup part, the `overflow` it sets on `<html>` or the `inert` it sets on siblings. The observations above are what must stay empty for `Tabs`.
- Generated sequences. `.agents/skills/verify-headless-seam` covers those.
- Touch, and a pointer other than the clicks that set a starting tab.
