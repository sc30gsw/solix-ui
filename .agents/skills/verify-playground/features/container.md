# Container

After the section named `Flex` is a section named `Container`. It holds three containers with the surface background, a default one around `Inside the default container`, one with `size="xs"` around `Inside the extra small container` and a fluid one around `Inside the fluid container`, and a container with `strategy="grid"` and `size="xs"`. That one holds the line `In the middle column of the grid container` and a child marked `data-breakout` with the line `Breaks out of the grid container` and a child marked `data-container`, which holds `Back to the width of the grid container`.

## Sub-features

- `size` limits the default container to the container size token `md`, and the extra small one to `xs`, and pads their sides by the spacing token `md`.
- `fluid` lets the fluid container take the whole width.
- `grid-strategy` lays the grid container out as a grid with no maximum width, puts each child in a middle column as wide as its size, lets the `data-breakout` child span the whole grid, and keeps its `data-container` child to the size again.

## How to get to it (user POV)

- Open the page and scroll to the section named `Container`, after the section named `Flex`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Look.** Run `.agents/skills/verify-playground/scripts/drive.mjs container`. The journey scrolls to the section. The observations `the default container is at most the md container size wide` (the container size token `md`), `the default container pads its sides by md` (the spacing token `md`), `the default container carries data-strategy=block` (`block`), `the extra small container is at most the xs container size wide` (the container size token `xs`), `the fluid container takes the whole width` (`100%`), `the grid container is a grid with no maximum width` (`grid none`), `a child of the grid container is as wide as its size, the middle column` (`true`), `the breakout child spans the whole grid container` (`true`) and `the data-container inside the breakout is at most the xs container size wide` (the container size token `xs`) pass.
- **Proof.** The evidence directory holds `01-container.png`, `recording.webm` and `observations.json`.

## Gotchas

- Each container is found as the parent of its first line of text.
- The grid's three columns come from the container's own styles. Where each child sits in the grid, the breakout and its `data-container` come from the child rules of the container's size variable, which it sets whenever it is styled, and `unstyled` drops them with the rest of its look.
- A width is compared with another within one pixel, so an engine's rounding of a fraction of a pixel does not count as a difference.
