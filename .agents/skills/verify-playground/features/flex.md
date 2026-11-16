# Flex

After the section named `Group` is a section named `Flex`. It holds a `Flex` around the buttons `First in the flex`, `Second in the flex` and `Third in the flex`, with `direction={{ base: "column", md: "row" }}`, `gap={{ base: "xs", md: "xl" }}`, `rowGap="sm"`, `align="center"`, `justify="space-between"` and `wrap="wrap"`, and a list named `Flex list`, a `Flex` its `component` prop makes a `<ul>`, with `gap="lg"`.

## Sub-features

- `flexbox-props` sets `align-items`, `justify-content` and `flex-wrap` from `align`, `justify` and `wrap`.
- `responsive-props` switches `flex-direction` from column to row, and the gap between columns from `xs` to `xl`, at md.
- `longhand-beats-shorthand` keeps the gap between rows at `rowGap`, `sm`, on both sides of md, while `gap` changes.
- `polymorphic` renders the list as the `<ul>` its `component` prop names.

## How to get to it (user POV)

- Open the page and scroll to the section named `Flex`, after the section named `Group`.
- Make the window 992 pixels wide or wider to cross the md breakpoint.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Below md.** Run `.agents/skills/verify-playground/scripts/drive.mjs flex`. The journey opens the page one pixel below md. The observations `below md: the Flex lays its buttons out in a column` (`column`), `below md: the gap between columns is xs` (the spacing token `xs`), `the gap between rows is rowGap, sm, not gap` (the spacing token `sm`), `align centres the buttons across the main axis` (`center`), `justify spreads the buttons along the main axis` (`space-between`), `wrap lets the buttons wrap` (`wrap`), `the Flex list is the <ul> its component prop names, a flex container` (`flex`) and `the Flex list's gap is lg` (the spacing token `lg`) pass.
- **At md.** The journey widens the page to the md width. `at md: the Flex lays its buttons out in a row` (`row`), `at md: the gap between columns is xl` (the spacing token `xl`) and `at md: the gap between rows is still rowGap, sm` pass.
- **Proof.** The evidence directory holds `01-below-md.png`, `02-at-md.png`, `recording.webm` and `observations.json`.

## Gotchas

- The `Flex` around the buttons is found as the parent of `First in the flex`.
- The flexbox props are variables that set `--flex-gap`, `--flex-row-gap` and the others, which the `Flex`'s own styles read, so a consumer's class beats them, and `unstyled` drops them with the rest of its look.
- `--flex-row-gap` and `--flex-column-gap` fall back to `--flex-gap`, so `rowGap` replaces `gap` for rows at every breakpoint, and `gap` at md does not undo `rowGap` at its base.
- `apps/playground/tests/layout.test.ts` checks the same values one pixel below md and at md, with scripts on and off, in every installed engine.
