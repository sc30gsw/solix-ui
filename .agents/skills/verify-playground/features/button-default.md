# Default button

A button from the library shows the library's default style: the primary token as its background, the primary palette's contrast token as its text colour, and the control-height token as its height.

## Sub-features

- `button-default-style` shows the primary background, the primary contrast text and the control height.

## How to get to it (user POV)

- Open the page. The button named `Default` is the first button under the heading.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Default style.** Open the page and look at the button named `Default`. Run `.agents/skills/verify-playground/scripts/drive.mjs button-default`. The observations `background` (the primary token), `text colour` (the primary contrast token) and `height` (the control-height token) pass.
- **Proof.** The evidence directory holds `01-page.png`, `02-default-button.png`, `recording.webm` and `observations.json`.

## Gotchas

- The primary token is `--solix-primary-6`, its contrast `--solix-primary-contrast` and the control height `--solix-control-height-sm`, in `packages/core/src/tokens.stylex.ts`. `drive.mjs` reads it from there, so a change to its value needs no change to `drive.mjs` or to this file.
