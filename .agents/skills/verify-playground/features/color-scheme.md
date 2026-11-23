# Colour scheme

The colour-scheme section of `apps/playground/src/sections/ColorSchemeSection.tsx`: buttons that set, toggle and clear the page's scheme, outputs that show the chosen scheme, and a section whose provider forces the dark scheme. The names are in `apps/playground/src/sections/color-scheme-setups.ts`.

## Sub-features

- The page follows the system's scheme until the user picks one, and keeps the pick in local storage.
- Set, toggle and clear change `data-color-scheme` on `<html>` and what the outputs read.
- The forced section stays dark, and its buttons change nothing.

## How to get to it (user POV)

Open `/` and scroll to the colour-scheme section.

## Driving it with e2e

No e2e test yet. `apps/playground/tests/color-scheme.test.ts` drives it in Playwright, with scripts on and off and a second page of the same origin. `browser.emulateMedia({ colorScheme })` sets the system's scheme; `browser.newTab()` opens the second page. Read names from `schemeButtons`, `schemeTexts` and `forcedSection`, never as strings.

## Proof

`<html>`'s `data-color-scheme`, the outputs, and the value under `playgroundColorSchemeKey` in local storage agree after each button.

## Charters

```
color-scheme-picks|chromium|skeptic|On /, set, toggle and clear the scheme in every order, with the system in light and in dark; report a page whose scheme, outputs or stored value disagree
```

## Gotchas

- The Playwright test blocks the client script to check the pre-paint script alone; e2e has no `javaScriptEnabled`, so a route that aborts the client script is the nearest port.
