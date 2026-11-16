# Group

After the section named `Stack` is a section named `Group`. It holds a `Group` of three library buttons, `First in the group`, `Second in the group` and `Third in the group`, a `Group` with `grow` around the buttons `Grows`, `Grows too` and `Grows as well`, and a `Group` with `grow` and `preventGrowOverflow={false}` around a button with a long label and one named `Short`.

## Sub-features

- `row` lays the buttons out side by side, wrapping when the row is full, centred across it, and spaced by the spacing token `md`.
- `grow` marks the group with `data-grow` and gives each child the same share of the row.
- `prevent-grow-overflow` lets a child with a long label take more than its share when `preventGrowOverflow` is false.

## How to get to it (user POV)

- Open the page and scroll to the section named `Group`, after the section named `Stack`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Look.** Run `.agents/skills/verify-playground/scripts/drive.mjs group`. The journey scrolls to the section. The observations `the Group lays its children out in a row` (`row`), `the Group wraps by default` (`wrap`), `the Group's gap is md by default` (the spacing token `md`), `the Group centres its children across the row by default` (`center`), `the growing Group carries data-grow` (`true`), `each child of the growing Group takes the same share of the row` (`true`), `a child of the growing Group grows` (`1`), `with preventGrowOverflow false a child has no maximum width` (`none`) and `with preventGrowOverflow false the wide child takes more of the row than the short one` (`true`) pass.
- **Proof.** The evidence directory holds `01-group.png`, `recording.webm` and `observations.json`.

## Gotchas

- Each `Group` is found as the parent of one of its buttons, because it has no text or role of its own.
- A growing child's share is the variable `--group-child-width`, the row less its gaps divided by the number of children `Group` renders. The rule that applies it to each child sits in a layer nested in `style-props`, so a style prop on the child, such as `maw`, still wins.
- Equal shares means the widest and the narrowest growing child differ by one pixel or less.
- `apps/playground/tests/layout.test.ts` checks the same values one pixel below md and at md, with scripts on and off, in every installed engine.
