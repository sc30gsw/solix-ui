---
name: verify-color-scheme
description: Checks that every colour token has a light and a dark value that each meet their contrast in every block of every component, that `data-color-scheme` switches the tokens, `color-scheme` and `lightHidden`/`darkHidden` with no `light-dark()` in the built stylesheet, that the pre-paint script and `SolixProvider` set, store, toggle, clear and force the scheme, and that the playground and every story keep the right scheme with scripts off, before hydration, hydrated, and in both schemes. Use when a change touches a colour token, the colour-scheme rules or API, `ColorSchemeScript`, the playground's document, or the Storybook preview.
---

# Verify the colour scheme

## The promise

Each colour token in `packages/core/src/tokens.stylex.ts` is written `light-dark(<light>, <dark>)`, each value an OKLCH colour inside sRGB, and in every `stylex.create` block of a component, under each condition and in each scheme, text reaches 4.5:1 and a border or outline 3:1 against the block's background or the page's.

The built stylesheet holds no `light-dark()`. Each colour token's default is its light value; an element whose `data-color-scheme` is `light` or `dark` sets every colour token to that scheme's value and `color-scheme` to the scheme, and `auto` sets `color-scheme: light dark` and the tokens of whichever scheme `prefers-color-scheme` names. So a scheme set on an inner element reaches the tokens beneath it, native controls follow, and `auto` needs no script. `lightHidden` and `darkHidden` each put one class on the root, which hides it inside an element whose `data-color-scheme` names that scheme, or names `auto` while the system prefers it.

`ColorSchemeScript` renders one `<script>` with the provider's nonce, or its own, that sets `data-color-scheme` on `<html>` to the forced scheme, else the stored one, else the default, with `auto` resolved, and sets nothing when the storage throws. `SolixProvider` writes nothing of the scheme on the server. After hydration it reads its manager, writes the computed scheme on the element `getRootElement` gives, follows the system while the value is `auto` and another page's change through the `storage` event, and its controls set, toggle (from the computed scheme), clear and, under `forceColorScheme`, neither change nor store it.

Every story runs, and passes its play function, axe and the diagnostics gate, in both schemes.

## The harm when it breaks

A dark value that misses its contrast leaves text unreadable for every user of the dark scheme. A `light-dark()` in the stylesheet is lowered by a consumer's minifier into custom properties that resolve at `:root`, so a scheme set on an inner element changes nothing. A missing `auto` rule or `color-scheme` gives a page without scripts, or a native control, the wrong scheme. A pre-paint script that ignores the stored value flashes the default on every load; one that breaks out of its element runs the stored text as markup. A provider that writes on the server, or before it settles, mismatches hydration or flashes; one that ignores `getRootElement` or `forceColorScheme` repaints the whole page.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/src/tokens.stylex.ts` and `scripts/tokens.ts` | Every token is a string literal in one `stylex.defineVars`; a `--solix-color-*` token is a colour. |
| `packages/core/build-pipeline.mjs`: `tokensPerScheme`, `libraryStylesheet` | It replaces each `light-dark()` custom property in a `:root` rule with its light value and writes the per-scheme rules in the `style-props` layer. |
| `packages/core/src/style-prop-table.ts`: `colorSchemeAttribute`, `colorSchemeOf`, `colorSchemeVisibilityPropNames`, `colorSchemeVisibilityClass`, `stylePropRules`, `displayPropNames` | The attribute's name, the `color-scheme` of each value, and the hiding rules, after every style-prop rule. `Modal` refuses the two props as display props. |
| `packages/core/src/style-props.ts`: `resolveStyleProps`, `StyleProps` | `true` adds the class; `false`, `null` and `undefined` add nothing. |
| `packages/core/src/color-scheme.ts`, `packages/core/src/color-scheme-manager.ts`, `packages/core/src/local-storage-manager.ts`, `packages/core/src/color-schemes.ts`, `packages/core/src/color-scheme-script.tsx` and `packages/core/src/solix-provider.tsx` | The provider's state, the context the two `create*` primitives read, the manager, and the script's text from `colorSchemeScriptText`. |
| `packages/core/tests/token-contrast.test.ts`, `packages/core/tests/color-scheme.test.tsx` and `packages/core/tests/build-output.test.ts` | The contrast of every pair in both schemes; the script run in a `vm` context against a model for generated pages; the built stylesheet's rules. |
| `apps/playground/src/Document.tsx`, `apps/playground/src/page-color-scheme.ts`, `apps/playground/src/App.tsx`, `apps/playground/src/app.css`, `apps/playground/src/sections/ColorSchemeSection.tsx` and `apps/playground/src/sections/color-scheme-setups.ts` | The document writes `data-color-scheme="auto"` and the script with the request's nonce; the app's provider defaults to `auto` with its own storage key; the body is painted with the body and text tokens; the section's buttons, outputs, two hidden boxes, an input, and a nested provider forced dark on its own section. |
| `apps/playground/tests/color-scheme.test.ts` | It serves the built playground and, in each installed engine and both system schemes, opens it with scripts off, with the client script blocked, and hydrated. |
| `apps/storybook/.storybook/preview.ts`, `apps/storybook/.storybook/preview.css`, `apps/storybook/stories-project.ts`, `apps/storybook/dark/vite.config.ts` and `apps/storybook/tests/stories-in-verify.test.ts` | Each stories project names its scheme in `env`; the preview sets it on `<html>` and refuses a story after which the page's `color-scheme` is another. |

