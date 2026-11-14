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

`vp test` builds the library and the playground in `apps/playground` in production mode before it runs any test. `tests/build-output.test.ts` checks what the library build writes, `tests/stylesheet-properties.test.ts` checks the build pipeline on generated style definitions, and `tests/component-contract.test.tsx` checks the root contract of every exported component. What a consumer sees in a browser is checked in `apps/playground/tests`.

## How it is built

- It ships JSX source under a `solid` export condition. This is the library model the Solid Vite plugin documents.
- Styles that are known at build time compile to plain class strings, so those components do not call the StyleX runtime at all.
- It compiles with its own class name prefix, `sx`, so its classes cannot collide with a consumer who also uses StyleX.
- It has no runtime dependencies. The disclosure needs no JavaScript: it opens and closes with scripts turned off.
- With a headless component library underneath, Solid's development build reported two diagnostics that could not be fixed from this side. On `<details>` it reports none.

## Not covered

- Styles merged at run time, including a consumer passing StyleX styles as an override
- A precompiled entry for tools that do not know the `solid` condition
- Type declarations
- Installing the library from a published tarball instead of a workspace link
- A menu on the Popover API. A modal on `<dialog>` is built and checked in `apps/playground/tests/modal-protocol.test.ts`.
- A modal that is open when the page first loads. The server renders it closed, and it opens after hydration.
- `aria-invalid` on a text input. Its error look follows `:user-invalid`, and nothing mirrors that state to assistive technology yet.
