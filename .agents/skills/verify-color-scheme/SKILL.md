---
name: verify-color-scheme
description: Checks that every colour token has a light and a dark value that each meet their contrast in every block of every component, that `data-color-scheme` switches the tokens, `color-scheme` and `lightHidden`/`darkHidden` by the nearest scheme with no `light-dark()` in the built stylesheet, that the pre-paint script, `SolixProvider` and its manager set, store, follow, toggle, clear and force the scheme, and that the playground and every story keep the right scheme with scripts off, before hydration, hydrated, and in both schemes. Use when a change touches a colour token, the colour-scheme rules or API, `ColorSchemeScript`, the playground's document, or how a stories project gets its scheme.
---

# Verify the colour scheme

## The promise

Each colour token in `packages/core/src/tokens.stylex.ts` is written `light-dark(<light>, <dark>)`, each value an OKLCH colour inside sRGB, and in every `stylex.create` block of a component, under each condition and in each scheme, text reaches 4.5:1 and a border or outline 3:1 against the block's background or the page's.

The built stylesheet holds no `light-dark()`: the build refuses, naming the property, any it cannot expand. Each colour token's default is its light value. In the library's `color-scheme` layer, an element whose `data-color-scheme` is `light` or `dark` sets every colour token to that scheme's value and `color-scheme` to the scheme, and `auto` sets `color-scheme: light dark` and the tokens of whichever scheme `prefers-color-scheme` names. So a scheme set on an inner element reaches the tokens beneath it, native controls follow, and `auto` needs no script. `lightHidden` and `darkHidden` each put one class on the root, which hides it in that scheme: the scheme of the nearest ancestor with the attribute, light where none has it. An element that is shown keeps its `display`.

`ColorSchemeScript` renders one `<script>` with the provider's nonce, or its own, that sets `data-color-scheme` on `<html>` to the forced scheme, else the stored one, else, and when the storage throws, the default, with `auto` resolved. It leaves no global behind.

`SolixProvider` writes nothing of the scheme on the server. After hydration it reads its manager and then writes the computed scheme, once, on the element `getRootElement` gives, which may mount later. While nothing is stored it follows its default, light unless given. It follows the system while the value is `auto`, and its manager, which tells every subscriber of a set and of a clear, its own and another page's. Under `forceColorScheme` its controls do nothing; it still follows its manager, so it gives the stored scheme as soon as the force is lifted. Inside another provider it owns a scheme only with `getRootElement`; without it, it passes the outer scheme on.

Every story runs, and passes its play function, axe and the diagnostics gate, in both schemes, and fails when it leaves the page in another scheme than its project's.

## The harm when it breaks

