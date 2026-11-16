# Tabs run-time writes

While a user clicks and presses keys in the section named `Tabs`, UI SDK writes styles into the page only in its own cascade layer, among them the rule that hides a hidden part, which the library's stylesheet also carries. Beyond the attributes of each part, it writes no inline style on a part, nothing on `<html>`, makes nothing inert and gives no part a class. The user sees none of this directly. What the user sees is that the tabs keep the library's look.

## Sub-features

- `tabs-run-time-writes-style-element` finds no rule that the SDK added, in a `<style>` element or an adopted style sheet, outside its layer, no `!important` declaration on the page outside that layer, and the SDK's hidden rule among the styles it added.
- `tabs-run-time-writes-parts` finds no `style` attribute on a part but the custom property that the `display` style prop wrote on `Members panel` and the `style` the app gives `Styled panel`, and no class on a part that is neither a class of the library's stylesheet, a stable part class nor the class the app gives `Classed panel`.
- `tabs-run-time-writes-page` finds no `style` attribute on `<html>` and no `inert` element.

## How to get to it (user POV)

- Open the page and scroll to the section named `Tabs`.
- Click `Overview` in `Account`, press the right arrow, End and Home, and click `Notes` in `Optional` twice.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Writes.** Run `.agents/skills/verify-playground/scripts/drive.mjs tabs-run-time-writes`. It observes the same seven values twice, `after hydration` and `after clicks and keys`: `rules the SDK added outside its layer` (none), `important declarations outside the SDK's layer` (none), `the SDK added the hidden rule the library's stylesheet carries` (true), `style attributes on the parts`, `style attribute on the html element` (empty), `inert elements` (0) and `parts that carry a class neither the library nor the app gave` (0).
- **Proof.** The evidence directory holds `01-tabs.png` and `02-after-keys.png`, with `recording.webm` and `observations.json`.

## Gotchas

- A part is an element that carries `data-slot`, which the SDK gives every element bound to one of its slots.
- The journey takes the layer's name and the library's class prefix from `packages/core/build-pipeline.mjs`, the stable class prefix from `packages/core/src/stable-class.ts`, the class of the `display` style prop from `packages/core/src/style-prop-table.ts` and what the app gives the two panels of `Held` from `apps/playground/src/sections/tabs-setups.ts`, so it follows a rename.
- The style observations hold for every rule the SDK adds, whichever component adds it. The part, `<html>` and inert observations name what the SDK writes for `Tabs`; a component with a popup writes more there, and its feature file must say what.
- With scripts off the page holds no `<style>` element. `apps/playground/tests/behaviour-seam.test.ts` checks that, and that the styles the SDK adds after hydration hold the rule the library's stylesheet carries in `ui-sdk`, which keeps a hidden part hidden before any script runs.
