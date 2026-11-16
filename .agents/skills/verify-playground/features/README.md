# Playground verification map

This directory is the maintained source for verifying what a user sees and does on the playground's page. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.agents/skills/verify-playground/scripts/launch.sh`. The page is at `http://127.0.0.1:4331/` unless `VERIFY_PLAYGROUND_PORT` is set.
- Run `.agents/skills/verify-playground/scripts/doctor.sh` and require exit code 0.
- Never drive an instance that this checkout did not launch.
- The page has no stored data, so every journey starts from the same state after a page load.

## Driving conventions

- Run every journey through `.agents/skills/verify-playground/scripts/drive.mjs <journey> [engine]`, once per installed engine.
- Buttons are found by role and name: the buttons in the sections named `Stack`, `Group` and `Flex`, `Default`, `Overridden`, `Themed`, `Emphasise`, `Open modal`, `Background from a style prop`, `Class from classes.root`, `Unstyled` and `Plain button`. Text inputs are found by role `textbox` and name: `Email`, `Overridden input`, `Disabled input` and, inside the modal, `Name`. The modal is the dialog named `Settings`. A disclosure is found by its summary text, `Follows`, `Toggle`, `Inner` or `Styled parts`, or by its content text. The `Box` section is the region named `Style props`, and each line in it is found by its exact text. The section after it is the region named `Styles API`. Each layout component has a region named after it, such as `Space`, and an element in it with no text of its own is found as the element after a line of text, by that text.
- No journey writes an expected colour or length. `drive.mjs` reads each token from `packages/core/src/tokens.stylex.ts`, each of the app's own colours and lengths from `apps/playground/src/app.css`, and zero from `scripts/expected-values.ts`, and the same browser computes it, so it matches however that engine writes a computed value. It reads the breakpoint widths from `packages/core/src/style-prop-table.ts`.
- A feature file names the token it expects, such as the primary token for `--solix-color-primary`. The values are in `observations.json` and in each `FAIL` line.

## Proof and skip reporting

- A journey's proof is its evidence directory: numbered screenshots, `recording.webm` and `observations.json`.
- Report a failed observation with its expected and observed values, as `drive.mjs` prints them.
- Do not report a journey as verified because a different journey passed, or an engine as verified because a different engine passed.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing what the user sees. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.mjs`, `Gotchas`.

## Features

- [Default button](./button-default.md) covers the library's default style on a button.
- [Consumer override](./consumer-override.md) covers a consumer's plain class replacing one library style.
- [Token theme](./token-theme.md) covers a consumer retheming a subtree through a public token.
- [Changing props](./changing-props.md) covers a class and an attribute that the app changes after the first render.
- [Disclosure](./disclosure.md) covers opening and closing by click and by keyboard, the styles that follow its state, and a disclosure nested in another.
- [Text input](./text-input.md) covers the border, the disabled look, a consumer's override and the error shown after the user leaves an invalid value.
- [Modal](./modal.md) covers opening as a modal, and closing by Escape, the Close button and a press outside, with the app told each time.
- [Box](./box.md) covers style props against a component default, a consumer's class and a consumer's `style`, a responsive value, a longhand against its shorthand, a style prop that inherits nothing from an ancestor `Box`, and `hiddenFrom` and `visibleFrom` on either side of md.
- [Styles API](./styles-api.md) covers `classes`, `styles` and `unstyled` on a component's parts.
- [Space](./space.md) covers the height and width a `Space` keeps as its minimum, at each breakpoint, and `mih` replacing `h`.
- [Center](./center.md) covers content in the middle of a `Center`, and an inline `Center` rendered as a link.
- [Stack](./stack.md) covers a column of children with the default gap, and a gap and alignment the consumer gives.
- [Group](./group.md) covers a wrapping row of children with the default gap, children that grow into equal shares, and a child that takes more than its share when `preventGrowOverflow` is false.
- [Flex](./flex.md) covers each flexbox prop, a responsive direction and gap that switch at md, `rowGap` beating `gap`, and a `Flex` rendered as a list.
- [Container](./container.md) covers the default and a named maximum width, a fluid container, and the grid strategy's middle column with a child that breaks out of it.
- [Simple grid](./simple-grid.md) covers columns and spacing that follow the breakpoints, columns that follow a container's width with container queries, a grid nested in another's cell, and columns that fill a row with `minColWidth`.
- [Server render](./server-render.md) covers the page arriving rendered and styled before any script runs, and the disclosure working with scripts off.