A dark value that misses its contrast leaves text unreadable for every user of the dark scheme. A `light-dark()` in the stylesheet is lowered by a consumer's build tool into custom properties that resolve at `:root`, which `packages/core/README.md` explains, so a scheme set on an inner element changes nothing. A missing `auto` rule or `color-scheme` gives a page without scripts, or a native control, the wrong scheme. A hiding rule that follows any ancestor hides the wrong box inside a nested scheme. A pre-paint script that ignores the stored value, or disagrees with the provider, flashes on every load; one that breaks out of its element runs the stored text as markup. A provider that writes on the server, or before it has read its manager, mismatches hydration or flashes; one that ignores `getRootElement`, `forceColorScheme` or the provider around it repaints the whole page. A manager that drops a clear leaves one page on a scheme the next load loses.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/src/tokens.stylex.ts`, `scripts/tokens.ts` and `scripts/tokens-per-scheme.ts` | Every token is a string literal in one `stylex.defineVars`; `tokenValues` also reads a `stylex.defineConsts` file, such as the primary's constants, whose names may be plain identifiers; a `--solix-color-*` token is a colour. `schemeValues` is the one reader of `light-dark(<light>, <dark>)`. `tokensPerScheme` leaves the default scheme's value on `:root`, gives each scheme its declarations, and throws for any other `light-dark()`. |
| `packages/core/src/color-schemes.ts`, `packages/core/src/computed-color-scheme.ts` and `packages/core/build-pipeline.mjs`: `libraryStylesheet` | The one table of schemes, `cssColorSchemeOf`, its guard and `resolvedColorScheme`; the type of a scheme `auto` resolves to, in a module of its own so the barrel exports it on a line of its own; the attribute's name; and `colorSchemeRules`, every rule that names the attribute, which the build puts in the `color-scheme` layer after `style-props`. |
| `packages/core/src/style-prop-table.ts`: the visibility table, `visibilityClass`, `hiddenInAScheme`, `displayPropNames`; `packages/core/src/layers.ts`: `libraryLayers` | A row with a `scheme` is hidden in that scheme, through the class the table names and the custom property named for that class, both with the style props' `sx` prefix. `Modal` refuses every display prop. |
| `packages/core/src/style-props.ts`: `resolveStyleProps`, `StyleProps` | `true` adds the class; `false`, `null` and `undefined` add nothing. |
| `packages/core/src/color-scheme.ts`, `packages/core/src/color-scheme-manager.ts`, `packages/core/src/local-storage-manager.ts`, `packages/core/src/color-scheme-script.tsx` and `packages/core/src/solix-provider.tsx` | The provider's state, one memo of its manager and one signal of what it read from it; the context the two `create*` functions read; the manager's contract and the one in local storage; and the script's text from `colorSchemeScriptText`. The provider and the script read their defaults, the default scheme `light` and the script's storage key, only through `withDefaults` of `packages/core/src/parts.ts`, which gives a default wherever the prop is `undefined` or `null`, and a provider inside another decides which scheme props it was given from its props as passed, so a default never counts as given. |
| `packages/core/tests/token-contrast.test.ts`, `packages/core/tests/color-scheme.test.tsx`, `packages/core/tests/build-output.test.ts` with its helpers in `packages/core/tests/built-stylesheet.ts`, and `tests/tokens-per-scheme.test.ts` | The contrast of every pair in both schemes; the script run in a `vm` context against a model for generated pages, the element, the manager on the server and the nested provider's error; the built stylesheet's rules; what the expansion takes and refuses. |
| `apps/playground/src/Document.tsx`, `apps/playground/src/page-color-scheme.ts`, `apps/playground/src/App.tsx`, `apps/playground/src/app.css`, `apps/playground/src/sections/ColorSchemeSection.tsx` and `apps/playground/src/sections/color-scheme-setups.ts` | The document writes the page's scheme, `auto`, on `<html>` and the script with the request's nonce; the app's provider defaults to `auto` with the page's manager; the body is painted with the body and text tokens; the section's buttons, outputs, two hidden boxes, an input, and a nested provider forced dark on its own section, with the page's manager, three buttons and two hidden boxes of its own. |
| `apps/playground/tests/color-scheme.test.ts` | It serves the built playground and, in each installed engine and both system schemes, opens it with scripts off, with the client script blocked, and hydrated, records every write of the attribute, and loads the built stylesheet alone into pages it writes. |
| `apps/storybook/src/SolixProvider.stories.tsx` and `apps/storybook/src/ColorSchemeScript.stories.tsx` | Each provider story writes its scheme on an element of its own and empties its storage keys first: the default, a default of `auto` that follows the system, a changing default, two providers on one manager, a manager written inline in the prop, two providers given none, a nested provider, a root that mounts later, a force lifted and set again, with every scheme an effect sees, and the storage listener. |
| `apps/storybook/stories-project.ts`, `apps/storybook/story-color-scheme.ts`, `apps/storybook/story-color-scheme.setup.ts`, `apps/storybook/.storybook/preview.css`, `apps/storybook/tests/support/test-servers.ts` and `apps/storybook/tests/stories-in-verify.test.ts` | Each stories project provides its scheme, and the servers' schemes are the light and the dark one; the setup file sets it on `<html>` before each story and refuses a story after which the page's `color-scheme` is another; the preview paints the page with the tokens. |

