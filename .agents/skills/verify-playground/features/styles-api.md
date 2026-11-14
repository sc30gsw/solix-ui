# Styles API

Near the end of the page, before the `Primitives` section, is a section named `Styles API`. Every component takes `classes` and `styles`, keyed by the names of its parts, and `unstyled`. The section holds a library button that `classes.root` gives the consumer's `.danger` class, a disclosure named `Styled parts` whose summary gets the consumer's `.danger` and `.outlined` classes through `classes.summary` and a background and a text colour through `styles.summary`, a library button with `unstyled`, and a plain `<button>` named `Plain button` that the library does not style.

## Sub-features

- `classes-root-beats-default` shows the `.danger` background on the button named `Class from classes.root`, while its height stays the library's.
- `styles-beat-class-and-default` shows the `--playground-part-background` colour that `styles.summary` sets on the `Styled parts` summary, not the `.danger` background its class sets nor the library's surface or primary background, and the `--playground-part-text` colour on it, not the library's text colours.
- `classes-on-a-part` shows the `.outlined` outline that `classes.summary` puts on the same summary.
- `unstyled-drops-the-look` shows the button named `Unstyled` looking like the `Plain button` next to it, in every property that `lookOf` in `scripts/expected-values.ts` reads, still carrying its stable class `solix-Button-root`.

## How to get to it (user POV)

- Open the page and scroll to the end. The section named `Styles API` comes after the section named `Style props`.
- Click the summary named `Styled parts` to open it.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Look.** Run `.agents/skills/verify-playground/scripts/drive.mjs styles-api`. The journey scrolls to the section. The observations `classes.root: background comes from the consumer's class` (the `.danger` background in `apps/playground/src/app.css`), `classes.root: height still comes from the library` (the control-height token), `styles.summary: background comes from styles, not from the class classes.summary names or the library` (the `--playground-part-background` value in the same file), `styles.summary: text colour comes from styles, not from the library` (the `--playground-part-text` value), `classes.summary: the consumer's class still sets the outline` (`solid`), one `unstyled: <property> is the Plain button's` for each property `lookOf` in `scripts/expected-values.ts` reads (the `Plain button`'s value in the same page and engine) and `unstyled: the button keeps its stable class` (`true`) pass.
- **Open.** The journey clicks `Styled parts`. `open: content is visible` (`true`), `open: styles.summary still beats the library's open background` (the `--playground-part-background` value) and `open: styles.summary still beats the library's open text colour` (the `--playground-part-text` value) pass.
- **Proof.** The evidence directory holds `01-styles-api.png`, `02-styled-parts-open.png`, `recording.webm` and `observations.json`.

## Gotchas

- `styles` writes inline declarations, so it beats every class, the consumer's included. On the root, a consumer's `style` comes after `styles.root` and wins over it.
- A class that `classes` names is a plain consumer class, unlayered, so it beats the library's `solix` layer the same way `class` does.
- `apps/playground/tests/button.test.ts` and `apps/playground/tests/disclosure.test.ts` check the same cases with scripts on and off, in every installed engine, the open `Styled parts` summary included.
