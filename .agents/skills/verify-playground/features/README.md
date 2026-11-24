# Feature map

One file per user-facing feature of the playground, from the user's point of view. The playground is one page, `/`, a gallery of the library's components: every section renders inside one `SolixProvider`, under the heading `Solix playground`. Each file names the tests that pin the feature, the targets that matter, the proof, and its bug-bash charters. Which tests have moved to e2e is `MIGRATION.md`'s to say, generated from `scripts/migration.ts`; this map keeps no copy. The page has more sections (the layout components, the Styles API, the primitives, changing props, the theme); map them when a change needs them.

| Feature | Route |
| --- | --- |
| [Text input](text-input.md) | `/` |
| [Button](button.md) | `/` |
| [Disclosure](disclosure.md) | `/` |
| [Modal](modal.md) | `/` |
| [Colour scheme](color-scheme.md) | `/` |
