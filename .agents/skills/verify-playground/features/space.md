# Space

After the section named `Styles API` is a section named `Space`. It holds three spaces, each found as the element after a line of text: one between `Above the space` and `Below the space`, whose `h` is `md` and becomes `xl` at md, one between `Before the space` and `After the space` in a flex row, whose `w` is `lg`, and one between `Above the pinned space` and `Below the pinned space`, with `h="xl"` and `mih="xs"`.

## Sub-features

- `height-is-its-minimum` keeps the first space at least as tall as its `h`, at its base and at md.
- `width-is-its-minimum` keeps the space in the flex row at least as wide as its `w`, so the row cannot shrink it.
- `mih-replaces-h` gives the pinned space its `mih` as its minimum height instead of its `h`.

## How to get to it (user POV)

- Open the page and scroll to the section named `Space`, after the section named `Styles API`.
- Make the window 992 pixels wide or wider to cross the md breakpoint.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Below md.** Run `.agents/skills/verify-playground/scripts/drive.mjs space`. The journey opens the page one pixel below md. The observations `below md: the space between Above the space and Below the space is at least its h, md` (the spacing token `md`), `the space between Before the space and After the space keeps its w, lg, as its minimum width in a flex row` (the spacing token `lg`) and `the pinned space takes its mih, xs, as its minimum height instead of its h` (the spacing token `xs`) pass.
- **At md.** The journey widens the page to the md width. `at md: the space between Above the space and Below the space is at least its h, xl` (the spacing token `xl`) passes.
- **Proof.** The evidence directory holds `01-below-md.png`, `02-at-md.png`, `recording.webm` and `observations.json`.

## Gotchas

- A space is measured through its computed `min-height` and `min-width`, which hold the token's length as the engine writes it, not through its box, which an engine snaps to layout units.
- The minimum size is the component's own variable, `--space-min-height` or `--space-min-width`, which a class in the `style-props` layer sets from `h` or `w`. Given `mih` or `miw`, the variable takes that value instead, and the style prop sets the same minimum.
- `apps/playground/tests/layout.test.ts` checks the same values one pixel below md and at md, with scripts on and off, in every installed engine.
