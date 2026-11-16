# Simple grid

After the section named `Container` is a section named `Simple grid`. It holds a `SimpleGrid` of four cells, from `First cell` to `Fourth cell`, with `cols={{ base: 1, sm: 2, md: 3 }}`, `spacing={{ base: "xs", md: "lg" }}` and `verticalSpacing="xl"`, then two `SimpleGrid`s with `type="container"` and `cols={{ base: 1, "18em": 2, "30em": 4 }}`, one in a box 320 pixels wide whose first cell reads `Cell of the narrow container`, and one in a box 560 pixels wide whose second cell reads `Cell of the wide container` and whose first holds a third, with `cols={{ base: 1, "10em": 3 }}`, around `Cell of the nested container`. Last is a `SimpleGrid` with `minColWidth={160}` around `Auto-filled cell`.

## Sub-features

- `responsive-cols` gives the first grid 2 columns below md, from its `sm` value, and 3 from md.
- `responsive-spacing` spaces its columns by `xs` below md and `lg` from md, and its rows by `verticalSpacing`, `xl`, on both sides.
- `container-queries` gives each grid with `type="container"` the columns its container's width names, whatever the viewport: 2 in the 320 pixel box, past 18em, and 4 in the 560 pixel box, past 30em.
- `nested-container` gives the grid in a cell of the wide grid 1 column, because it queries the cell it sits in, not the grid around it.
- `min-col-width` fills a row with as many columns of at least 160 pixels as fit, ignoring `cols`.

## How to get to it (user POV)

- Open the page and scroll to the section named `Simple grid`, after the section named `Container`.
- Make the window 992 pixels wide or wider to cross the md breakpoint.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Below md.** Run `.agents/skills/verify-playground/scripts/drive.mjs simple-grid`. The journey opens the page one pixel below md. The observations `below md: the first grid has the 2 columns of its sm value` (`2`), `below md: the gap between its columns is xs` (the spacing token `xs`), `the gap between its rows is verticalSpacing, xl` (the spacing token `xl`), `the grid in a 320 pixel container has 2 columns, past 18em` (`2`), `the grid in a 560 pixel container has 4 columns, past 30em` (`4`), `the grid in one cell of it queries its own container and has 1 column` (`1`) and `the auto-filled grid makes columns at least 160 pixels wide` (`true`) pass.
- **At md.** The journey widens the page to the md width. `at md: the first grid has the 3 columns of its md value` (`3`), `at md: the gap between its columns is lg` (the spacing token `lg`) and `at md: the grids in containers keep their columns` (`2 4`) pass.
- **Proof.** The evidence directory holds `01-below-md.png`, `02-at-md.png`, `recording.webm` and `observations.json`.

## Gotchas

- A grid is found as the parent of one of its cells, and its columns are counted from its computed `grid-template-columns`, which every engine resolves to one length per track.
- With `type="container"`, the grid renders inside its `container` part, an element with `container-type: inline-size` named `simple-grid`, after a `<style>` that holds the rules for the widths its values name. Those rules sit in `@layer solix.style-props`, and their classes carry a scope of their own instance, so a grid nested in another's cell takes none of the outer grid's values.
- A container width is a key such as `"30em"`, `"480px"` or `"30rem"`. With container queries a breakpoint key such as `md` is ignored, and with media queries a width key is.
- `apps/playground/tests/layout.test.ts` checks the same values one pixel below md and at md, with scripts on and off, in every installed engine.
