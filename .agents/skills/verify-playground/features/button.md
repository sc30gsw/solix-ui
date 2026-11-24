# Button

The buttons of `apps/playground/src/sections/ButtonSection.tsx`: `Default`, `Light`, `Overridden` with the `danger` class, and buttons inside nested providers whose `primaryColor` differs.

## Sub-features

- `Default`: the primary background, its contrast text, the small control height.
- `Overridden`: the consumer's background wins, the rest stays the library's.
- A theme's `primaryColor` rethemes the button, its hover and its light variant.
- The nearest provider's `primaryColor` paints each nested button, in that element's own colour scheme.

## How to get to it (user POV)

Open `/`; the buttons come first, under `Solix playground`.

## Driving it with e2e

`apps/playground/tests/button.test.ts` drives it, with scripts on and off; `MIGRATION.md` says whether it has moved to e2e. Locators: `screen.getByRole('button', 'Default')`, `screen.getByTestId('overridden')`; the nested buttons' names are in `nestedThemeNames` of `apps/playground/src/sections/theme-setups.ts`.

## Proof

Each button's computed background is the sentinel of the token it should read.

## Charters

```
button-themes|chromium|skeptic|On /, hover, focus and press each button, in the light and the dark scheme; report a button whose colours do not follow its provider's primary colour
```

## Gotchas

- The scripts-off half of the Playwright test cannot move: `web()` has no `javaScriptEnabled`.
