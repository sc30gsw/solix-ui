# Provider theme

The app wraps the page in `SolixProvider`, with a theme made by `createTheme` that sets the `md` spacing, a `cssVariablesSelector` that names one part of the section named `Theme`, and a `getStyleNonce` that gives the provider the page's nonce. A `Box` with `md` padding under that selector takes the theme's spacing, and one outside it keeps the default. The server sends the page with a Content Security Policy whose `style-src` names a nonce of its own for each page, and every `<style>` on the page carries it: the provider's theme style and the one UI SDK adds after hydration. The user sees the wider padding; the nonce is not visible.

## Sub-features

- `provider-theme-applies` shows the theme's spacing on the box under the selector, and a padding that differs from the box outside it.
- `provider-theme-is-scoped` keeps the default padding on the box outside the selector.
- `provider-theme-nonce` finds no `<style>` element whose nonce differs from the page's, and one `<style>` the library added.

## How to get to it (user POV)

- Open the page and scroll to the section named `Theme`. It holds two boxes, one under the provider's selector and one outside it.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Theme and nonce.** Run `.agents/skills/verify-playground/scripts/drive.mjs provider-theme`. The observations `the box under the provider's selector reads the theme's spacing` (the `md` value of `themedSpacing` in `apps/playground/src/sections/theme-setups.ts`), `the box outside it keeps the default padding` (the `--solix-spacing-md` token), `the theme changes the padding of the box under the selector` (true), `style elements without the page's nonce` (0) and `style elements the library added` (1) pass.
- **Proof.** The evidence directory holds `01-page.png`, `02-theme-section.png`, `recording.webm` and `observations.json`.

## Gotchas

- The journey reads the page's nonce from the `nonce` of a `<script>`, because the browser hides the `nonce` attribute of an element once the page has a policy from a header, and an element's `nonce` property still gives it.
- The theme's style sits in the library's cascade layer, so the token sentinels that the tests write on `:root` outside any layer still win there; the selector here names an element, whose own declaration wins over a value it would inherit.
- `apps/playground/tests/style-nonce.test.ts` checks the nonce in the server's markup, and in every engine with scripts off, hydrated, and hydrated from a page whose head lost the `csp-nonce` meta, where the library writes the meta that UI SDK reads its nonce from.
