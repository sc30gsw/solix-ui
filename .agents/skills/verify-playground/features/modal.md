# Modal

A button `Open modal` and a `Modal` labelled `Settings` holding a text input `Name`, rendered by `apps/playground/src/sections/ModalSection.tsx`. A line under the button says whether the app records the modal as opened or closed.

## Sub-features

- `Open modal` opens the dialog `Settings`, and the line reads `opened`.
- Escape and a click outside close it, and the line reads `closed`.
- Focus moves into the dialog and comes back to the button.

## How to get to it (user POV)

Open `/`; the button sits after the text inputs.

## Driving it with e2e

No e2e test yet. `apps/playground/tests/modal.test.ts` and the generated `apps/playground/tests/modal-protocol.test.ts` drive it in Playwright; `verify-modal-protocol` owns the protocol. Locators: `screen.getByRole('button', 'Open modal')`, `screen.getByRole('dialog', 'Settings')`, `screen.getByRole('textbox', 'Name')`.

## Proof

The dialog's visibility and the app's line agree after every action.

## Charters

```
modal-dismiss|chromium|skeptic|On /, open Settings and close it by Escape, by a click outside and by typing in Name first; report any moment the dialog and the line under Open modal disagree
```

## Gotchas

- The generated sequences of the protocol test have no e2e counterpart yet.
