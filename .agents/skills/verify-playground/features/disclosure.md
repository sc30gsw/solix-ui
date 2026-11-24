# Disclosure

A `Disclosure` labelled `Toggle` holding `Hidden content` and a nested one labelled `Inner`, rendered by `apps/playground/src/sections/DisclosureSection.tsx`.

## Sub-features

- A click on the summary `Toggle` opens it, and another closes it.
- The nested `Inner` opens on its own.
- The open summary takes the primary background.

## How to get to it (user POV)

Open `/`; the disclosure sits after the buttons.

## Driving it with e2e

`apps/playground/tests/disclosure.test.ts` drives it, with scripts on and off; `MIGRATION.md` says whether it has moved to e2e. Targets: the summary has no role in the tree, so it is `{ text: "Toggle" }`, as `apps/playground/tests/targets.e2e.ts` holds; the content by `Hidden content`.

## Proof

The content shows after the click and hides after the second, and `Inner`'s content shows only once `Inner` is opened.

## Charters

```
disclosure-toggle|chromium|skeptic|On /, open and close Toggle and Inner by mouse and by keyboard in every order; report content that shows when its disclosure is closed or hides when it is open
```

## Gotchas

- It is a native `<details>`, so it opens with scripts off too; that check stays in the Playwright suite.
