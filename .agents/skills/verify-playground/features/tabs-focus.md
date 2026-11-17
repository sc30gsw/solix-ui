# Tabs focus

The Tab key treats a list of tabs as one stop. It enters a list at the selected tab, which shows a focus ring in the primary token, and the next press leaves the list for the panel of that tab, which can take focus itself. The press after that reaches the selected tab of the next list.

## Sub-features

- `tabs-focus-enters` puts focus on the selected tab of `Account` when the user comes back to the list with Tab.
- `tabs-focus-ring` shows a solid outline in the primary token on that tab.
- `tabs-focus-leaves` moves focus to the panel of the selected tab on the next Tab.
- `tabs-focus-next-list` moves focus to the selected tab of `Manual vertical` on the Tab after that.

## How to get to it (user POV)

- Click `Two` in `Manual vertical` and `Security` in `Account`.
- Press Shift+Tab, then Tab three times.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Focus.** Run `.agents/skills/verify-playground/scripts/drive.mjs tabs-focus`. It observes `Tab into the list: focused tab` (`Security`), `focus ring: outline style` (`solid`), `focus ring: outline colour` (the primary token), `Tab out of the list: focused element` (`Security panel`) and `Tab into the next list: focused tab` (`Two`).
- **Proof.** The evidence directory holds `01-focus-ring.png`, `02-focus-panel.png` and `03-focus-next-list.png`, with `recording.webm` and `observations.json`.

## Gotchas

- A panel with no focusable content is itself a tab stop, so Tab from a list reaches its panel before the next list.
- A focus ring shows only for keyboard focus, which is why the journey leaves the list and comes back.
- WebKit starts Tab and Shift+Tab from the node a click landed on when that node is inside the focused element. A click on a tab lands on its label, and the tab before that label is the tab itself, so Shift+Tab would find the tab that already has focus and leave focus where it is. After such a press, `Tabs.Tab` focuses itself again when Shift+Tab goes down, before the browser moves focus, so the search starts from the tab. A click fires no focus or blur event of its own.
