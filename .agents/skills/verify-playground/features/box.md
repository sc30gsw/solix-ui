# Box

Before the section named `Styles API` is a section named `Style props`, a `Box` rendered as a `<section>`. Its padding is a responsive style prop that grows at the md breakpoint. Inside it are a library button with a style-prop background, three lines whose top margin comes from a style prop, a consumer class and a consumer `style`, a line whose `pt` longhand sits on a responsive `p` shorthand, a line with `mt="unset"` inside a `Box` with `mt="xl"`, and two lines that `hiddenFrom` and `visibleFrom` show on either side of md.

## Sub-features

- `style-prop-beats-default` shows the `bg` style prop's colour on the button instead of the button's own background.
- `style-prop-applies` gives the line `Style prop margin` the spacing token its `mt` names.
- `class-beats-style-prop` gives the line `Consumer class margin` the margin of the consumer's `.roomy` rule, not its `mt`.
- `style-beats-both` gives the line `Consumer style margin` the margin of the consumer's `style`, not its `.roomy` class or its `mt`.
- `responsive-value` switches the section's padding from its `xs` value to its `md` value at md, 62em in the table in `packages/core/src/style-prop-table.ts`, which is 992 pixels.
- `longhand-beats-shorthand` keeps the top padding of the line `Longhand padding`, written `p={{ base: "xs", md: "lg" }} pt={0}`, at 0 on both sides of md, while its other sides follow `p`.
- `nothing-inherited` gives the line `Unset margin`, a `Box` with `mt="unset"` inside a `Box` with `mt="xl"`, no top margin. Each `--sx-` custom property is registered not to inherit, so the outer value never reaches it.
- `hidden-from` and `visible-from` hide `Hidden from md` from md up, and `Visible from md` below md.

## How to get to it (user POV)

- Open the page and scroll down. The section named `Style props` is after the line that says whether the app records the modal as opened, and before the section named `Styles API`.
- Make the window 992 pixels wide or wider to cross the md breakpoint.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Below md.** Run `.agents/skills/verify-playground/scripts/drive.mjs box`. The journey reads the md width from the table in `packages/core/src/style-prop-table.ts` and opens the page one pixel below it, 991 pixels wide. The observation `the style prop's background beats the button's own default` (the error token) passes, and so do `a style prop sets the margin` (the spacing token `xl`), `the consumer's class beats the style prop` (the `.roomy` margin in `apps/playground/src/app.css`), `the consumer's style beats the consumer's class and the style prop` (the `--playground-pinned-margin` value in the same file), `below md: the section's padding comes from its xs value` (the spacing token `sm`), `below md: the pt longhand beats the p shorthand` (zero), `below md: the p shorthand sets the other sides` (the spacing token `xs`) and `mt=unset inside a Box with mt=xl takes no margin from it` (zero). `Hidden from md` is visible and `Visible from md` is not.
- **At md.** The journey widens the page to 992 pixels. The section's padding is the spacing token `lg`, the line `Longhand padding` keeps a top padding of zero and takes `lg` on its other sides, `Hidden from md` is gone, `Visible from md` shows, and the consumer's `style` still wins.
- **Proof.** The evidence directory holds `01-below-md.png`, `02-at-md.png`, `recording.webm` and `observations.json`.

## Gotchas

- A style prop writes only a `--sx-` custom property into `style`. The property itself is set by a class in the library's `style-props` layer, which ranks above the component defaults and below any unlayered consumer rule. If the consumer's class loses here, the layer is out of place, or a style prop wrote a CSS property inline.
- `hiddenFrom` and `visibleFrom` are classes in the same `style-props` layer, so a consumer's class that sets `display` beats them, by the same precedence that lets `.roomy` beat `mt`. A consumer who wants an element hidden from md must not give it a class that sets `display`.
- If `Longhand padding` takes the `lg` top padding at md, a shorthand's rule was emitted after the longhand's at that breakpoint. If `Unset margin` takes the `xl` margin, its custom property was registered to inherit, or not registered.
- The margin and padding are measured through `margin-top` and `padding-top`, not `height`. Chromium snaps a `height` to layout units and keeps a margin unsnapped, so the same length reads differently through the two properties.
- `apps/playground/tests/box.test.ts` checks the same cascade one pixel below md and at md, with scripts on and off, in every installed engine.
