# Tabs run-time writes

While a user clicks and presses keys in the section named `Tabs`, UI SDK writes one thing into the page: one `<style>` element in its own cascade layer, which hides a hidden part. It writes no inline style on a part, nothing on `<html>`, makes nothing inert, adopts no style sheet and gives no part a class. The user sees none of this directly. What the user sees is that the tabs keep the library's look.

## Sub-features

- `tabs-run-time-writes-style-element` finds one `<style>` element whose text starts `@layer ui-sdk {`, with one `!important` declaration.
- `tabs-run-time-writes-parts` finds no `style` attribute on a part but the custom property that the `display` style prop wrote on `Members panel`, and no class on a part that is neither a class of the library's stylesheet nor a stable part class.
- `tabs-run-time-writes-page` finds no `style` attribute on `<html>`, no `inert` element and no adopted style sheet.

## How to get to it (user POV)

- Open the page and scroll to the section named `Tabs`.
- Click `Overview` in `Account`, press the right arrow, End and Home, and click `Notes` in `Optional` twice.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Writes.** Run `.agents/skills/verify-playground/scripts/drive.mjs tabs-run-time-writes`. It observes the same seven values twice, `after hydration` and `after clicks and keys`: `style elements the SDK added` (1), `important declarations in them` (1), `style attributes on the parts`, `style attribute on the html element` (empty), `inert elements` (0), `adopted style sheets` (0) and `parts that carry a class the library did not give` (0).
- **Proof.** The evidence directory holds `01-tabs.png` and `02-after-keys.png`, with `recording.webm` and `observations.json`.

## Gotchas

- A part is an element that carries `data-slot`, which the SDK gives every element bound to one of its slots.
- The journey takes the layer's name and the two class prefixes from `packages/core/build-pipeline.mjs` and the class of the `display` style prop from `packages/core/src/style-prop-table.ts`, so it follows a rename.
- The observations name what the SDK writes for `Tabs`. A component with a popup will write more, and its feature file must say what.
- With scripts off the SDK adds no `<style>` element. `apps/playground/tests/behaviour-seam.test.ts` checks that, and that the library's own stylesheet keeps a hidden part hidden.
