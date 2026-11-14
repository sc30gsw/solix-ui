# Server render

The server sends the page already rendered, and the stylesheet styles it before any script runs. A user with JavaScript turned off sees the styled buttons.

## Sub-features

- `server-markup` has the buttons in the HTML response itself.
- `styled-without-script` shows the default button with the library's style when JavaScript is off.
- `disclosure-without-script` opens the disclosure on a click when JavaScript is off.
- `modal-and-input-without-script` leaves the modal closed and styles the Email input when JavaScript is off.

## How to get to it (user POV)

- Request the page address directly, or open it in a browser with JavaScript turned off.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Markup.** Request the page. Run `.agents/skills/verify-playground/scripts/drive.mjs server-render`. The observations `the response already contains the Default button` and `the response already contains the Toggle summary` pass.
- **Styled with scripts off.** Open the page with JavaScript off. The same run observes `with JavaScript off the Default button is styled` (the primary token).
- **Disclosure with scripts off.** Still with JavaScript off, click `Toggle`. The same run observes `with JavaScript off the disclosure opens on a click` (`true`) and `with JavaScript off the open summary takes the primary colour` (the primary token).
- **Modal and Email with scripts off.** Still with JavaScript off, look at the dialog and the `Email` input. The same run observes `with JavaScript off the modal is not showing` (`false`) and `with JavaScript off the Email input is styled` (the border token).
- **Console.** The same run ends with `console errors and warnings` (an empty string), which every journey records.
- **Proof.** The evidence directory holds `response.html` with the bytes the server sent, `01-javascript-off.png`, `02-disclosure-opens-without-javascript.png`, `recording.webm` and `observations.json`.

## Gotchas

- The recording for this journey shows the page with scripts on. The screenshot `01-javascript-off.png` is the one taken with scripts off.
