---
name: verify-storybook
description: Checks that every component the library exports has a story, that every story passes its play function, axe's WCAG 2 A and AA rules and Solid's development diagnostics in Chromium, Firefox and WebKit, that each of those gates fails a broken story for its own reason, that Storybook's own interface works from its static build, and that Storybook sends no telemetry. Use when a change adds or edits a component or a story, touches `apps/storybook`, or changes Storybook, its Solid framework, its addons, Solid, the Solid plugin, axe-core or Playwright.
---

# Verify the stories

## The promise

`apps/storybook` is a private workspace package that consumes `@solix/core` the way a consumer does, from its build and its stylesheet. Every component the built library exports is the `component` of one story file's default export, a part another export carries, such as `Grid.Col` or `Tabs.Tab`, and `SolixProvider` among them. An export counts as a component when its declared return type is `JSX.Element`, so `createTheme` is not one.

Every story runs as a test in `vp run verify`, once per installed engine, through the stories project in the root test config. It fails when its play function throws, when axe finds a violation of any rule tagged WCAG 2 A or AA, target size included, after the play function, or when Solid's development build reports a diagnostic while the story renders or plays. A story run that does not load Solid's development build fails before it renders.

The broken stories in `apps/storybook/fixtures/Broken.stories.tsx` prove each gate bites: a button with no accessible name, two targets smaller than 24 pixels, a play function that expects the wrong text, an effect created outside an owner, and an `onCleanup` called outside an owner. Both Solid stories only report their diagnostic, so they fail through the gate and not because Solid throws. The normal run never collects them. Each one, run alone in each engine, fails for its own reason and for no other broken story's.

Storybook's static build succeeds. Served, in each engine, its sidebar lists every component of the build's story index, a story picked in the sidebar renders in the preview and its play function passes in the interactions panel, the accessibility panel reports no violation, and the page raises no console error.

Storybook sends no telemetry. `core.disableTelemetry` in `apps/storybook/.storybook/main.ts` turns it off for the CLI and for the story runs, and the tests point `STORYBOOK_TELEMETRY_URL` at a collector of their own to see that nothing arrives.

## The harm when it breaks

A component ships with no story, so no one sees its states and no gate runs on it. An accessibility regression, such as a control with no name or a target too small to hit, reaches users unnoticed. A reactive mistake that Solid reports only in development ships silently. A gate that stops biting turns every story green while checking nothing. Storybook's interface stops loading for the people who review components. A build reports usage to a third party without the owner's consent.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `apps/storybook/src` | One `<Export>.stories.tsx` per component, whose default export names the export, or the member that carries the part, as `component`. A play function uses the user-event and expect that `storybook/test` gives, so it runs in the interface as well as in the tests. |
| `apps/storybook/.storybook/main.ts` | The stories glob takes only `src`, the framework is the Solid framework with docgen off, the addons are the accessibility and Vitest addons, and `core.disableTelemetry` is `true`. |
| `apps/storybook/.storybook/preview.ts` | It loads the library's stylesheet, runs axe with every WCAG 2 A and AA tag axe-core knows, and makes accessibility violations fail a test. Before each story it starts a capture of Solid's diagnostics, and fails after the story on any it caught; it fails before the story when the run is in development but Solid's development build is not loaded. |
| `apps/storybook/vite.config.ts`, `apps/storybook/stories-project.ts` and `vite.config.ts` | The root config lists the stories project, which takes its engines from `scripts/browser-engines.mjs` when it starts, pre-bundles StyleX, leaves the libraries' runtime dependencies to the linked build, and listens on a port of its own. |
| `apps/storybook/fixtures` | The broken stories, a Storybook config that takes only them and the real preview, and a test config of their own on another port. |
| `apps/storybook/tests` | `story-coverage.test.ts` reads the built exports, the return types from `packages/core/src/index.ts` and the story files. `broken-stories.test.ts` runs each broken story alone in each engine with a JSON report, outside the outer run's environment. `storybook-interface.test.ts` runs every script of the package, the static build among them, outside the outer run's environment, serves the build and drives the interface with Playwright. `support` holds the ports, the telemetry collector, the static server and the child runs. |
| `apps/storybook/package.json` | It names `@solix/core` as a workspace dependency and its only script builds the static Storybook into `dist`. |
| `scripts/syntax/checker.ts` | `returnedAliasDeclarations` gives the declarations of the alias a signature declares it returns. |
| `tests/workspace-rules.test.ts` | The React rule: `react` is installed only as the dependency `@storybook/icons` declares, only the Storybook app reaches it, no manifest names it, and no other package finds it as an ES module resolves a package. |
| `pnpm-workspace.yaml` | The catalog pins Storybook, its addons and its Solid framework to one release each, which the next channel of `scripts/newest-releases.ts` follows. |

