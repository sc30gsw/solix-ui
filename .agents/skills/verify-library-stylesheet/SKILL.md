---
name: verify-library-stylesheet
description: Checks that the library's built stylesheet can always be overridden by a consumer, for every style definition in a generated set and not only the styles the components use today, and that it carries the SDK's own rule that keeps a hidden part hidden. Use when a change touches the library build pipeline, the cascade layer, the class prefix, the StyleX or UI SDK version, or adds `!important` to a library style.
---

# Verify the library stylesheet

## The promise

The stylesheet starts with one statement, `@layer ui-sdk, solix;`, which orders the behaviour SDK's layer before the library's, so every rule of the library beats every declaration of the SDK's that is not `!important`. Next, inside `ui-sdk`, comes the rule the SDK writes at run time to keep a hidden slot hidden, `display: none !important`, which the build reads from the SDK's package: a hidden part of a behaviour component stays hidden before hydration whatever `display` a style prop, a consumer's class or a consumer's `style` gives it. That declaration is the stylesheet's one `!important` one. Every rule the library build emits then sits inside the `solix` cascade layer, every class it emits starts with the library prefix `sx`, and no declaration there is `!important`. The last layer nested in `solix`, named `hidden`, holds one rule: an element that is `hidden` and carries a stable part class is not displayed, so a hidden part with no slot, such as a `Box`, stays hidden before hydration when a class of the library's or a style prop sets `display`. The rule leaves an element that is hidden until found to the browser. The style-prop rules sit in the layer before it, named `style-props` and ordered after every layer StyleX emits, so a style prop beats a component default and still loses to a consumer's unlayered rule. Each style prop's rules come at its base and then at each breakpoint in ascending order. Every rule of a shorthand style prop, such as `p`, comes before every rule of a longhand it sets, such as `pt`, at every breakpoint, and the `hiddenFrom` and `visibleFrom` rules come after all of them. An alias has no rule of its own. Each `--sx-` custom property a style-prop rule reads is registered once with `@property`, `syntax: "*"` and `inherits: false`, inside the `style-props` layer. A registration applies to the whole page wherever it sits, so the layer only decides that a consumer's unlayered registration of the same name wins. The style-prop table that the build loads imports nothing at run time.

## The harm when it breaks

Without the order statement, the SDK's layer is declared after `solix` wherever its styles load after the library's, and a rule of the SDK's then beats the library's classes. Without the SDK's rule, a panel that the server renders `hidden` and that a consumer gives a `display` shows until the page hydrates; without the hidden layer's rule, so does a hidden `Box` that a style prop gives one. A hand copy of the SDK's rule drifts from the one the SDK writes at run time, and the page then hides a part before hydration by one rule and after it by another. With a hidden rule that also matches `hidden="until-found"`, the browser's find in page can no longer reveal such an element. A rule outside the layer, or an `!important` declaration inside it, beats the consumer's own CSS, so a consumer can no longer override that style with a plain class. A class without the prefix can collide with a consumer who also compiles StyleX. A style-prop layer ordered before a StyleX layer lets a component default beat the style prop the consumer passed, and a breakpoint emitted out of order lets a smaller breakpoint's value win on a wide screen. A shorthand rule emitted after a longhand's lets `p` at md undo `pt={0}`. A custom property that inherits lets `mt="unset"` take an ancestor `Box`'s margin. An import in the table that stays at run time stops `build.mjs` from loading it in plain Node.

## Does your change touch it?

It does if it edits any of these:

| Covered code | What the check assumes about it |
| --- | --- |
| `packages/core/build-pipeline.mjs`: `compileLibrarySource`, `behaviourSdkHiddenRule`, `libraryStylesheet`, `LIBRARY_CASCADE_LAYER`, `LIBRARY_CLASS_PREFIX`, `STYLE_PROP_LAYER`, `HIDDEN_LAYER`, `HIDDEN_PART_SELECTOR`, `BEHAVIOUR_SDK_LAYER` | This is the only code that turns StyleX source into the published stylesheet. `behaviourSdkHiddenRule` parses the SDK's module that writes its hidden rule, `dist/foundation/platform/style.js` of `@ui-sdk/core`, and returns the one string in its `enforceHidden` that opens `@layer ui-sdk {`, or fails the build. `libraryStylesheet` writes one statement first, which orders the behaviour SDK's layer, `ui-sdk`, before the library's, then that rule, and then the library's one layer. Inside it the style-prop rules sit in their nested layer after the StyleX layers, and after that the hidden layer, whose one rule hides an element that is `hidden`, unless hidden until found, and carries a class that contains the prefix of every stable part class. |
| `packages/core/build.mjs` | It writes `dist/styles.css` from `libraryStylesheet`, given the StyleX rules, the `stylePropRules()` of the built `dist/style-prop-table.js` and `behaviourSdkHiddenRule`, and nothing else. |
| `packages/core/src/style-prop-table.ts`: `stylePropRules`, `stylePropClassPrefix`, `breakpointWidths` | It writes every style-prop rule from the table: one `@property` registration per custom property, then the rules of the props at each shorthand depth in turn, each depth at its base and then in one `min-width` media block per breakpoint in ascending order, then the `hiddenFrom` and `visibleFrom` rules. A row's `within` names the shorthand one level above it, and its depth is the length of that chain. It imports nothing at run time, so plain Node can load its build. Its class prefix is the build's `LIBRARY_CLASS_PREFIX`. |
| `packages/core/src/**` | Library styles are written with `stylex.create` and `stylex.defineVars`. A component may set a private custom property from `disclosure-state.stylex.ts` inside `stylex.create`, with conditions, and may style `::backdrop` in a nested block, as `Modal.tsx` does. |
| `packages/core/tests/stylesheet-properties.test.ts` | It calls `compileLibrarySource` and `libraryStylesheet` directly, with the real style-prop rules and the SDK's rule, and parses the result with PostCSS. |
| `packages/core/tests/cascade-layers.ts` | It lists the layers nested in a layer in the order the cascade ranks them, and the layers around a declaration, for both tests. |
| `packages/core/tests/build-output.test.ts` | It reads `packages/core/dist/styles.css` and the built components through `packages/core/tests/built-library.ts`, reads the built `dist/style-prop-table.js`, and parses the stylesheet with PostCSS. Which property a shorthand sets comes from `longhandsSetBy`, written from the CSS specification for horizontal, left-to-right text: `margin`, `padding`, their `-inline` and `-block` forms, `inset` and `background`. |
| `tests/support` | It runs `vp run -r build` in production mode before any test, which is what writes `packages/core/dist`. |
| `scripts/syntax.ts` and `scripts/syntax` | `build-output.test.ts` parses the built `dist/style-prop-table.js` with it, to find any import that stays at run time. |
| `packages/core/tests/built-library.ts` | It lists the components that `packages/core/dist` holds, and reads `dist/styles.css` as `stylesheet` and each built component as `builtSource(name)`. |
| `packages/core/src/stable-class.ts`: `stableClass`, `stableClassPrefix` | Every stable part class starts with `stableClassPrefix`, and `build-pipeline.mjs` imports it from here to write the hidden layer's selector, so the hidden rule matches every part. |
| `apps/playground/tests/behaviour-seam.test.ts` and `apps/playground/tests/tabs.test.ts` | `behaviour-seam.test.ts` checks in each installed engine, with scripts on and off, that a hidden `Box` that a style prop gives a `display` is not displayed and that one hidden until found keeps the `display` its style prop gives, that the page holds no `<style>` element and no adopted style sheet before a script runs and after it only the one `<style>` element the SDK adds, whose text is the rule `behaviourSdkHiddenRule` returns, and that the linked stylesheet names `ui-sdk` before `solix`. `tabs.test.ts` checks that, before any script runs, a hidden panel that a style prop, the consumer's `style` or the consumer's class gives a `display` is not displayed. |
| `apps/playground/tests/consumer.test.ts` and `apps/playground/tests/box.test.ts` | `consumer.test.ts` checks that the app's own rule comes before the library layer in the bundle, and `box.test.ts` checks the cascade in each installed engine. |
| `scripts/browser-engines.mjs` | It lists the engines the browser tests run on. |
| `vite.config.ts` | It sets the test include globs and the global setup. |
| `@stylexjs/babel-plugin`, `@stylexjs/stylex` and `@ui-sdk/core` in the catalog in `pnpm-workspace.yaml` | Each at the version the catalog pins. The SDK's module path and function name in `behaviourSdkHiddenRule` hold for that version. |
| `@babel/core`, `@babel/plugin-syntax-jsx`, `@babel/preset-typescript` and `postcss` in the catalog in `pnpm-workspace.yaml` | `@babel/core` runs the build pipeline with `@babel/preset-typescript`, and with `@babel/plugin-syntax-jsx` for a `.tsx` file, and `postcss` parses the stylesheet in the tests, at the versions the catalog pins. |

Last confirmed against commit `5019c44`. Run `git diff 5019c44 -- packages/core apps/playground/tests tests/support scripts/syntax.ts scripts/syntax scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/stylesheet-properties.test.ts packages/core/tests/build-output.test.ts apps/playground/tests/behaviour-seam.test.ts
```