Last confirmed against commit `98a85ea`. Run `git diff 98a85ea -- packages/core/src/tokens.stylex.ts scripts/tokens.ts packages/core/build-pipeline.mjs packages/core/src/style-prop-table.ts packages/core/src/style-props.ts packages/core/src/color-scheme.ts packages/core/src/color-scheme-manager.ts packages/core/src/local-storage-manager.ts packages/core/src/color-schemes.ts packages/core/src/color-scheme-script.tsx packages/core/src/solix-provider.tsx packages/core/tests/token-contrast.test.ts packages/core/tests/color-scheme.test.tsx packages/core/tests/build-output.test.ts apps/playground/src/Document.tsx apps/playground/src/page-color-scheme.ts apps/playground/src/App.tsx apps/playground/src/app.css apps/playground/src/sections/ColorSchemeSection.tsx apps/playground/src/sections/color-scheme-setups.ts apps/playground/tests/color-scheme.test.ts apps/storybook/.storybook/preview.ts apps/storybook/.storybook/preview.css apps/storybook/stories-project.ts apps/storybook/dark/vite.config.ts apps/storybook/tests/stories-in-verify.test.ts`. If it shows changes to the covered code, read them against the table before you trust a pass.

## Run it

```bash
vp test packages/core/tests/token-contrast.test.ts packages/core/tests/color-scheme.test.tsx packages/core/tests/build-output.test.ts apps/playground/tests/color-scheme.test.ts
vp test --project "stories*"
```

The first line builds the library and the playground and runs the token, script, stylesheet and playground checks. The second runs every story in both schemes against that build; run the first line first, since a run of the stories projects alone builds nothing. With `CI` set, all three engines must be installed.

## The tool and why

Contrast is arithmetic on the token values, so a node test computes it from the source rather than sampling pixels. The pre-paint script is a string, so fast-check draws pages (stored value, its failure, the system's scheme, the default, a forced scheme, a storage key with quotes and `</script>`) and runs the real text in a `vm` context against a model. What a browser resolves, hydrates and hides is a fact of each engine, so the playground test drives the built page with Playwright, and the stories run axe in both schemes.

## What a pass covers

- Every pair the contrast test finds, in both schemes; every colour token's two values in sRGB.
- `generatedRuns` pages for the script, as `color-scheme.test.tsx` sets it.
- In each installed engine, for a system in each scheme: the page with scripts off, the page with only the pre-paint script, a hydrated page with nothing stored and with a scheme stored, every button, a change of the system's scheme, another page's change, a storage that throws, and the forced section.
- Every story Storybook indexes, in each installed engine, in both schemes.

## What a pass does not cover

- A scheme nested inside the opposite one for `lightHidden` and `darkHidden`: their rules match any ancestor, so the outer scheme can hide an element of the inner one. The tokens and `color-scheme` follow the nearest ancestor.
- Turning transitions off while the scheme changes. The library adds no such style.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **The contrast test names a pair and a scheme.** Change one of the two values of that scheme in `tokens.stylex.ts`.
- **The stylesheet test finds `light-dark(`.** A colour reached the stylesheet outside a `:root` rule, or `tokensPerScheme` stopped replacing it.
- **The script test prints a counterexample.** It names the page; compare the attribute with the rule in the promise.
- **The playground test waits 30 seconds on an attribute.** The provider never wrote it: it did not settle, wrote it elsewhere, or did not subscribe.
- **A story fails on its `color-scheme`.** Something in the story, a provider most likely, set `data-color-scheme` on `<html>` to another scheme.

## When the change is intended

- A new colour token: write it `light-dark(<light>, <dark>)`; the contrast test measures both, and the build writes both.
- Mutation check after editing covered code: in a copy without `.git`, change the dark value of `--solix-color-text` to `oklch(0.42 0.01 268)` and run the first line with the dark stories project, which must fail in the contrast test and in axe on the dark `Disclosure` stories only. Then delete `manager.subscribe(setChosen);` from `color-scheme.ts` and run the playground test, which must fail on the storage event. Confirm the files are restored with `cmp`.
