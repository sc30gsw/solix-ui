# Text input

Three `TextInput`s, each named by its `aria-label`, rendered by `apps/playground/src/sections/TextInputSection.tsx`.

## Sub-features

- `Email`, an email field with the placeholder `Email`: the library's border, height, radius, background and text colour.
- `Overridden input`, which carries the playground's `danger` class: the consumer's background beats the library's, and the height stays the library's.
- The error border, which shows only once the user leaves `Email` holding an invalid address, and goes once the address is valid.
- The primary border while `Email` has keyboard focus.
- `Disabled input`: dimmed, a not-allowed cursor, and no typing.

## How to get to it (user POV)

Open `/` and scroll to the inputs below the disclosure. No account.

## Driving it with e2e

`apps/playground/tests/text-input.e2e.ts` pins every sub-feature in each engine. Locators: `screen.getByRole('textbox', 'Email')`, `screen.getByRole('textbox', 'Overridden input')`, `screen.getByRole('textbox', 'Disabled input')`, and `screen.getByRole('button', 'Default')`, the first button, which takes focus to commit a value. Styles: `styleOf(labelled('Email'), 'border-top-color')` against `expected('--solix-color-error')`, and the other tokens the test names.

## Proof

`Email`'s computed `border-top-color` is the error token's sentinel after an invalid address is committed, and the border token's after a valid one, read from the hydrated page with nothing in the console. The input keeps nothing beyond the page.

## Charters

```
text-input-values|chromium|skeptic|On /, type into Email an invalid address, a valid one, an empty value and a very long one, moving focus away after each; report any border that disagrees with whether the value is a valid address
```

## Gotchas

- The error border waits for `:user-invalid`, so it does not show while the user types; a test must move focus away, as a user does, before it reads the border.
- `Email`'s border under keyboard focus needs a key press after the focus, since `:focus-visible` follows the keyboard.
- With scripts off the input keeps the library's border; that check stays in the Playwright suite.