It takes about ten seconds with one engine installed. The first file is the generated check. The second checks the stylesheet that the real library sources build to, including that the SDK's rule comes from the SDK's package and holds the one `!important` declaration, the nested-layer order, the order of the breakpoint rules against the owner's breakpoints (xs 36em, sm 48em, md 62em, lg 75em and xl 88em), the order of shorthand rules before longhand rules, the `@property` registrations, the aliases, and that the built table imports nothing. The third opens the built playground in each installed engine and reads what the hidden rule and the layer order do there.

## The tool and why

No verifier runs on a JavaScript build script, so this is not a proof. `stylesheet-properties.test.ts` uses fast-check to generate style definitions and runs each through the real `compileLibrarySource` and `libraryStylesheet`, then parses the result with PostCSS. Nothing is modelled by hand.

## What a pass covers

- 300 generated definitions per run, a different set each run.
- One to three style namespaces, each with one to four of fifteen CSS properties and two private custom properties, and sometimes a `::backdrop` block of up to three properties with plain values.
- Values that are plain, or conditional on pseudo-classes (including `:user-invalid` and `:disabled`), `data-*` attribute selectors, the `open` attribute, `@media`, `@supports`, and `stylex.when.ancestor`, `siblingBefore` and `descendant`, nested up to two levels.
- For each of those definitions, that the stylesheet starts with the order statement and then the SDK's rule, that no declaration in `solix` is `!important`, and that the style-prop layer and then the hidden layer are the last two layers nested in `solix`, whatever layers StyleX emits for it, and that every `@property` registration carries the library prefix. `@property` is a global rule, not a class, so the tests that walk classes leave it alone, and the test that says what the `style-props` layer holds allows it next to the classes and the media blocks.

## What a pass does not cover

- `stylex.keyframes`, `stylex.createTheme`, pseudo-elements other than `::backdrop`, conditions inside a `::backdrop` block, and styles whose values are only known at run time.
- The browser's cascade itself. That an unlayered rule beats a layered one comes from the CSS specification; `apps/playground/tests/button.test.ts` and `apps/playground/tests/box.test.ts` check it in each installed engine for a few cases.
- A consumer who puts their own CSS in a layer declared before `solix`. That consumer loses to the library.
- A consumer who names `solix` in a layer order of its own before the library's stylesheet, or imports the stylesheet into a layer. That consumer decides where `ui-sdk` falls, and `packages/core/README.md` says to name it before `solix`.
- A hidden part with no slot whose consumer class or `style` sets `display`, such as a `Box`. The hidden layer's rule loses to it, as every rule of the library does. A part with a slot is hidden by the SDK's rule instead.
- `!important` in generated definitions. The generator never writes it, so only the real sources are checked for it.

## Reading a failure

- **An `expect` fails.** This is a real break. fast-check prints the smallest definition that triggers it under `Counterexample`, with a `seed` and `path`. Report it in these terms: which definition, and which rule left the layer or lost the prefix. Do not loosen the assertion.
- **`BABEL_TRANSFORM_ERROR` from StyleX.** The generator wrote source that StyleX rejects, so the check never ran for that input. Fix the generator in `stylesheet-properties.test.ts`, as `withoutRepeatedConditions` does for a condition nested inside itself.
- To replay one failure, add the printed `seed` and `path` to the options object passed to `fc.assert`, run again, and remove them afterwards.

## When the change is intended

- Renaming the layer or the prefix: change the constant in `build-pipeline.mjs`. The tests import it, so they follow.
- Adding a second top-level layer, or emitting rules outside the layer on purpose: this changes the contract in `AGENTS.md`. Change that rule first, then the assertion on the stylesheet's top-level nodes.
- Changing a breakpoint: the owner fixed them. Change the table in `packages/core/src/style-prop-table.ts` and `ownerBreakpoints` in `build-output.test.ts` together. `apps/playground/tests/box.test.ts` and `drive.mjs` read the widths from the table.
- A new shorthand style prop: give each of its longhand rows `within` naming it. If its CSS property is not one `longhandsSetBy` knows, add the longhands it sets there, from the CSS specification.
- Upgrading StyleX: change the version in the catalog in `pnpm-workspace.yaml`, then run the check.
- Upgrading the SDK: if the build fails in `behaviourSdkHiddenRule`, find where the new version writes its hidden rule, point `sdkHiddenRuleSource` at it, and run the check; `behaviour-seam.test.ts` fails if the rule the SDK writes at run time differs from the one the build read.
- Using a StyleX feature listed under "does not cover": add it to the generator first.
