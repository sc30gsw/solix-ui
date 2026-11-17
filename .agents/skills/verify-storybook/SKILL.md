---
name: verify-storybook
description: Checks that `vp run verify` runs every story Storybook indexes as a test in Chromium, Firefox and WebKit, that every component the library exports has such a story, that a story fails on its play function, on axe's WCAG 2 A and AA rules, on Solid's development diagnostics and on any change to the project's accessibility settings, that each gate fails a broken story for its own reason, that Storybook's own interface works from its static build, and that the build and the broken-story runs send no telemetry. Use when a change adds or edits a component or a story, touches `apps/storybook` or the test listing, or changes Storybook, its Solid framework, its addons, Solid, the Solid plugin, axe-core or Playwright.
---

# Verify the stories

## The promise

`apps/storybook` is a private workspace package that consumes `@solix/core` the way a consumer does, from its build and its stylesheet. Where the stories live is written once, in `apps/storybook/.storybook/main.ts`, and every check reads them from Storybook's own index of that configuration.

`vp run verify` runs every story as a test in every engine. Every story in the index keeps the tag the test run takes, and in each engine the stories project runs exactly the files of those stories, as the test runner itself lists them for the run.

The components the library exports are the exports of its built entry whose call signatures the type checker gives the return type a JSX element of this project has, compared by declaration. However an export is written, a function, a `const` arrow or the result of a factory, it counts by its type. Every built component and `SolixProvider` are among them; `createTheme` is not. Each is the component of the default export of at least one story file whose stories run as tests in every engine, a static member that holds a part, such as `Grid.Col`, standing for the part, and the default export of every such file names a component.

A story fails when its play function fails, when axe finds a violation of a rule that axe tags WCAG 2 A or AA and enables by default, target size included, after the play function, and when Solid's development build reports a diagnostic while the story renders or plays. It fails before it renders when its resolved accessibility parameters differ from the project's own or its resolved accessibility globals leave the check to a person, and, in a development run, when Solid's development build is not loaded. axe leaves four rules that carry WCAG 2 A or AA tags out of a tag filter because it also tags them experimental; they do not run.

The broken stories in `apps/storybook/fixtures/Broken.stories.tsx` prove each gate bites: a button with no accessible name, two targets smaller than 24 pixels, a play function that expects the wrong text, an effect created outside an owner, an `onCleanup` called outside an owner, and six stories that try to leave the accessibility check, by `test: "off"`, `test: "todo"`, `disable`, their own `options`, their own `config` and the `manual` global. Both Solid stories only report their diagnostic, so they fail through the gate and not because Solid throws. The stories project never collects them. In one run of all of them per engine, each fails for its own reason and for no other's. The run reports each error's message and its stack through a reporter of the app's own, because Firefox's and WebKit's stacks do not start with the message, so a report of stacks alone loses every reason in those engines.

The scripts of the package are the ones its tests run. Its static build succeeds. Served, in each engine, its sidebar lists every component of the build's story index, a story picked in the sidebar renders in the preview and its play function passes in the interactions panel, the accessibility panel reports no violation of it, the interface has `requestIdleCallback`, and the page raises no console error.

Storybook's interface calls `requestIdleCallback` with no fallback when a story finishes. WebKit has none, so there the call throws, the console shows `TypeError: scope.requestIdleCallback is not a function`, and the accessibility panel never leaves "Accessibility scan in progress", because the error stops the handlers after it. The app's manager entry, `apps/storybook/.storybook/manager.ts`, adds `requestIdleCallback` and `cancelIdleCallback` on a timer where the engine has none. No newer Storybook 11 prerelease is published.

`core.disableTelemetry` in `apps/storybook/.storybook/main.ts` turns Storybook's telemetry off. The static build and the broken-story runs point `STORYBOOK_TELEMETRY_URL` at a collector of the tests' own, without `STORYBOOK_DISABLE_TELEMETRY`, and nothing arrives. The stories project inside `vp run verify` is not observed: its Vitest plugin sends its event while Vitest loads the configuration, before any setup can listen, and Storybook reads the endpoint once, when its telemetry module loads.

## The harm when it breaks

