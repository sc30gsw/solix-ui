# Tabs keyboard

With the keyboard alone a user moves between the tabs of a list and selects one. Arrow keys follow the list's orientation and the text direction, Home and End go to the first and last tab that is not disabled, and a disabled tab is passed over. In a list that selects on focus the panel changes as focus moves. In `Manual vertical` only Enter or Space selects.

## Sub-features

- `tabs-keyboard-horizontal` moves focus and selection along `Account`, wraps at its ends, and steps over the disabled `Billing`.
- `tabs-keyboard-direction` swaps the left and right arrows in `Right to left`, and steps over the disabled `East`.
- `tabs-keyboard-vertical` uses the up and down arrows in `Vertical`, ignores left and right, and steps over the disabled `Delta` at its end.
- `tabs-keyboard-manual` moves focus without selecting in `Manual vertical`, selects on Enter or Space, and stops at the ends of a list that does not wrap.
- `tabs-keyboard-disabled-ends` goes to the first and last enabled tab of `Optional` on Home and End, and wraps past the disabled tabs at both ends.

## How to get to it (user POV)

- Open the page and press Tab until focus is on a tab in the section named `Tabs`, or click a tab there.
- Press an arrow key, Home, End, Enter or Space.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Keys.** Run `.agents/skills/verify-playground/scripts/drive.mjs tabs-keyboard`. For each row of `keyboardTable` in `apps/playground/tests/support/tabs.ts` it starts at the row's tab, presses the row's keys, and prints four observations named for the row, such as `Account, from Overview, ArrowRight: focused tab` (`Members`), `selected tab`, `panels shown` and `tab stops`.
- **Proof.** The evidence directory holds `01-tabs.png`, then one `keys-<row>.png` per row of the table, each of the set of tabs the row drives, with `recording.webm` and `observations.json`.

## Gotchas

- A row starts by clicking its starting tab, or by focusing it when it is already selected, so a row of `Optional` starts where it says and not with no tab selected. `startAt` in the support file does this.
- A list has one tab stop: its selected tab, or its first enabled tab while none is selected. Arrow keys in `Manual vertical` move focus but not the tab stop, so a row there that ends without Enter or Space names the starting tab as the tab stop.
- A disabled tab is natively disabled. A click on it moves focus to the page body in Chromium, so a row never starts from one.
- The table is written by hand. A row that disagrees with the model fails `apps/playground/tests/tabs-model.test.ts` before any browser opens.
