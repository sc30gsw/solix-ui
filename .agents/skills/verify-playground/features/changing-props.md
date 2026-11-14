# Changing props

The app changes what it passes to two components while the page is open. Clicking the `Emphasise` button gives that button a new class and a new `aria-pressed` value, and gives the `Follows` disclosure a new class. Each component shows the change at once, and shows it undone on the next click.

## Sub-features

- `props-change-button` moves a class and an attribute onto a button after the first render.
- `props-change-disclosure` moves a class onto a disclosure after the first render.
- `props-change-back` removes them again.

## How to get to it (user POV)

- Open the page and click the button named `Emphasise`, below `Themed`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Before.** Open the page. Run `.agents/skills/verify-playground/scripts/drive.mjs changing-props`. The observations `before: Emphasise background` (the primary token), `before: Emphasise aria-pressed` (`false`) and `before: Follows outline` (`none`) pass.
- **Change.** Click `Emphasise`. The same run observes `after a click: Emphasise background comes from the class the app now passes` (the `.danger` background in `apps/playground/src/app.css`), `after a click: Emphasise aria-pressed` (`true`) and `after a click: Follows outline comes from the class the app now passes` (`solid`).
- **Change back.** Click `Emphasise` again. The same run observes `after a second click: Emphasise background` (the primary token) and `after a second click: Follows outline` (`none`).
- **Proof.** The evidence directory holds `01-before.png`, `02-after-click.png`, `03-after-second-click.png`, `recording.webm` and `observations.json`.

## Gotchas

- This journey needs scripts. With JavaScript off the click changes nothing.
- A component that reads a prop once when it is created passes every other journey and fails only this one.
