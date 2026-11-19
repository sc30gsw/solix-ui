# Token theme

The library's public tokens are custom properties that start with `--solix-`, written in `packages/core/src/tokens.stylex.ts`. The primary's alias, `--solix-color-primary-*`, names one palette's shades. For part of the page, the app wraps a nested `SolixProvider` whose theme's `primaryColor` names `brandPrimaryColor` from `apps/playground/src/sections/theme-setups.ts`, scoped by its `cssVariablesSelector` to the element with the class `brandSubtree`. A library button inside that part takes that palette's solid shade, and a button outside it does not. The journey observes only the button.

## Sub-features

- `theme-applies` shows the overridden token's colour on the button inside the themed subtree.
- `theme-is-scoped` keeps the default colour on a button outside it.

## How to get to it (user POV)

- Open the page. The button named `Themed` is on its own line under `Default` and `Overridden`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Themed subtree.** Open the page and look at the button named `Themed`. Run `.agents/skills/verify-playground/scripts/drive.mjs token-theme`. The observation `background follows the theme's primaryColor` (shade 6 of the palette `brandPrimaryColor` names) passes, and `a button outside the themed subtree keeps the default` (the primary token) passes.
- **Proof.** The evidence directory holds `01-page.png`, `02-themed-button.png`, `recording.webm` and `observations.json`.

## Gotchas

- The provider writes its theme into a `<style>` in the server's markup, so this journey also passes with scripts off.
