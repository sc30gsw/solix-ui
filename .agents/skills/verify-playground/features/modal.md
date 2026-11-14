# Modal

A button named `Open modal` opens a dialog named `Settings` over the page. The page behind it is dimmed and cannot be used. The dialog holds a `Name` field, the text `Modal content` and a button that shows the text `×`, whose accessible name is `Close`. A line under the button says whether the app records the modal as opened or closed.

## Sub-features

- `modal-open` opens as a modal with a dimmed backdrop when the app asks.
- `modal-press-inside` stays open when the user presses inside it.
- `modal-escape` closes on Escape and tells the app.
- `modal-close-button` closes on the Close button and tells the app.
- `modal-press-outside` closes on a press on the backdrop and tells the app.

## How to get to it (user POV)

- Open the page and press the button named `Open modal`, below the text inputs.
- Press Escape, press `Close`, or press anywhere outside the dialog to close it.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Closed.** Open the page. Run `.agents/skills/verify-playground/scripts/drive.mjs modal`. The observation `closed: the dialog is visible` (`false`) passes.
- **Open.** Press `Open modal`. The same run observes `open: the dialog is modal` (`true`), `open: dialog background` (the body token), `open: backdrop colour` (the backdrop token) and `open: the app records` (`The app records the modal as opened.`).
- **Inside.** Press `Modal content`. The same run observes `press inside: the dialog is visible` (`true`).
- **Escape.** Press Escape. The same run observes `Escape: the dialog is visible` (`false`) and `Escape: the app records` (`The app records the modal as closed.`).
- **Close button.** Open it again and press `Close`. The same run observes `Close button: the dialog is visible` (`false`) and `Close button: the app records` (`The app records the modal as closed.`).
- **Outside.** Open it a third time and press the top left corner of the page. The same run observes `press outside: the dialog is visible` (`false`) and `press outside: the app records` (`The app records the modal as closed.`).
- **Proof.** The evidence directory holds `01-closed.png`, `02-open.png`, `03-press-inside.png`, `04-closed-with-escape.png`, `05-closed-with-close-button.png`, `06-closed-by-pressing-outside.png`, `recording.webm` and `observations.json`.

## Gotchas

- This journey needs scripts. With JavaScript off the modal stays closed, which `server-render` observes.
- The `:modal` check is what tells a real modal from a dialog that is only open. The dialog's `open` property is true for both.
- Safari has no `closedby`, so there the press outside is closed by the library's own fallback. A pass on Chromium or Firefox says nothing about it. Run the journey on `webkit`.
- The Close button shows `×`, so find it by its accessible name `Close`, not by its text.
- Pressing outside uses the point (2, 2), which the dialog never covers at the 640 by 360 viewport the journeys use.
