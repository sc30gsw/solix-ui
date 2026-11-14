# Styles API

At the end of the page is a section named `Styles API`. Every component but `Box` takes `classes` and `styles`, keyed by the names of its parts, and `unstyled`, and renders its root through `Box`. The section holds a library button that `classes.root` gives the consumer's `.danger` class, a disclosure named `Styled parts` whose summary gets the consumer's `.danger` and `.outlined` classes through `classes.summary` and a background through `styles.summary`, a button with `unstyled`, and a button with the `bg` style prop.

## Sub-features

- `classes-root-beats-default` shows the `.danger` background on the button named `Class from classes.root`, while its height stays the library's.
- `styles-beat-class-and-default` shows the `--playground-part-background` colour that `styles.summary` sets on the `Styled parts` summary, not the `.danger` background its class sets nor the library's surface or primary background.
- `classes-on-a-part` shows the `.outlined` outline that `classes.summary` puts on the same summary.
- `unstyled-drops-the-look` shows the button named `Unstyled` without the primary background or the control height, still carrying its stable class `solix-Button-root`.
- `style-prop-on-button` shows the error token's background that `bg="error"` sets on the button named `Style prop on a Button`.

## How to get to it (user POV)

- Open the page and scroll to the end. The section named `Styles API` comes after the section named `Style props`.
- Click the summary named `Styled parts` to open it.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Look.** Run `.agents/skills/verify-playground/scripts/drive.mjs styles-api`. The journey scrolls to the section. The observations `classes.root: background comes from the consumer's class` (the `.danger` background in `apps/playground/src/app.css`), `classes.root: height still comes from the library` (the control-height token), `styles.summary: background comes from styles, not from the class classes.summary names or the library` (the `--playground-part-background` value in the same file), `classes.summary: the consumer's class still sets the outline` (`solid`), `unstyled: background is the primary token` (`false`), `unstyled: height is the control-height token` (`false`), `unstyled: the button keeps its stable class` (`true`) and `a style prop on Button: background comes from bg` (the error token) pass.
- **Open.** The journey clicks `Styled parts`. `open: content is visible` (`true`) and `open: styles.summary still beats the library's open background` (the `--playground-part-background` value) pass.
- **Proof.** The evidence directory holds `01-styles-api.png`, `02-styled-parts-open.png`, `recording.webm` and `observations.json`.

## Gotchas

- `styles` writes inline declarations, so it beats every class, the consumer's included. On the root, a consumer's `style` comes after `styles.root` and wins over it.
- A class that `classes` names is a plain consumer class, unlayered, so it beats the library's `solix` layer the same way `class` does.
- `unstyled` drops only the library's StyleX classes. The stable class `solix-<Component>-<part>` stays on every part, and style props, `classes`, `styles`, `class` and `style` still apply. Without the library's classes the button falls back to the browser's own button look, so the journey checks what it is not, rather than a value.
- Every component's root is a `Box`, so it also carries `solix-Box-root`.
- `apps/playground/tests/consumer.test.ts` checks the same four cases with scripts on and off, in every installed engine.
