---
name: verify-component-contract
description: Checks that every component the library exports puts a consumer's class and attributes on its root element next to its own classes, for a generated set of class values and attributes and not only the ones the app uses. Use when a change adds or edits a component, touches how a component handles its props, or changes Solid or the Solid plugin.
---

# Verify the component root contract

## The promise

For every exported component, the root element carries the stable class `solix-<Component>-root`, at least one of the library's own style classes, every class the consumer switched on, none the consumer switched off, and every attribute the consumer passed.

`Box` has no default style. Each value a style prop is given, at its base or at a breakpoint, puts one `sx-` class on the root and writes into `style` the one `--sx-` custom property that class reads, and nothing else. `null` and a value that holds `;`, `{` or `}` put neither. An alias puts the class and property of the prop it aliases. `hiddenFrom` and `visibleFrom` each put one class and no property. Its root is the element its `component` prop names. The consumer's own `style` keeps every declaration it sets, including a `--sx-` one. None of `Box`'s own props reaches the element as an attribute. For a fixed set of cases written from the requirement, the class and the value are exactly the ones the requirement names: `mt={16}` is `1rem`, `bg="error"` is the error token's `var()`, `c="inherit"` is `inherit`.

## The harm when it breaks

A consumer's `class` silently does nothing, or it replaces the library's classes and the component loses its style. An attribute such as `id`, `aria-label` or `disabled` never reaches the element, so a label points at nothing or a control stays enabled.

## Does your change touch it?

It does if it edits any of these:

| Covered code | What the check assumes about it |
| --- | --- |
| `packages/core/src/Box.tsx`: `Box` | Its root is a `<div>` unless `component` names another element or component. `hidden` is its boolean attribute. It has no default style. Its class array ends with the consumer's class, after the style-prop classes, and its `style` is the one `resolveStyleProps` returns. |
| `packages/core/src/style-props.ts`: `resolveStyleProps`, `stylePropKeys`, `PolymorphicProps` | `resolveStyleProps` returns the style-prop classes and a `style` with the style-prop custom properties first and the consumer's `style` after them. `stylePropKeys` names every prop `Box` leaves off the element. |
| `packages/core/src/style-prop-table.ts` | Its table is the only list of style props, and an alias row names the prop it aliases. The check generates every prop from it, with scale keys read from `packages/core/src/tokens.stylex.ts`. |
| `packages/core/src/Button.tsx`: `Button` | Its root is a `<button>`. `disabled` is one of its boolean attributes. |
| `packages/core/src/Disclosure.tsx`: `Disclosure` | Its root is a `<details>`. `open` is one of its boolean attributes. |
| `packages/core/src/Modal.tsx`: `Modal` | Its root is a `<dialog>`. `hidden` is its boolean attribute. `open` is not part of the contract: the component owns it through `opened`, and its type leaves `open` out. The heading prop is `label`, because `title` is an HTML attribute that must reach the root. |
| `packages/core/src/TextInput.tsx`: `TextInput` | Its root is the `<input>` itself, with no wrapper. `disabled` is its boolean attribute. |
| `packages/core/src/index.ts` | Every function it exports is a component. |
| `packages/core/build-pipeline.mjs` | The check renders the built files in `packages/core/dist`, which is what a consumer gets. |
| `packages/core/tests/component-contract.test.tsx` | It holds the `rootOf` table, with each component's root tag and one boolean attribute, and the fixed `Box` cases. Whether a component has a default style comes from whether its built file in `packages/core/dist` uses a class that `dist/styles.css` defines outside the `style-props` layer. It renders the built files in `packages/core/dist`. |
| `tests/support/global-setup.ts` | It runs `vp run -r build` in production mode before any test, which is what produces `packages/core/dist`. |
| `apps/playground/tests/consumer.test.ts` | It drives the `Emphasise` button and the `Follows` disclosure in a browser. |
| `apps/playground/src/App.tsx` | The `Emphasise` button switches the class `danger` and `aria-pressed` on itself, and the class `outlined` on the `Follows` disclosure. |
| `scripts/browser-engines.mjs` | It lists the engines `consumer.test.ts` runs on. |
| `tests/library-conventions.test.ts` | It requires every component's root class array to end in `props.class`, inside the JSX. |
| `vite.config.ts` | It sets the test include globs, the global setup, and the Solid plugin. |
| `solid-js`, `@solidjs/web` and `@solidjs/vite-plugin` in the catalog in `pnpm-workspace.yaml` | 2.0.0-rc.21, 2.0.0-rc.21 and 3.0.0-next.57. They decide how a `class` value becomes a class attribute. |

