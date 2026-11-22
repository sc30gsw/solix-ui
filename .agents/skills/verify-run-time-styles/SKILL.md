---
name: verify-run-time-styles
description: Checks that every `<style>` the library or UI SDK adds to a page at run time carries the Content Security Policy nonce that `SolixProvider` is given, in the server's markup and after hydration in Chromium, Firefox and WebKit, and that the theme `createTheme` types reaches the `--solix-*` tokens in the library's layer, for generated themes, selectors and nonces and not only the theme the playground uses. Use when a change edits `SolixProvider`, `createTheme`, `LibraryStyle`, how the seam gives the SDK its nonce, adds a run-time `<style>`, or changes the SDK's version, Solid, the Solid plugin or Playwright.
---

# Verify the run-time styles

## The promise

`SolixProvider` takes `theme`, `getStyleNonce`, `cssVariablesSelector` and `withCssVariables`, and the colour-scheme props that `verify-color-scheme` covers, which add no `<style>`. It writes one `<style>` for its theme: the layer order `@layer ui-sdk, solix;`, then the library's sub-layer order, then, directly inside `@layer solix`, one rule under `cssVariablesSelector`, `:root` by default, that sets each `--solix-*` token the theme's keys and sizes name, and for a `primaryColor` that names a palette, `@scope (<selector>)` holding one rule at no specificity, `:where(:scope,[data-color-scheme])`, that points every shade of the primary at that palette, so the nearest provider's primary wins on a scope that is itself a scheme island, on an island inside it, and under an outer selector with an id. A value or selector that is an empty or blank string, holds `;`, `{`, `}`, `<`, `!`, `\` or `/*`, or leaves a bracket or a quote open, a `null`, and a key or size that names no token write nothing, so no value can end its rule, close the `<style>`, mark itself `!important` or swallow the declarations after it. A provider given no `getStyleNonce`, or one that gives `undefined`, `null` or an empty or blank string, takes the nonce of the provider around it. It writes no style when nothing is left or `withCssVariables` is `false`. The theme sits in the library's layer, so a consumer's own token override outside any layer still beats it.

Every `<style>` the library adds at run time is rendered by `LibraryStyle`, which takes the nonce from the provider and marks the element with `data-solix-rules`. UI SDK reads its nonce only from a `<meta property="csp-nonce">` in the head, once per document, at its first style; `createBehaviour` writes that meta with the provider's nonce before the SDK can write, when the head holds none. So on a page whose policy refuses a style without the nonce, the server's markup and every engine after hydration show every `<style>` with the page's nonce, the theme's and the SDK's alike, and the policy refuses none.

## The harm when it breaks

