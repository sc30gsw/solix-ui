# @solix/core

The components of Solix UI, a component library for Solid 2.0. The components are written in StyleX and ship as JSX source with their styles compiled to plain class names and one stylesheet, so a consumer needs no StyleX build setup. The headless layer is the platform itself: a disclosure is a `<details>`, a modal is a `<dialog>`.

## Build it

From the repository root, with the Vite+ CLI (`vp`). Without a global `vp`, put `pnpm exec` in front of each command.

```bash
vp install
```

```bash
vp run -r build
```

`build.mjs` runs Babel with the StyleX plugin through `build-pipeline.mjs` and writes `dist/*.jsx` (StyleX compiled away, JSX kept) and `dist/styles.css` (every rule inside `@layer solix`). A consumer imports the components from `@solix/core` and the stylesheet from `@solix/core/styles.css`.

`vp test` builds the library and the playground in `apps/playground` in production mode before it runs any test. `tests/build-output.test.ts` checks what the library build writes, `tests/stylesheet-properties.test.ts` checks the build pipeline on generated style definitions, `tests/component-contract.test.tsx` checks the root contract of every exported component, and `tests/token-contrast.test.ts` checks how each token is written and the WCAG contrast of the colour pairs in each component's `stylex.create` blocks. What a consumer sees in a browser is checked in `apps/playground/tests`.

## How it is built

- It ships JSX source under a `solid` export condition. This is the library model the Solid Vite plugin documents.
- Styles that are known at build time compile to plain class strings, so those components do not call the StyleX runtime at all.
- It compiles with its own class name prefix, `sx`, so its classes cannot collide with a consumer who also uses StyleX.
- It has no runtime dependencies. The disclosure needs no JavaScript: it opens and closes with scripts turned off.
- A style prop on `Box`, such as `mt="md"`, writes only the custom property `--sx-mt` into `style`. The class `sx-mt` in a layer nested in `solix` and ordered after the StyleX layers reads it, so a style prop beats a component default and loses to a consumer's plain class and `style`. `hiddenFrom` and `visibleFrom` sit in the same layer, so a consumer's class that sets `display` beats them too.
- The props, their CSS properties, the breakpoints and the class prefix are one table in `src/style-prop-table.ts`, which imports nothing at run time. `build.mjs` loads its build and writes the rules from it. `src/style-props.ts` turns a component's props into its classes and its `style` with `resolveStyleProps`, and exports `PolymorphicProps` and `stylePropKeys`, so a component that takes style props reuses them instead of copying them.
- A style prop drops `null` and any value that holds `;`, `{` or `}`. `tests/component-contract.test.tsx` draws such values among the generated ones and checks that none of them reaches the `style` attribute, and that `style` holds nothing but the custom properties the given style props' classes read and the consumer's own declarations.
- Each `--sx-` custom property is registered with `@property` and `inherits: false`, inside the `style-props` layer. A registration applies to the whole page, and a consumer's own unlayered registration of the same name would win. So `mt="unset"`, another CSS-wide keyword or a value the browser rejects leaves the margin unset instead of taking an ancestor `Box`'s `mt`.
- The rules come in order of shorthand depth, then breakpoint: every `m` rule, then every `mx` and `my` rule, then every `mt`, `mb`, `ml`, `mr`, `ms` and `me` rule. So `<Box p={{ base: "xs", md: "lg" }} pt={0}>` keeps its top padding at 0 at md and above.
- `mis`, `mie`, `pis` and `pie` are aliases of `ms`, `me`, `ps` and `pe`. Each pair sets the same custom property and class, so the stylesheet holds their rules once.
- Its tokens are the CSS custom properties `--solix-*` in `src/tokens.stylex.ts`. A colour token is written in OKLCH. Every other token is a length in rem, so it measures the same wherever it is used.
- The modal's backdrop reads `--solix-color-backdrop` inside `::backdrop`, which inherits it from the dialog only in a 2024 engine: Chromium 122, Firefox 120 or Safari 17.4 or later.
- With a headless component library underneath, Solid's development build reported two diagnostics that could not be fixed from this side. On `<details>` it reports none.

## Not covered

- Styles merged at run time, including a consumer passing StyleX styles as an override
- A precompiled entry for tools that do not know the `solid` condition
- Type declarations
- Installing the library from a published tarball instead of a workspace link
- A menu on the Popover API. A modal on `<dialog>` is built and checked in `apps/playground/tests/modal-protocol.test.ts`.
- A modal that is open when the page first loads. The server renders it closed, and it opens after hydration.
- `aria-invalid` on a text input. Its error look follows `:user-invalid`, and nothing mirrors that state to assistive technology yet.
- A style-prop value that holds a comment opener `/*` or an unclosed quote. It is kept, and in server-rendered markup it can hide the declarations that follow it in `style`, the consumer's included.
