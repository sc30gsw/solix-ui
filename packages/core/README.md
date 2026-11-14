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

`vp test` builds the library and the playground in `apps/playground` in production mode before it runs any test. `tests/build-output.test.ts` checks what the library build writes, `tests/stylesheet-properties.test.ts` checks the build pipeline on generated style definitions, `tests/component-contract.test.tsx` checks the root contract, the style props and the parts of every exported component, `tests/box.test.tsx` checks `Box` against fixed cases written from the requirement, and `tests/token-contrast.test.ts` checks how each token is written and the WCAG contrast of the colour pairs in each component's `stylex.create` blocks. What a consumer sees in a browser is checked in `apps/playground/tests`.

## How it is built

- It ships JSX source under a `solid` export condition. This is the library model the Solid Vite plugin documents.
- Each component's `stylex.create` block compiles to plain class strings at build time. `createParts` in `src/parts.ts` calls `stylex.attrs` at run time, the one call to the StyleX runtime in the library, because it looks up `compiled[part]` with a part name it only has at run time. No component calls `stylex.attrs` itself, and `tests/build-output.test.ts` checks that only `dist/parts.js` calls the StyleX runtime.
- Every component, `Box` included, gets the props of its root and of each other part from one `createParts` call, so it takes every style prop, `hiddenFrom` and `visibleFrom` with no code of its own. Its root carries one stable class, `solix-<Component>-root`.
- A component takes `component` when its job does not depend on one element, as `Box` and `Button` do, and renders that element through `dynamic()`. A component whose behaviour belongs to one element, such as `details`, `dialog` or `input`, does not take it and renders that element itself.
- Every component takes `classes` and `styles`, keyed by its parts, and `unstyled`. Its parts are the keys of its `stylex.create` block, and `root` is always one of them. A part's class is the library's classes, the stable class `solix-<Component>-<part>`, then `classes[part]`, with the style-prop classes and the consumer's `class` after them on the root. A part's `style` is `styles[part]`. On the root it comes after the style props' custom properties and before the consumer's `style`. A declaration whose value is `undefined` or `null` is left out. `unstyled` drops the library's classes from every part and keeps the stable class, the style props, `classes`, `styles`, `class` and `style`.
- `Modal` takes no `display`, `hiddenFrom` or `visibleFrom`. A class that sets `display` on a `<dialog>` beats the browser's own hiding of a closed dialog, so a closed modal would show on the page. Its type declares the three as `never`, and it leaves them out of its style props at run time too. It passes a consumer's `ref` the `<dialog>` along with its own.
- It compiles with its own class name prefix, `sx`, so its classes cannot collide with a consumer who also uses StyleX.
- It has no runtime dependency beyond its Solid and StyleX peers. The disclosure needs no JavaScript: it opens and closes with scripts turned off.
- A style prop, such as `mt="md"` on `Box` or any other component, writes only the custom property `--sx-mt` into `style`. The class `sx-mt` in a layer nested in `solix` and ordered after the StyleX layers reads it, so a style prop beats a component default and loses to a consumer's plain class and `style`. `hiddenFrom` and `visibleFrom` sit in the same layer, so a consumer's class that sets `display` beats them too.
- The props, their CSS properties, the breakpoints and the class prefix are one table in `src/style-prop-table.ts`, which imports nothing at run time. `build.mjs` loads its build and writes the rules from it. `src/style-props.ts` turns a component's props into its style-prop classes and custom properties, and `createParts` reads them once per component.
- A style prop drops `null` and any value that holds `;`, `{` or `}`. `tests/component-contract.test.tsx` draws such values among the generated ones and checks that none of them reaches the `style` attribute, and that `style` holds nothing but the custom properties the given style props' classes read and the consumer's own declarations.
- Each `--sx-` custom property is registered with `@property` and `inherits: false`, inside the `style-props` layer. A registration applies to the whole page, and a consumer's own unlayered registration of the same name would win. So `mt="unset"`, another CSS-wide keyword or a value the browser rejects leaves the margin unset instead of taking an ancestor `Box`'s `mt`.
- The rules come in order of shorthand depth, then breakpoint: every `m` rule, then every `mx` and `my` rule, then every `mt`, `mb`, `ml`, `mr`, `ms` and `me` rule. So `<Box p={{ base: "xs", md: "lg" }} pt={0}>` keeps its top padding at 0 at md and above.
- `mis`, `mie`, `pis` and `pie` are aliases of `ms`, `me`, `ps` and `pe`. Each pair sets the same custom property and class, so the stylesheet holds their rules once.
- Its tokens are the CSS custom properties `--solix-*` in `src/tokens.stylex.ts`. A colour token is written in OKLCH. Every other token is a length in rem, so it measures the same wherever it is used.
- The modal's backdrop reads `--solix-color-backdrop` inside `::backdrop`, which inherits it from the dialog only in a 2024 engine: Chromium 122, Firefox 120 or Safari 17.4 or later.
- With a headless component library underneath, Solid's development build reported two diagnostics that could not be fixed from this side. On `<details>` it reports none.

## Not covered

- A consumer passing StyleX styles as an override. `classes` and `styles` take plain classes and inline declarations.
- A precompiled entry for tools that do not know the `solid` condition
- Type declarations
- Installing the library from a published tarball instead of a workspace link
- A menu on the Popover API. A modal on `<dialog>` is built and checked in `apps/playground/tests/modal-protocol.test.ts`.
- A modal that is open when the page first loads. The server renders it closed, and it opens after hydration.
- `aria-invalid` on a text input. Its error look follows `:user-invalid`, and nothing mirrors that state to assistive technology yet.
- A style-prop value that holds a comment opener `/*` or an unclosed quote. It is kept, and in server-rendered markup it can hide the declarations that follow it in `style`, the consumer's included.