Under a Content Security Policy that names a nonce in `style-src`, a `<style>` without it is dropped. A theme style without the nonce leaves the page in the default theme. The SDK's style without it loses the rule that keeps a hidden slot hidden after hydration, so a panel the user did not select shows when a consumer gives it a `display`. A theme value that holds `;` or `}` would end its declaration or its rule and write CSS of its own, and one that holds `<` could close the `<style>` element. A theme outside the library's layer would beat a consumer's own token override.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/src/solix-provider.tsx`: `SolixProvider` | It provides what `nonceOf` makes of what `getStyleNonce` gives, or else the nonce of the provider around it, through `PageNonceContext` to everything inside it, and renders the theme's style sheet with `LibraryStyle` before its children when `themeStyleSheet` gives one and `withCssVariables` is not `false`. |
| `packages/core/src/create-theme.ts`: `createTheme`, `SolixTheme`, `scaleOfThemeKey`, `themeStyleSheet` | `SolixTheme` takes, for each key of `scaleOfThemeKey`, the sizes the tokens of that scale have. `themeStyleSheet` writes `layerOrder` from `packages/core/src/layers.ts`, the library's layer order, and its rules directly in `solix`, so they outrank the token defaults in `solix.components`, and writes nothing for a selector or a value that `isWritable` refuses. `createTheme` gives back what it is given. |
| `packages/core/src/library-style.tsx`: `LibraryStyle` | The one writer of a run-time `<style>` in the library, for the provider's theme and each `Grid`'s container queries: the nonce from `PageNonceContext`, `data-solix-rules` set to what it styles. |
| `packages/core/src/Grid.tsx`, `packages/core/src/GridCol.tsx` and `packages/core/src/SimpleGrid.tsx` | Each renders its container-query rules, when it has any, as a `LibraryStyle` in a `Show` before its root or its `container` part, so they carry the provider's nonce. The playground's `Grid` and `Simple grid` sections render them on the page the browser test opens. |
| `packages/core/src/run-time-style.ts`: `PageNonceContext`, `nonceOf` | The context defaults to no nonce, so a component outside a provider still renders. The mark, `libraryStyleMark`, is in `packages/core/src/style-prop-table.ts`, which imports at run time only `packages/core/src/layers.ts`, where the layer order is and which imports nothing. `nonceOf` gives `undefined` for a nonce that is not a string, or is empty or blank, and `SolixProvider` and `ColorSchemeScript` read their own nonce through it before they take the page's. |
| `packages/core/src/headless.ts`: `createBehaviour` | It reads the provider's nonce once, untracked, and appends the `csp-nonce` meta to the head only in the browser, only for a nonce `nonceOf` kept, and only when the head holds no such meta, setting the nonce through the element's `nonce` property, so the attribute never shows it. |
| `packages/core/tests/solix-provider.test.tsx` | It renders the built provider on the server for generated themes, selectors, nonces and `withCssVariables`, parses the style with PostCSS, and compares the declarations with a model built from `scaleOfThemeKey` and the tokens in `packages/core/src/tokens.stylex.ts`. |
| `tests/rules/library-modules.test.ts` | It refuses a `<style>` rendered, a style element created, or a style sheet constructed or adopted in any library source but `library-style.tsx`, finding `createElement`, `createElementNS`, `adoptedStyleSheets` and `CSSStyleSheet` by their declarations in `lib.dom` through `memberDeclarations`, a destructured member included, and the element's name by any string the type checker knows. A call through `call`, `apply` or another function is not followed. |
| `packages/core/src/css-syntax.ts`: `declarable` | It refuses an empty or blank theme value or selector, and one that ends a declaration, before the theme writer's own checks. |
| `packages/core/src/layers.ts`: `layerOrder`; `packages/core/src/style-prop-table.ts`: `libraryStyleMark`; `packages/core/src/tokens.stylex.ts`: `tokens` | The layer order `themeStyleSheet` writes first, the mark every library `<style>` carries, and the tokens the theme check's model reads. |
| `apps/playground/src/middleware.ts`, `apps/playground/src/style-nonce.ts` and `apps/playground/src/App.tsx` | The middleware gives each request a nonce of its own, as `event.nonce`, and sends `style-src 'self' 'nonce-…'; style-src-attr 'unsafe-inline'`. The app gives the provider that nonce, from the request on the server and from a `<script>`'s `nonce` property in the browser, so it still has it when the head lost the meta. |
| `apps/playground/src/sections/theme-setups.ts` and `apps/playground/src/sections/ThemeSection.tsx` | The theme's spacing, the attribute its selector names, and the two boxes, one under it and one outside it. |
| `apps/playground/tests/style-nonce.test.ts` | It reads the nonce from the policy header of each response, and checks the server's markup, then in every engine a page with scripts off, a hydrated page, and a hydrated page whose head lost every meta that carries a nonce, through Playwright's routing, listening for `securitypolicyviolation`. In each of those pages it checks that the box under the theme's selector takes the theme's spacing as its `p="md"` padding and the box outside it the library's. |
| `scripts/expected-values.ts` | The token sentinels it writes into a page carry the page's nonce, so the policy lets every other playground test read them. |
| `@ui-sdk/core` in the catalog in `pnpm-workspace.yaml` | At the version the catalog pins, `writeStyle` in `dist/foundation/platform/style.js` takes its nonce from `meta[property="csp-nonce"]`, through its `nonce` property or attribute, caches it per document at the first write, and appends a `<style>` with that nonce. |