Last confirmed against commit `3eaf20e`. Run `git diff 3eaf20e -- apps/storybook/src apps/storybook/.storybook/main.ts apps/storybook/.storybook/preview.ts apps/storybook/vite.config.ts apps/storybook/stories-project.ts vite.config.ts apps/storybook/fixtures apps/storybook/tests apps/storybook/package.json scripts/syntax/checker.ts tests/workspace-rules.test.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test apps/storybook/tests tests/workspace-rules.test.ts
vp test --project "stories*"
```

The first line builds the library, runs the coverage check, each broken story alone in each engine, the static build and the interface check; it takes about a minute with one engine installed. The second runs every story in each engine. With `CI` set, all three engines must be installed.

To look at the stories yourself, run `vp exec storybook dev --ci` in `apps/storybook`; the configuration keeps telemetry off there too.

## The tool and why

Storybook's Vitest addon turns each story into a Vitest browser test, so the stories run in the same runner and engines as every other browser test, and its accessibility addon runs axe after the play function. Solid's development build reports its diagnostics through `OBSERVE.diagnostics`, which a capture can collect per story. No gate is trusted until the broken story for it fails, and the broken stories run through the same preview, so a gate that stops biting fails a test.

## What a pass covers

- Every story of `apps/storybook/src` in each installed engine, under the play, accessibility and diagnostics gates.
- Each broken story alone in each installed engine, and that its failure names its own reason: `button-name`, `target-size`, the failed `toHaveTextContent`, `NO_OWNER_EFFECT` and `NO_OWNER_CLEANUP`.
- The static build, its sidebar, one story with a play function picked in the sidebar, the interactions and accessibility panels for it, and console errors while doing so, in each installed engine.
- No telemetry from the package's scripts or from a story run.

## What a pass does not cover

- Storybook's development server. Its interface is not driven; the same configuration keeps its telemetry off.
- Every story in the interface. One story with a play function is opened there; every story is run as a test.
- Console warnings in the interface. Storybook warns about its own deprecated story store; only errors fail.
- Screenshots and visual changes. No baseline is kept.
- Keys that need trusted browser events, such as `Escape` on a modal dialog. The user-event of `storybook/test` dispatches events, so the playground's tests keep those.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **The coverage test names an export.** Add `src/<Export>.stories.tsx` whose default export names it, or the member that carries it, as `component`.
- **A story fails on an axe rule.** The message names the rule and the element. Fix the component or the story; do not narrow the tags.
- **A story fails on a Solid diagnostic.** The message names the code; read it in the `reactivity-diagnostics` skill.
- **A broken story passes, or fails for another reason.** A gate stopped biting, or the reasons crossed. Read the gate in `preview.ts` before anything else.
- **The interface test fails on a console error.** Read the stack: an error from a story's own module is a story problem, an error in Storybook's chunks after an upgrade is Storybook's.
- **The telemetry test lists a request.** `core.disableTelemetry` is gone or a script overrides it.

## When the change is intended

- A new component: add its story file. The coverage test fails until you do.
- A new gate: add a broken story for it to the fixtures and its reason to `reasonOf` in `broken-stories.test.ts`; the type of `reasonOf` makes you name one for every broken story.
- Upgrading Storybook, its addons or its framework: run both lines above, then read the interface test's output in each engine CI runs.
- Mutation check after editing covered code: in `preview.ts` remove `test: "error"` and run the broken-story test, which must fail for `NoAccessibleName` and `TargetTooSmall`. Then make `failOnDiagnostics` return without throwing, which must fail it for the two Solid stories. Restore both and confirm with `cmp`.
