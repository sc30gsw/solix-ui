# Token theme

The library's public tokens are custom properties that start with `--solix-`, written in `packages/core/src/tokens.stylex.ts`. The app overrides only `--solix-color-primary-6`, the primary palette's solid shade, for part of the page. A library button inside that part takes the new colour, and a button outside it does not. The journey observes only the button.

## Sub-features

- `theme-applies` shows the overridden token's colour on the button inside the themed subtree.
- `theme-is-scoped` keeps the default colour on a button outside it.

## How to get to it (user POV)

- Open the page. The button named `Themed` is on its own line under `Default` and `Overridden`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Themed subtree.** Open the page and look at the button named `Themed`. Run `.agents/skills/verify-playground/scripts/drive.mjs token-theme`. The observation `background follows the consumer's token value` (the `--solix-color-primary-6` value in the `.brand-green` rule of `apps/playground/src/app.css`) passes, and `a button outside the themed subtree keeps the default` (the primary token) passes.
- **Proof.** The evidence directory holds `01-page.png`, `02-themed-button.png`, `recording.webm` and `observations.json`.

## Gotchas

- The override is a plain CSS rule in the app that sets `--solix-color-primary-6`. Nothing in JavaScript takes part, so this journey also passes with scripts off.
