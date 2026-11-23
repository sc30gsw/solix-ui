# Feature map

One file per user-facing feature of the playground, from the user's point of view. The playground is one page, `/`, a gallery of the library's components: every section renders inside one `SolixProvider`, under the heading `Solix playground`. Each file names the test that pins the feature under e2e, the locators that matter, the proof, and its bug-bash charters. A feature marked `untested` has no e2e test yet; its Playwright test still runs in `vp test`, and `MIGRATION.md` lists it as todo. The page has more sections (the layout components, the Styles API, the primitives, changing props, the theme); map them when a change needs them.

| Feature | Route | Test | Status |
| --- | --- | --- | --- |
| [Text input](text-input.md) | `/` | `apps/playground/tests/text-input.e2e.ts` | tested |
| [Button](button.md) | `/` | none; Playwright: `apps/playground/tests/button.test.ts` | untested |
| [Disclosure](disclosure.md) | `/` | none; Playwright: `apps/playground/tests/disclosure.test.ts` | untested |
| [Modal](modal.md) | `/` | none; Playwright: `apps/playground/tests/modal.test.ts` | untested |
| [Colour scheme](color-scheme.md) | `/` | none; Playwright: `apps/playground/tests/color-scheme.test.ts` | untested |