Last confirmed against commit `269433e`. Run `git diff 269433e -- packages/core apps/playground tests/support/global-setup.ts scripts/browser-engines.mjs tests/library-conventions.test.ts vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the check still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/component-contract.test.tsx
```

It takes about five seconds, most of it the library and app build that every test run starts with.

## The tool and why

No verifier runs on Solid components, so this is not a proof. The test uses fast-check to generate consumer props and renders each built component to a string with Solid's own server renderer, then reads the root element out of the markup. Nothing is modelled by hand, and the expected classes come from the generated input, not from a run of the component.

## What a pass covers

- 300 generated cases per component per run, a different set each run.
- Up to six distinct class names per case. Each is switched on or off, and written as part of a string, as an array item, or as an object key, all inside one nested `class` value.
- Any subset of `id`, `title`, `aria-label` and `data-state`, plus the component's boolean attribute set to true or false.
- Every component exported from `index.ts`. A component that is exported and missing from the `rootOf` table fails the first test.
- For `Box`, another 300 cases, each with up to eight style props drawn from the table, aliases included. A value is a scale key of any scale, a CSS-wide keyword, a raw length, a number, `null`, or a string that holds `;`, `{` or `}` among other text, and is written plainly or as a responsive object with any of `base`, `xs`, `sm`, `md`, `lg` and `xl`. Each case also draws `hiddenFrom` and `visibleFrom` (a breakpoint or `null`), a `component` of `div`, `section`, `article`, `span` or `a` (with `href`), a consumer class, and a consumer `style` written as an object or a string that may set a `--sx-` property itself. It renders each case twice and requires the same markup. These cases check the wiring only: how many classes and custom properties appear and that each class has its property. They do not check a class name or a value.
- Ten fixed `Box` cases that do check the class names and values: a number, a colour scale key, a CSS-wide keyword, a number for a property that is not a length, a responsive value, an alias, `hiddenFrom`, `null`, and a value with `;` or a brace.
- That `Box` with `component="a"` takes `href`, and without it does not, as a type the checker proves.

## What a pass does not cover

- A class or attribute that changes after the first render. The check renders once on the server. `apps/playground/tests/consumer.test.ts` drives the `Emphasise` button and the `Follows` disclosure in a browser. Only those two are driven. `tests/library-conventions.test.ts` holds every component to the structure that keeps `props.class` reactive on the root, which is a class array ending in `props.class` inside the JSX.
- `style` on any component other than `Box`, event handlers, `ref`, and any attribute outside the four listed.
- Which CSS property a style prop sets, and how the browser ranks a style prop against a component default, a consumer class and a consumer `style`. `packages/core/tests/build-output.test.ts` checks the rules and their layer, and `apps/playground/tests/consumer.test.ts` checks the cascade in each installed engine.
- The same class name switched on in one place and off in another.
- A style-prop value that holds a comment opener `/*` or an unclosed quote. It is kept, and `packages/core/README.md` lists what it can do to the declarations after it.
- Inner parts, including the `Modal` heading, Close button and content. A `classes` prop keyed by part name is planned, and no component has one yet.
- What the browser does with the markup. `apps/playground/tests/consumer.test.ts` covers that for the cases in the app.

## Reading a failure

- **`every component the library exports is held to the root contract` fails.** A component was added to `index.ts`, or removed. Add or remove its entry in `rootOf` in the test, with its root tag and one boolean attribute its root accepts.
- **`the contract skill names each component's root tag and boolean attribute as rootOf does` fails.** `rootOf` and the table in this file disagree. The message names the row and the missing fact. Decide which one describes the component, then make the other agree.
- **An `expect` inside the property fails.** This is a real break. fast-check prints the smallest input under `Counterexample`: the class names with how each was written, the attributes, and the boolean flag. Report it in those terms, for example "a class written as an object key and switched off still appears on the Button". Do not loosen the assertion.
- **`The rendered markup does not start with an element`.** The component now renders something before its root, such as a fragment or a wrapper. Decide whether that is intended before changing `rootElementOf`.
- To replay one failure, add the printed `seed` and `path` to the options object passed to `fc.assert`, run again, and remove them afterwards.

## When the change is intended

- A new style prop: add a row to the table in `packages/core/src/style-prop-table.ts` and nothing else. The check draws it from there. A second name for an existing prop is a row with `aliasOf`.
- A new component: add it to `rootOf` with its root tag and one boolean attribute. If its root should not take consumer attributes, that breaks the contract in `AGENTS.md`, so change that rule and its check first.
- A component's root tag or boolean attribute changes: change it in `rootOf` and in that component's row in the table above. The test fails until both agree.
- Upgrading Solid or the Solid plugin: run the check, then update the versions in the table above.
