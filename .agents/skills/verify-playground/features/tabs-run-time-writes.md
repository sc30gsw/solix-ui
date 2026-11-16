# Tabs run-time writes

While a user clicks and presses keys in the section named `Tabs`, UI SDK writes one thing into the page: one `<style>` element in its own cascade layer, which hides a hidden part. The page holds no other `<style>` element and no adopted style sheet. The SDK writes no inline style on a part, nothing on `<html>`, makes nothing inert and gives no part a class. The user sees none of this directly. What the user sees is that the tabs keep the library's look.

## Sub-features

- `tabs-run-time-writes-style-element` finds one style on the page, `<style>` elements and adopted style sheets counted together, whose text starts `@layer ui-sdk {`, with one `!important` declaration.
- `tabs-run-time-writes-parts` finds no `style` attribute on a part but the custom property that the `display` style prop wrote on `Members panel` and the `style` the app gives `Styled panel`, and no class on a part that is neither a class of the library's stylesheet, a stable part class nor the class the app gives `Classed panel`.
- `tabs-run-time-writes-page` finds no `style` attribute on `<html>` and no `inert` element.

## How to get to it (user POV)

- Open the page and scroll to the section named `Tabs`.
- Click `Overview` in `Account`, press the right arrow, End and Home, and click `Notes` in `Optional` twice.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Writes.** Run `.agents/skills/verify-playground/scripts/drive.mjs tabs-run-time-writes`. It observes the same seven values twice, `after hydration` and `after clicks and keys`: `style elements and adopted rules on the page` (1), `the one style is in the SDK's layer` (true), `important declarations in them` (1), `style attributes on the parts`, `style attribute on the html element` (empty), `inert elements` (0) and `parts that carry a class neither the library nor the app gave` (0).
- **Proof.** The evidence directory holds `01-tabs.png` and `02-after-keys.png`, with `recording.webm` and `observations.json`.

## Gotchas

- A part is an element that carries `data-slot`, which the SDK gives every element bound to one of its slots.
- The journey takes the layer's name and the library's class prefix from `packages/core/build-pipeline.mjs`, the stable class prefix from `packages/core/src/stable-class.ts`, the class of the `display` style prop from `packages/core/src/style-prop-table.ts` and what the app gives the two panels of `Held` from `apps/playground/src/sections/tabs-setups.ts`, so it follows a rename.
- The observations name what the SDK writes for `Tabs`. A component with a popup will write more, and its feature file must say what.
- With scripts off the page holds no `<style>` element. `apps/playground/tests/behaviour-seam.test.ts` checks that, and that the one the SDK adds after hydration holds exactly the rule the library's stylesheet carries in `ui-sdk`, which keeps a hidden part hidden before any script runs.
