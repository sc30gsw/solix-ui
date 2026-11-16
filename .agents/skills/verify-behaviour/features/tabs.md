# Tabs

With the keyboard alone a user moves between the tabs of a list, selects one, and reaches its panel. Arrow keys follow the list's orientation and the text direction, Home and End go to the first and last tab that is not disabled, and a disabled tab is passed over. In a list that selects on focus the panel changes as focus moves. In a manual list only Enter or Space selects.

## Sub-features

- `tabs-arrows` moves focus and selection along a horizontal list, wraps at its ends, and steps over the disabled `Billing`.
- `tabs-direction` swaps the arrow keys in a right-to-left list.
- `tabs-vertical` uses the up and down arrows in a vertical list and ignores left and right.
- `tabs-manual` moves focus without selecting, selects on Enter or Space, and stops at the ends of a list that does not wrap.
- `tabs-disabled-ends` goes to the first and last enabled tab on Home and End, and wraps past disabled tabs at both ends.
- `tabs-focus` enters a list at its selected tab, shows a focus ring, and leaves for the panel.
- `tabs-run-time-writes` leaves the page with one SDK style element, and no inline style, `inert` or adopted sheet from the SDK.

## How to get to it (user POV)

- Open the page and press Tab until focus is on a tab in the section named `Tabs`, or click a tab there.
- Press an arrow key, Home, End, Enter or Space.

## Driving it with drive.mjs

Preconditions:

- `.agents/skills/verify-playground/scripts/doctor.sh` exits 0.

- **Keys.** Run `.agents/skills/verify-behaviour/scripts/drive.mjs tabs`. For each row of `keyboardTable` it prints four observations named for the row, such as `Account, from Overview, ArrowRight: focused tab` (`Members`), `selected tab`, `panels shown` and `tab stops`.
- **Focus.** The same run observes `Tab into the list: focused tab` (`Settings`), `focus ring: outline style` (`solid`), `focus ring: outline colour` (the primary token), `Tab out of the list: focused element` (`Settings panel`) and `Tab into the next list: focused tab` (`Two`).
- **Run-time writes.** The same run observes, `after hydration` and `after every key`: one style element from the SDK, one `!important` in it, no `style` attribute on a part but the `--sx-display:flex` a style prop wrote on `Members panel`, none on `<html>`, no `inert` element, no adopted style sheet, and no class the library did not give.
- **Proof.** The evidence directory holds `01-tabs.png`, one `keys-<row>.png` per row of the table, `focus-ring.png`, `focus-panel.png` and `focus-next-list.png`, each numbered, with `recording.webm` and `observations.json`.

## Gotchas

- A panel with no focusable content is itself a tab stop, so Tab from a list reaches its panel before the next list.
- A list has one tab stop: its selected tab, or its first enabled tab while none is selected. Arrow keys in a manual list move focus but not the tab stop.
- A disabled tab is natively disabled. A click on it moves focus to the page body in Chromium, so start a row from an enabled tab.
- The observations name what the SDK writes for `Tabs`. A component with a popup will write more, and its feature file must say what.
