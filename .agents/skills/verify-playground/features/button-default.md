# Default button

A button from the library shows the library's default style: the primary colour as background, white text, and a fixed height.

## Sub-features

- `button-default-style` shows the primary background, white text and 36px height.

## How to get to it (user POV)

- Open the page. The button named `Default` is the first button under the heading.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Default style.** Open the page and look at the button named `Default`. Run `.agents/skills/verify-playground/scripts/drive.mjs button-default`. The observations `background` (`rgb(34, 139, 230)`), `text colour` (`rgb(255, 255, 255)`) and `height` (`36px`) pass.
- **Proof.** The evidence directory holds `01-page.png`, `02-default-button.png`, `recording.webm` and `observations.json`.

## Gotchas

- The primary colour is the value of the token `--solix-color-primary`. If a change edits that token, the expected colour in `drive.mjs` changes with it.
