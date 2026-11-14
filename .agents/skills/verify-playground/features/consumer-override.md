# Consumer override

The app gives one library button its own plain class. That class replaces the background, and every other library style on the button stays.

## Sub-features

- `override-wins` shows the consumer's background colour instead of the library's.
- `override-is-narrow` keeps the library's height and text colour on the same button.

## How to get to it (user POV)

- Open the page. The button named `Overridden` is the second button under the heading.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Override.** Open the page and look at the button named `Overridden`. Run `.agents/skills/verify-playground/scripts/drive.mjs consumer-override`. The observation `background comes from the consumer's class` (`rgb(250, 82, 82)`) passes, and so do `height still comes from the library` (`36px`) and `text colour still comes from the library` (`rgb(255, 255, 255)`).
- **Proof.** The evidence directory holds `01-page.png`, `02-overridden-button.png`, `recording.webm` and `observations.json`.

## Gotchas

- The app imports its own stylesheet before the library's on purpose. The library's cascade layer is why a plain class wins, whatever the order of the stylesheets. If the override passes only when the app's stylesheet comes last, the layer is broken. `apps/playground/tests/consumer.test.ts` checks that the app's rule comes before the library layer in the bundle.
