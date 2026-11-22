---
name: verify-modal-protocol
description: Checks that the Modal's open and closed state stays in agreement with the user's actions, for generated sequences of presses, keys and typing and not only the sequences the playground's other tests use, and that its light-dismiss fallback works alone. Use when a change edits Modal, light-dismiss, how the app wires `opened` and `onClose`, or Solid, the Solid plugin or Playwright.
---

# Verify the modal protocol

## The promise

For any sequence of user actions, the `<dialog>` is open exactly when the model of the actions says it is. While it is open it is a real modal (`:modal`), the page behind it cannot take focus, and focus is never on an element of that page. When it is closed the page behind can take focus again. Whatever closed it, `onClose` ran, so the app's own record agrees. What the user typed in it is still there after it closes and opens again.

The model has two facts, open and the typed text. Opening is only possible while closed. Escape closes. A press outside closes. The Close button closes. A press inside, Tab, Shift+Tab and typing leave it open.

## The harm when it breaks

The page is usable under a modal, or stays unusable after it closed. The app thinks the modal is open while it is shut, so the next press of Open does nothing. A press inside the dialog dismisses it and loses the user's input.

## Does your change touch it?

It does if it edits any of these:

| Covered code | What the check assumes about it |
| --- | --- |
| `packages/core/src/Modal.tsx`: `Modal` | Its `opened` prop drives `showModal()` and `close()` from one effect. A consumer's `onClose` reaches the `<dialog>`. It has one `<form method="dialog">` button named `Close`. |
| `packages/core/src/light-dismiss.ts` | The fallback runs only where `closedBy` is missing. It closes when the press and the release are both outside the dialog's box. |
| `apps/playground/src/App.tsx` and `apps/playground/src/sections` | The page has one `<dialog>`, a button named `Open modal`, a first button directly under `main`, a text input named `Name` inside the dialog, the text `Modal content`, and a paragraph that starts `The app records the modal as` and ends `opened.` or `closed.` |
| `apps/playground/tests/modal-protocol.test.ts` | It runs the commands against the built app in each installed engine and holds the model of the two facts. It runs the fixed sequences in `everyActionInEachRun` before the generated ones. |
| `tests/support` | It runs `vp run -r build` in production mode before any test, which builds the library and the app, and then starts the built app once and gives the test its URL as `playgroundUrl`. |
| `scripts/browser-engines.mjs` | It lists the engines the test runs on, and which of them are installed. |
| `vite.config.ts` | It sets the test include globs and the global setup. |
| `playwright`, `solid-js`, `@solidjs/signals`, `@solidjs/web`, `@solidjs/compiler`, `@solidjs/vite-plugin` and `fast-check` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `699cdd3`. Run `git diff 699cdd3 -- packages/core apps/playground tests/support scripts/browser-engines.mjs vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the check still describe the code at the new commit.

## Run it

```bash
vp test apps/playground/tests/modal-protocol.test.ts
```

It takes about fifteen seconds per installed engine, most of it the library and app build that every test run starts with. With `CI` set, all three engines must be installed.

## The tool and why

No model checker runs on a Solid component, so this is not a proof. The test uses fast-check's model-based commands. It runs three fixed sequences first, then sequences of up to ten user actions that fast-check generates, each against the built app in a real browser engine, and after every action compares the page with the model. A failing generated sequence is shrunk to the shortest one that still fails, and a failing fixed sequence is reported whole. Nothing about the modal is modelled by hand beyond the two facts above.

## What a pass covers

- Three fixed sequences per engine per run, the same each run, so every action runs in every run: open and press outside, open and press Escape, and open, press inside, Tab, Shift+Tab, type `ab`, press Close and open again.
- Then 15 generated sequences per engine per run, a different set each run. Each sequence starts from a fresh page load.
- Seven actions: press Open modal, Escape, press outside, press inside, Close button, Tab and Shift+Tab, typing up to six letters in the Name field.
- The fallback alone: with `closedBy` removed from the prototype and the attribute removed from the element, a press outside closes it, a press inside does not, and a drag that starts inside and ends outside does not.

## What a pass does not cover

- A modal that is open at first load. The server renders it closed.
- Two modals open together, or a modal opened from inside another.
- Touch, the mobile back gesture, and Escape pressed while a field inside the dialog consumes it.
- Focus returning to the button that opened the dialog. Safari does not focus a button on press, so the check does not require it.
- Whether the fallback runs in Safari. The fallback test removes the native feature in whichever engine runs it. Only a run on `webkit` shows that Safari takes the fallback path.
- What the dialog looks like. `apps/storybook/src/Modal.stories.tsx` shows it to a person, and no check compares its look until Storybook's screenshot comparisons land.

## Reading a failure

- **An `expect` fails after `Counterexample`.** This is a real break unless it is listed below. fast-check prints a generated sequence shrunk to the shortest that still fails, such as `[press the Open modal button,press outside the dialog /*replayPath="BF:C"*/]`, and a fixed sequence whole and in double brackets, such as `[[press the Open modal button,press outside the dialog]]`. The message names the observation, such as `the dialog's open property: expected true to be false`. Report it in those terms. Do not loosen the assertion.
- **`focus is on the page behind the open dialog`.** Tab and Shift+Tab may leave the dialog for the browser's own controls, so `document.body` is allowed. An element of the page behind is not.
- **A timeout in `page.goto` or a click.** The server did not start or the page is not the one in the table. Run `vp run -r build`, then the test.
- To replay one failure, add the printed `seed` and `path` to the parameters passed to `assertProperty`, run again, and remove them afterwards.

## When the change is intended

- A new way to close the modal: add a command class to `steps`, with its precondition and the model change, and a fixed sequence to `everyActionInEachRun` that opens the modal and closes it that way.
- A new element in the dialog that takes focus: keep the focus assertion as it is. It only forbids focus on the page behind.
- Upgrading Solid, Playwright or fast-check: change the versions in the catalog in `pnpm-workspace.yaml`, then run the check.
- Mutation check after editing the skill's covered code: remove `closedby="any"` from `Modal.tsx` on Chromium and run the test. It must fail on every run with `[[press the Open modal button,press outside the dialog]]`, the first fixed sequence. Restore the attribute afterwards.
