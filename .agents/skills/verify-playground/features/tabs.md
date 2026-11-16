# Tabs

A section named `Tabs` holds eight sets of tabs. `Account` is a row of four tabs, `Overview`, `Billing`, `Members` and `Security`, with `Billing` disabled and `Overview` selected; the selected tab has the primary token as its text colour and an edge in the primary token below it, and its panel shows under the row. `Manual vertical` is a column of `One`, `Two` and `Three`, where arrow keys move focus without selecting and do not wrap; the selected tab's edge is at its inline end, beside the list's own edge, not below it. `Vertical` is a column of `Alpha`, `Beta`, `Gamma` and a disabled `Delta` that selects as focus moves and wraps. `Optional` starts with no tab selected, between two disabled tabs, and a click on its selected tab selects none. `Right to left` is a row that runs from the right, `North`, a disabled `East`, `South` and `West`. `Controlled` holds its value in the app, and its `Locked` tab refuses every press. `Held` shows `Kept` whatever the user presses, and counts each request; of its two other panels, which never show, the app gives `Styled panel` a `display` through `style` and `Classed panel` one through a class. `Generated` shows one tab for each value typed into `Tab values`.

## Sub-features

- `tabs-click` selects a tab on a click and shows its panel alone.
- `tabs-arrows` moves focus and selection with the arrow keys and End, wrapping at the ends, and steps over a disabled tab.
- `tabs-manual` moves focus alone in the vertical list, selects on Enter or Space, and stops at the ends.
- `tabs-none` selects none on a click of the selected tab where the app allows it.
- `tabs-refused` leaves the selection alone when a tab's own click handler prevents the default.

## How to get to it (user POV)

- Open the page and scroll to the section named `Tabs`, below the `Styles API` section.
- Click a tab, or move focus to a tab list with the Tab key and press an arrow key, Home or End.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Click.** Run `.agents/skills/verify-playground/scripts/drive.mjs tabs`. The five `at first` observations pass, and after a click on `Members` the observations `selected tab` (`Members`), `panels shown` (`Members panel`) and `the tab names its panel` (`account-panel-members`).
- **Arrows.** Click `Overview` and press the right arrow, End, and the right arrow again. The same run observes `right arrow from Overview` (focus and selection on `Members`, past the disabled `Billing`), `End` (`Security`) and `right arrow from the last tab` (`Overview`).
- **Manual.** In `Manual vertical`, click `Two`, press the down arrow, Enter, and the down arrow again. The same run observes focus on `Three` with `Two` still selected, then `Three` selected with its edge drawn at its inline end and not under it, then focus still on `Three`.
- **None.** In `Optional`, click `Notes` twice. The same run observes `nothing is selected at first`, the `Notes panel` after the first click, and no selected tab and no panel after the second.
- **Refused.** In `Controlled`, click `Locked`. The same run observes `Drafts` still selected and one refused press.
- **Proof.** The evidence directory holds `01-tabs.png` to `11-locked.png`, `recording.webm` and `observations.json`.

## Gotchas

- A tab's accessible name includes its sections, so `Overview` is named `1 Overview`. Find a tab by the text of its label inside its list, as `tabNamed` in `apps/playground/tests/support/tabs.ts` does.
- An unselected panel stays in the page, hidden. Check which panels are displayed, not which exist.
- A click on a tab that is already selected in `Optional` selects none. To start from a tab, use `startAt` in the same file, which focuses the tab when it is already selected.
- The journey runs in one engine at a time, and presses a few keys. `tabs-keyboard` drives the whole keyboard table, and `apps/playground/tests/tabs.test.ts` presses every key from every state in every engine.