A component ships with no story, so no one sees its states and no gate runs on it. A story that quietly leaves the run, or turns its accessibility check off, hides the regression it was written to catch. An accessibility regression, such as a control with no name or a target too small to hit, reaches users unnoticed. A reactive mistake that Solid reports only in development ships silently. A gate that stops biting turns every story green while checking nothing. Storybook's interface stops loading for the people who review components. A build reports usage to a third party without the owner's consent.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `apps/storybook/src` | Story files whose default export names a component export, or the static member that holds a part, as `component`. A play function uses the user-event and expect that `storybook/test` gives, so it runs in the interface as well as in the tests. |
| `apps/storybook/.storybook/manager.ts` | It adds `requestIdleCallback` and `cancelIdleCallback`, on a one-millisecond timer, only where the engine has no `requestIdleCallback`. |
| `apps/storybook/.storybook/main.ts` | The stories glob, the one place the stories live; the Solid framework with docgen off; the accessibility and Vitest addons; and `core.disableTelemetry: true`. |
| `apps/storybook/.storybook/preview.ts` | It loads the library's stylesheet, sets the project's accessibility parameters, and checks before each story that the resolved parameters are those and the `manual` global is not on, then captures Solid's diagnostics and fails after the story on any it caught. |
| `tests/support/browser-gates.ts` | The axe tag list, every tag of the form `wcag2`, `wcag21` or `wcag22` with `a` or `aa`, and the capture of Solid's diagnostics, shared with the primitives' browser harness and the playground's Tabs test. |
| `apps/storybook/vite.config.ts`, `apps/storybook/stories-project.ts`, `scripts/browser-instances.ts` and `vite.config.ts` | The root config lists the stories project by its config path; the project takes its engines from `scripts/browser-engines.mjs` through the shared browser block, pre-bundles StyleX, leaves the libraries' runtime dependencies to the linked build, sets its own timeouts and listens on a port of its own. |
| `tests/support/global-setup.ts` | It asks the running Vitest for the test files of every project, `globTestSpecifications`, and provides them to the node tests as `testFilesOfEachProject`. |
| `apps/storybook/fixtures` | The broken stories, a Storybook config that takes only them and the real preview, and a test config of their own on another port. |
| `apps/storybook/tests` | `stories-in-verify.test.ts` compares the index with the listing. `story-coverage.test.ts` imports the files of the stories the listing runs. `broken-stories.test.ts` runs the fixtures project once per engine, outside the outer run's environment, with `support/story-reporter.ts` writing each story's status and each error's message and stack. `storybook-interface.test.ts` runs the build script under the collector, serves the build and drives the interface with Playwright. `support` holds the ports, the index, the collector, the static server and the child runs, which stop their whole process group on a timeout. |
| `apps/storybook/package.json` | It names `@solix/core` as a workspace dependency, and its scripts are the ones the interface test runs. |
| `packages/core/tests/built-library.ts`, `packages/core/tests/component-exports.test.ts` and `scripts/syntax/checker.ts` | `componentExports` compares the alias declarations each export's call signatures return, through `aliasDeclarationsReturnedBy`, with the alias of a JSX element written in a virtual file, through `aliasDeclarationsOfTypeAt`. |
| `tests/workspace-rules.test.ts` and `scripts/repository.ts` | The interface-library rule, on `whyInstalled` and `findPackageJSON`. |
| `pnpm-workspace.yaml`, `scripts/newest-releases.ts` and `scripts/check-newest-releases.ts` | The catalog pins Storybook, its addons and its Solid framework to one prerelease each, and every prerelease pin the Storybook app names without a channel of its own is on the until-stable channel. |

