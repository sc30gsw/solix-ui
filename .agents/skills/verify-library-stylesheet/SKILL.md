---
name: verify-library-stylesheet
description: Checks that the library's built stylesheet can always be overridden by a consumer, for every style definition in a generated set and not only the styles the components use today. Use when a change touches the library build pipeline, the cascade layer, the class prefix, the StyleX version, or adds `!important` to a library style.
---

# Verify the library stylesheet

## The promise

Every rule the library build emits sits inside the `solix` cascade layer, every class it emits starts with the library prefix `sx`, and no declaration is `!important`.

## The harm when it breaks

A rule outside the layer, or an `!important` declaration inside it, beats the consumer's own CSS, so a consumer can no longer override that style with a plain class. A class without the prefix can collide with a consumer who also compiles StyleX.

## Does your change touch it?

It does if it edits any of these:

| Covered code | What the check assumes about it |
| --- | --- |
| `packages/core/build-pipeline.mjs`: `compileLibrarySource`, `libraryStylesheet`, `LIBRARY_CASCADE_LAYER`, `LIBRARY_CLASS_PREFIX` | This is the only code that turns StyleX source into the published stylesheet. |
| `packages/core/build.mjs` | It writes `dist/styles.css` from `libraryStylesheet` and nothing else. |
| `packages/core/src/**` | Library styles are written with `stylex.create` and `stylex.defineVars`. A component may set a private custom property from `disclosure-state.stylex.ts` inside `stylex.create`, with conditions, and may style `::backdrop` in a nested block, as `Modal.tsx` does. |
| `packages/core/tests/stylesheet-properties.test.ts` | It calls `compileLibrarySource` and `libraryStylesheet` directly and parses the result with PostCSS. |
| `packages/core/tests/build-output.test.ts` | It reads `packages/core/dist/styles.css` and the built components, and parses the stylesheet with PostCSS. |
| `tests/support/global-setup.ts` | It runs `vp run -r build` in production mode before any test, which is what writes `packages/core/dist`. |
| `packages/core/tests/built-components.ts` | It lists the components that `packages/core/dist` holds. |
| `apps/playground/tests/consumer.test.ts` | It checks that the app's own rule comes before the library layer in the bundle, and the cascade in each installed engine. |
| `scripts/browser-engines.mjs` | It lists the engines `consumer.test.ts` runs on. |
| `vite.config.ts` | It sets the test include globs and the global setup. |
| `@stylexjs/babel-plugin` and `@stylexjs/stylex` in the catalog in `pnpm-workspace.yaml` | Version 0.19.2. |
| `@babel/core`, `@babel/preset-typescript` and `postcss` in the catalog in `pnpm-workspace.yaml` | `@babel/core` ^7.26.8 and `@babel/preset-typescript` ^7.26.0 run the build pipeline. `postcss` 8.5.33 parses the stylesheet in the tests. |

Last confirmed against commit `c1a47cd`. Run `git diff c1a47cd -- packages/core apps/playground/tests tests/support/global-setup.ts scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/stylesheet-properties.test.ts packages/core/tests/build-output.test.ts
```

It takes about ten seconds. The first file is the generated check. The second checks the stylesheet that the real library sources build to, including the `!important` rule.

## The tool and why

No verifier runs on a JavaScript build script, so this is not a proof. `stylesheet-properties.test.ts` uses fast-check to generate style definitions and runs each through the real `compileLibrarySource` and `libraryStylesheet`, then parses the result with PostCSS. Nothing is modelled by hand.

## What a pass covers

- 300 generated definitions per run, a different set each run.
- One to three style namespaces, each with one to four of fifteen CSS properties and two private custom properties, and sometimes a `::backdrop` block of up to three properties with plain values.
- Values that are plain, or conditional on pseudo-classes (including `:user-invalid` and `:disabled`), `data-*` attribute selectors, the `open` attribute, `@media`, `@supports`, and `stylex.when.ancestor`, `siblingBefore` and `descendant`, nested up to two levels.

## What a pass does not cover

- `stylex.keyframes`, `stylex.createTheme`, pseudo-elements other than `::backdrop`, conditions inside a `::backdrop` block, and styles whose values are only known at run time.
- The browser's cascade itself. That an unlayered rule beats a layered one comes from the CSS specification; `apps/playground/tests/consumer.test.ts` checks it in each installed engine for one case.
- A consumer who puts their own CSS in a layer declared before `solix`. That consumer loses to the library.
- `!important` in generated definitions. The generator never writes it, so only the real sources are checked for it.

## Reading a failure

- **An `expect` fails.** This is a real break. fast-check prints the smallest definition that triggers it under `Counterexample`, with a `seed` and `path`. Report it in these terms: which definition, and which rule left the layer or lost the prefix. Do not loosen the assertion.
- **`BABEL_TRANSFORM_ERROR` from StyleX.** The generator wrote source that StyleX rejects, so the check never ran for that input. Fix the generator in `stylesheet-properties.test.ts`, as `withoutRepeatedConditions` does for a condition nested inside itself.
- To replay one failure, add the printed `seed` and `path` to the options object passed to `fc.assert`, run again, and remove them afterwards.

## When the change is intended

- Renaming the layer or the prefix: change the constant in `build-pipeline.mjs`. The tests import it, so they follow.
- Adding a second layer, or emitting rules outside the layer on purpose: this changes the contract in `AGENTS.md`. Change that rule first, then the assertion on the stylesheet's top-level nodes.
- Upgrading StyleX: run the check, then update the version in the table above.
- Using a StyleX feature listed under "does not cover": add it to the generator first.