Last confirmed against commit `d7e06a3`. Run `git diff d7e06a3 -- packages/core/src/tokens.stylex.ts scripts/tokens.ts scripts/tokens-per-scheme.ts packages/core/src/color-schemes.ts packages/core/src/computed-color-scheme.ts packages/core/build-pipeline.mjs packages/core/src/style-prop-table.ts packages/core/src/style-props.ts packages/core/src/color-scheme.ts packages/core/src/color-scheme-manager.ts packages/core/src/local-storage-manager.ts packages/core/src/color-scheme-script.tsx packages/core/src/solix-provider.tsx packages/core/tests/token-contrast.test.ts packages/core/tests/color-scheme.test.tsx packages/core/tests/build-output.test.ts tests/tokens-per-scheme.test.ts apps/playground/src/Document.tsx apps/playground/src/page-color-scheme.ts apps/playground/src/App.tsx apps/playground/src/app.css apps/playground/src/sections/ColorSchemeSection.tsx apps/playground/src/sections/color-scheme-setups.ts apps/playground/tests/color-scheme.test.ts apps/storybook/src/SolixProvider.stories.tsx apps/storybook/src/ColorSchemeScript.stories.tsx apps/storybook/stories-project.ts apps/storybook/story-color-scheme.ts apps/storybook/story-color-scheme.setup.ts apps/storybook/.storybook/preview.css apps/storybook/tests/support/test-servers.ts apps/storybook/tests/stories-in-verify.test.ts packages/core/src/layers.ts packages/core/tests/built-stylesheet.ts`. If it shows changes to the covered code, read them against the table before you trust a pass.

## Run it

```bash
vp test packages/core/tests/token-contrast.test.ts packages/core/tests/color-scheme.test.tsx packages/core/tests/build-output.test.ts tests/tokens-per-scheme.test.ts apps/playground/tests/color-scheme.test.ts apps/storybook/tests/broken-stories.test.ts apps/storybook/tests/stories-in-verify.test.ts
vp test --project "stories*"
```

The first line builds the library and the playground and runs the token, script, stylesheet, expansion, playground and broken-story checks, and the check that each stories project provides its scheme; run it without `--project`, so the listing holds every project. The second runs every story in both schemes against that build; run the first line first, since the stories projects alone build nothing. With `CI` set, all three engines must be installed.

## The tool and why

Contrast is arithmetic on the token values, so a node test computes it from the source rather than sampling pixels. The pre-paint script is a string, so fast-check draws pages (stored value, its failure, the system's scheme, the default, a forced scheme, a storage key with quotes and `</script>`) and runs the real text in a `vm` context against a model. What a browser resolves, hydrates and hides is a fact of each engine, so the playground test drives the built page with Playwright, and the stories run axe in both schemes. A provider's state after hydration is a fact of the browser too, so stories hold it, each on an element of its own.

## What a pass covers

- Every pair the contrast test finds, in both schemes; every colour token's two values in sRGB.
- `generatedRuns` pages for the script, as `color-scheme.test.tsx` sets it.
- In each installed engine, for a system in each scheme: the page with scripts off, the page with only the pre-paint script, a hydrated page with nothing stored and with a scheme stored, every button, a change of the system's scheme, another page's set, removal and `clear()` and its change of another key, a storage that throws when read and one whose methods throw, the order of the writes on `<html>`, the forced section with a manager it must not touch, and, on pages of the built stylesheet alone, every nesting of the attribute's values for the two hiding props and a consumer's token override under a nested scheme.
- Every story Storybook indexes, in each installed engine, in both schemes.

## What a pass does not cover

- Turning transitions off while the scheme changes. The library adds no such style.
- Firefox and WebKit where they are not installed. `revert-layer` as the fallback of `var()`, which the hiding classes rest on, is confirmed there only by CI.

## Reading a failure

- **The contrast test names a pair and a scheme.** Change one of the two values of that scheme in `tokens.stylex.ts`.
- **The build throws, naming a property.** Its value holds a `light-dark()` the build cannot give each scheme: write it as the whole value of a token on `:root`.
- **The script test prints a counterexample.** It names the page; compare the attribute with the rule in the promise.
- **The playground test waits 30 seconds on an attribute.** The provider never wrote it: it did not read its manager, wrote it elsewhere, or was not told.
- **The write-order test lists three writes.** The provider wrote before it read its manager, or resolved `auto` before the media query was live.
- **A story fails for leaving the colour scheme of its project.** A provider in the story wrote on `<html>`: give it an element of its own with `getRootElement`.

## When the change is intended

- A new colour token: write it `light-dark(<light>, <dark>)`; the contrast test measures both, and the build writes both.
- A new scheme-dependent prop: add its row to the visibility table; `colorSchemeRules` writes its custom property and class.
- Mutation check after editing covered code: in a copy without `.git`, change the dark value of `--solix-color-text` to `oklch(0.42 0.01 268)` and run the first line with the dark stories project, which must fail in the contrast test and in axe on stories of the dark project only. Then delete the `return store.subscribe` line from `color-scheme.ts` and run the playground test, which must fail on every button. Confirm the files are restored with `cmp`.
