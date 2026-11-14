# Text input

Three text inputs sit below the disclosures: `Email`, `Overridden input` and `Disabled input`. `Email` has a border in the border token, `--solix-color-border`. After the user types a value that is not an address and leaves the field, its border takes the error token, `--solix-color-error`.

## Sub-features

- `text-input-default` shows the library's border and height.
- `text-input-override` lets a consumer's plain class replace the background while the height stays the library's.
- `text-input-disabled` shows a faded input that cannot be typed in.
- `text-input-error-after-leaving` shows the error border only after the user leaves an invalid value, and takes it away once the value is valid.

## How to get to it (user POV)

- Open the page and look at the inputs below the `Toggle` disclosure. Click `Email` and type.
- Press Tab or click another control to leave the field.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Look.** Open the page. Run `.agents/skills/verify-playground/scripts/drive.mjs text-input`. The observations `email: border colour` (the border token), `email: height` (the control-height token), `overridden input: background comes from the consumer's class` (the `.danger` background in `apps/playground/src/app.css`), `overridden input: height still comes from the library` (the control-height token), `disabled input: opacity` (`0.6`) and `disabled input: the user can type in it` (`false`) pass.
- **Typing.** Type `not an address` into `Email`. The same run observes `while typing an invalid value: border is not the error colour` (`false`).
- **Leaving.** Move focus to the `Default` button. The same run observes `after leaving the invalid value: border colour` (the error token).
- **Recovering.** Type `someone@example.com`, leave the field again. The same run observes `after leaving a valid value: border colour` (the border token).
- **Proof.** The evidence directory holds `01-page.png`, `02-email-input.png`, `03-typed-invalid.png`, `04-left-invalid.png`, `05-left-valid.png`, `recording.webm` and `observations.json`.

## Gotchas

- The error border follows the browser's `:user-invalid`, so a script that sets the value without leaving the field never sees it. The journey moves focus on purpose.
- While the input has keyboard focus its border is the primary token, which hides the error token. Observe the border after focus has left.
- Find the inputs by role `textbox` and accessible name. They have no visible label.
