# Grid

After the section named `Simple grid` is a section named `Grid`. It holds seven `Grid`s of `Grid.Col`s: one whose two columns read `Half from md` and `Other half from md`, with `span={{ base: 12, md: 6 }}` and `gap={{ base: "xs", md: "lg" }}`; one with `A third` (span 4) and `A third after an offset` (span 4, offset 4); one with only `Ordered one` and `Ordered two` (span 6, whose `order` swaps at md), so they share a row; one with `Content column` (span `content`), `Auto column` (span `auto`) and `Fixed column` (span 3); one with `columns={24}`, `grow`, `justify="center"`, `align="flex-end"` and `overflow="hidden"` around `Grows to half` and `Grows to the other half` (span 6 each); and two with `type="container"` and container breakpoints from 10em to 30em, in boxes 480 and 240 pixels wide, whose first columns read `Half of a wide container` and `All of a narrow container` and span 12, or 6 from md.

## Sub-features

- `responsive-span` gives `Half from md` all 12 of 12 columns below md and 6 from md, and the gap `xs` below md and `lg` from md.
- `offset` leaves four columns and their gaps empty before `A third after an offset`.
- `order` puts `Ordered two` first below md and `Ordered one` first from md.
- `auto-and-content` sizes `Content column` to its content and lets `Auto column` grow into the rest of its row.
- `columns-and-grow` lets two columns of 6 out of 24 fill half the row each, with `grow`, and passes `justify`, `align` and `overflow` to the grid.
- `container-queries` gives a column 6 of 12 in a 480 pixel container, past its md breakpoint of 20em, and 12 of 12 in a 240 pixel one.

## How to get to it (user POV)

- Open the page and scroll to the section named `Grid`, after the section named `Simple grid`.
- Make the window 992 pixels wide or wider to cross the md breakpoint.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Below md.** Run `.agents/skills/verify-playground/scripts/drive.mjs grid`. The journey opens the page one pixel below md. The observations `below md: Half from md spans all 12 columns`, `A third spans 4 of 12 columns`, `A third after an offset leaves 4 columns empty before it`, `below md: Ordered two comes before Ordered one, in one row`, `with grow, two columns of 6 out of 24 each fill half the row`, `in a 480 pixel container, past 20em, a column spans 6 of 12` and `in a 240 pixel container, short of 20em, a column spans 12 of 12` (each `true`), `below md: the gap is xs` (the spacing token `xs`), `Content column is as wide as its content` (`auto`), `Auto column grows into the rest of its row` (`1`) and `justify, align and overflow reach the grid` (`center flex-end hidden`) pass.
- **At md.** The journey widens the page to the md width. `at md: Half from md spans 6 of 12 columns` (`true`), `at md: the gap is lg` (the spacing token `lg`) and `at md: Ordered one comes before Ordered two, in one row` (`true`) pass.
- **Proof.** The evidence directory holds `01-below-md.png`, `02-at-md.png`, `recording.webm` and `observations.json`.

## Gotchas

- The section is found by its exact name, `Grid`, because a region name matches as a substring and `Simple grid` holds it.
- A column is found by its text, and its `inner` part, which lays the columns out, as its parent. A span's width is `(row + gap) × span ÷ columns − gap`, read from that part's width and its computed `column-gap`, and compared within one pixel.
- `Grid.Col` is the component `GridCol`, which `Grid` carries. It reads `columns`, `grow`, how `Grid` queries its width, and Grid's `classes.col` and `styles.col`, from the grid's context.
- With `type="container"`, a `Grid` renders inside its `container` part. The `Grid`, for its gaps, and each column, for its span, offset, order and align, renders its own `<style>` with the rules for what it keys by the breakpoints `breakpoints` turns into container widths, so a column that waits does not hold back the grid. Without `breakpoints` it renders no container and its columns keep only their base values.
