# Disclosure

A summary that reads `Toggle` opens and closes a block of content. While it is open, the summary takes the primary colour and white text, and the content shows a coloured edge at its start. A second disclosure, `Inner`, sits inside the content.

## Sub-features

- `disclosure-closed` starts closed: the content is hidden and the summary has the surface colour.
- `disclosure-click` opens on a click of the summary and closes on the next click.
- `disclosure-keyboard` opens on Enter and closes on Space while the summary has focus.
- `disclosure-nested` keeps the closed look on `Inner` while `Toggle` is open.

## How to get to it (user POV)

- Open the page and click the summary that reads `Toggle`. It is below the buttons and below the `Follows` disclosure.
- Move focus to that summary with the Tab key and press Enter or Space.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Closed.** Open the page. Run `.agents/skills/verify-playground/scripts/drive.mjs disclosure`. The observations `closed: the details element's open property` (`false`), `closed: summary background` (`rgb(233, 236, 239)`) and `closed: content is visible` (`false`) pass.
- **Click.** Click `Toggle`, then click it again. The same run observes `open: the details element's open property` (`true`), `open: summary background` (`rgb(34, 139, 230)`), `open: summary text colour` (`rgb(255, 255, 255)`), `open: content is visible` (`true`), `open: content left border` (`rgb(34, 139, 230)`), and then the three `closed again` observations.
- **Nested.** Click `Toggle` to open it and look at `Inner`. The same run observes `inner disclosure inside the open one: summary background` (`rgb(233, 236, 239)`) and `summary text colour` (`rgb(0, 0, 0)`).
- **Keyboard.** Focus the summary, press Enter, then press Space. The same run observes the three `Enter on the focused summary` observations (open) and the three `Space on the focused summary` observations (closed).
- **Proof.** The evidence directory holds `01-closed.png`, `02-open.png`, `03-closed-again.png`, `04-inner-stays-closed.png`, `05-opened-with-enter.png`, `06-closed-with-space.png`, `recording.webm` and `observations.json`.

## Gotchas

- The closed content stays in the page, hidden by the browser. Check that it is visible or hidden, not that it exists.
- A summary is not a button to assistive technology or to Playwright's role lookup. Find it by its text.
- The journey focuses the summary directly. It does not prove that the Tab key reaches it, which differs between engines and operating system settings.