Last confirmed against commit `35357e0`. Run `git diff 35357e0 -- apps/storybook/src apps/storybook/.storybook/manager.ts apps/storybook/.storybook/main.ts apps/storybook/.storybook/preview.ts tests/support/browser-gates.ts apps/storybook/vite.config.ts apps/storybook/stories-project.ts scripts/browser-instances.ts vite.config.ts tests/support/global-setup.ts apps/storybook/fixtures apps/storybook/tests apps/storybook/package.json packages/core/tests/built-library.ts packages/core/tests/component-exports.test.ts scripts/syntax/checker.ts tests/workspace-rules.test.ts scripts/repository.ts pnpm-workspace.yaml scripts/newest-releases.ts scripts/check-newest-releases.ts`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test apps/storybook/tests packages/core/tests/component-exports.test.ts tests/workspace-rules.test.ts
vp test --project "stories*"
```

The first line builds the library and runs the listing, coverage, broken-story, interface and interface-library checks. Run it without `--project`, so the listing holds every project. The second runs every story in each engine. With `CI` set, all three engines must be installed.

To look at the stories yourself, run `vp exec storybook dev --ci` in `apps/storybook`; the configuration keeps telemetry off there too.

## The tool and why

Storybook's Vitest addon turns each story into a Vitest browser test, so the stories run in the same runner and engines as every other browser test, and its accessibility addon runs axe after the play function. Storybook's own index and Vitest's own listing decide what runs, so no check repeats a glob. Solid's development build reports its diagnostics through `OBSERVE.diagnostics`, which a capture collects per story. No gate is trusted until the broken story for it fails, and the broken stories run through the same preview, so a gate that stops biting fails a test.

## What a pass covers

- Every story of the index in each installed engine, under the play, accessibility, settings and diagnostics gates.
- Each broken story in each installed engine, and that its failure names its own reason: `button-name`, `target-size`, the failed `toHaveTextContent`, `NO_OWNER_EFFECT`, `NO_OWNER_CLEANUP`, and, for the six that try to leave the check, the setting they changed.
- The static build, its sidebar, one story with a play function picked in the sidebar, the interactions and accessibility panels for it, and console errors while doing so, in each installed engine.
- No telemetry from the static build or the broken-story runs.

## What a pass does not cover

- The four experimental WCAG 2 A and AA rules: `css-orientation-lock`, `p-as-heading`, `table-fake-caption` and `td-has-header`.
- Telemetry from the stories project inside `vp run verify`; see the promise.
- Storybook's development server. Its interface is not driven.
- Every story in the interface. One story with a play function is opened there; every story runs as a test.
- Console warnings in the interface. Storybook warns about its own deprecated story store; only errors fail.
- Screenshots and visual changes. No baseline is kept.
- Keys that need trusted browser events, such as `Escape` on a modal dialog. The user-event of `storybook/test` dispatches events, so the playground's tests keep those.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **The listing check names an engine.** The stories project does not run there what Storybook indexes: the root config lost the project, a file holds no story, or a story lost the test tag.
- **The coverage test names an export.** Add a story file to `apps/storybook/src` whose default export names it, or the static member that holds it, as `component`.
- **A story fails on an axe rule.** The message names the rule and the element. Fix the component or the story; do not narrow the tags.
- **A story leaves the accessibility gate.** The message names the setting it changed. Remove it; fix what it hid.
- **A story fails on a Solid diagnostic.** The message names the code; read it in the `reactivity-diagnostics` skill.
- **A broken story passes, or fails for another reason.** A gate stopped biting, or the reasons crossed. Read the gate in `preview.ts` before anything else.
- **The interface test fails on `requestIdleCallback` in one engine.** The manager entry no longer runs or no longer adds it; the console error and a stuck accessibility panel follow from the same cause.
- **The interface test fails on a console error.** Read the stack: an error from a story's own module is a story problem, an error in Storybook's chunks after an upgrade is Storybook's.
- **The telemetry test lists a request.** `core.disableTelemetry` is gone or a script overrides it.

## When the change is intended

- A new component: add its story file. The coverage test fails until you do.
- A new gate: add a broken story for it to the fixtures and its reason to `reasonOf` in `broken-stories.test.ts`; the type of `reasonOf` makes you name one for every broken story.
- A new script in the Storybook package: run it under the collector in the interface test and add it to the scripts that test runs.
- Upgrading Storybook, its addons or its framework: run both lines above, then read the interface test's output in each engine CI runs.
- Mutation check after editing covered code: copy `preview.ts` first. Remove `test: "error"` from the project's accessibility parameters and run the broken-story test, which must fail for `NoAccessibleName` and `TargetTooSmall`. Then make the diagnostics check after each story return without throwing, which must fail it for the two Solid stories. Restore `preview.ts` from the copy and confirm with `cmp` against it.