Last confirmed against commit `a2a3a5d`. Run `git diff a2a3a5d -- packages/core/src/solix-provider.tsx packages/core/src/Grid.tsx packages/core/src/GridCol.tsx packages/core/src/SimpleGrid.tsx packages/core/src/create-theme.ts packages/core/src/library-style.tsx packages/core/src/run-time-style.ts packages/core/src/headless.ts packages/core/tests/solix-provider.test.tsx apps/playground/src/middleware.ts apps/playground/src/style-nonce.ts apps/playground/src/App.tsx apps/playground/src/sections/theme-setups.ts apps/playground/src/sections/ThemeSection.tsx apps/playground/tests/style-nonce.test.ts scripts/expected-values.ts pnpm-workspace.yaml tests/rules/library-modules.test.ts packages/core/src/layers.ts packages/core/src/style-prop-table.ts packages/core/src/tokens.stylex.ts packages/core/src/css-syntax.ts`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/solix-provider.test.tsx apps/playground/tests/style-nonce.test.ts tests/rules/library-modules.test.ts
```

It takes about fifteen seconds with one engine installed, most of it the build that every test run starts with. With `CI` set, all three engines must be installed.

## The tool and why

No verifier runs on a Solid component or on a browser's policy, so this is not a proof. What the provider writes is a function of its props, so the first test generates them with fast-check and checks the real built provider against a model. Whether a browser accepts each style is a fact of each engine, so the second test serves the real page under a real policy and listens for the violations the engine reports.

## What a pass covers

- `generatedRuns` draws per run, as `solix-provider.test.tsx` sets it: themes with every theme key and two that are not, every size the tokens have and three that are not, values plain, with spaces, quotes, `&`, `>` and parentheses, values that `isWritable` refuses, one for each reason, `null` and `undefined`, selectors that are valid and selectors it refuses, a nonce or none, and `withCssVariables` on, off or left out.
- Two responses with different nonces, and in each installed engine the playground's page with scripts off, hydrated, and hydrated without the meta, each with the theme's style and the layout components' container-query styles and, once hydrated, the SDK's.

## What a pass does not cover

- A theme that changes after the first render. The provider's style follows it, and the browser keeps applying an element whose nonce it accepted once, but no test changes the theme.
- A page that renders a behaviour component outside every `SolixProvider` before the first one inside it. The SDK caches the page's nonce at its first style, so a later meta comes too late.
- An adopted style sheet the SDK constructs, which it does only where the meta carries an empty nonce; no policy restricts one.
- The nonce of nested providers in a browser. The server test renders an inner provider with no `getStyleNonce` inside one that has it. Their primary, which `apps/playground/tests/button.test.ts` holds in the browser, is not a nonce matter.
- A theme style first created in the browser, after a theme or `withCssVariables` changes or on a client-side navigation. It takes what `getStyleNonce` gives in the browser, so a getter that reads only the request gives none there.
- A `<style>` written through `dynamic`, `<Dynamic>`, `innerHTML` or `insertRule`. The convention test finds only a JSX `<style>`, a created element and a style sheet, and no library source does these.
- A refusal with scripts off. The listener needs a script, so that row proves the theme by its computed value instead.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **The server test fails on a nonce.** A `<style>` in the markup does not carry the page's nonce: a run-time style was rendered without `LibraryStyle`, or `LibraryStyle` lost the provider's nonce.
- **The browser test fails on the nonces with an empty one at the end.** A style the SDK added carries no nonce. With the meta removed, `createBehaviour` no longer writes it, or the SDK reads its nonce from somewhere else now; read `writeStyle` in the pinned SDK.
- **`refused` is not empty.** The engine dropped a style; the message names the directive and the sample.
- **The theme value differs.** The theme's style was dropped, or its selector or layer changed.
- **The generated test fails.** fast-check prints the theme, selector and nonce under `Counterexample`. Say which rule broke in the terms above.
- To replay one failure, add the printed `seed` and `path` to the parameters passed to `assertProperty`, run again, and remove them afterwards.

## When the change is intended

- A new theme key: add it to `scaleOfThemeKey` with the scale whose tokens it sets. The type and the generated test follow.
- A new run-time style in the library: render it with `LibraryStyle`, and add what it styles to the playground so the browser test sees it.
- Upgrading the SDK: read how `writeStyle` finds its nonce in the new version, and change `createBehaviour` with it before you rerun.
- Mutation check after editing covered code: in `packages/core/src/headless.ts` remove the call to `giveTheSdkThePageNonce` and run the browser test, which must fail for the page without the meta. Then remove `nonce={nonce()}` from `LibraryStyle` and run both tests, which must fail on the server's markup and in every engine. Restore both afterwards and confirm with `cmp`.
