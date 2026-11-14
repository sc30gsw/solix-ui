---
name: verify-component-contract
description: Checks that every component the library exports puts a consumer's class and attributes on its root element next to its own classes, takes every style prop on its root, and puts `classes`, `styles` and `unstyled` on exactly the parts they name, for a generated set of class values, attributes, style props and part overrides and not only the ones the app uses. Use when a change adds or edits a component, touches how a component handles its props, or changes Solid or the Solid plugin.
---

# Verify the component root contract

## The promise

For every exported component, the root element carries the stable class `solix-<Component>-root` and no other component's root class, every class the consumer switched on, none the consumer switched off, and every attribute the consumer passed. Without `unstyled`, the root of a component with a default style also carries at least one of the library's own style classes, and the root of a component without one, such as `Box`, carries none.

Every component also takes `classes`, `styles` and `unstyled`, and its parts are the elements that carry a stable class `solix-<Component>-<part>` in its rendered markup. A class that `classes` names for a part is on exactly that part's element and on no other, after the library's classes and the part's stable class, and on the root the consumer's `class` comes after `classes.root`. The declarations that `styles` names for a part are exactly that part's `style`, less any whose value is `undefined` or `null`, and on the root the consumer's `style` comes after `styles.root`, so it wins. With `unstyled`, no element carries a class that `dist/styles.css` defines outside the `style-props` layer, every part keeps its stable class on the same element, and every consumer class stays where it was. Every component takes every style prop, `hiddenFrom` and `visibleFrom` on its root, as `Box` does, with `unstyled` or without, except a prop its type declares `never`: `Modal` takes no `display`, `hiddenFrom` or `visibleFrom`, and none of them reaches its root as a class or a property.

`Box` has no default style. Each value a style prop is given, at its base or at a breakpoint, puts one `sx-` class on the root and writes into `style` the one `--sx-` custom property that class reads, and nothing else. `null` and a value that holds `;`, `{` or `}` put neither. An alias puts the class and property of the prop it aliases. `hiddenFrom` and `visibleFrom` each put one class and no property. Its root is the element its `component` prop names. The consumer's own `style` keeps every declaration it sets, including a `--sx-` one. None of `Box`'s own props reaches the element as an attribute. For a fixed set of cases written from the requirement, the class and the value are exactly the ones the requirement names: `mt={16}` is `1rem`, `bg="error"` is the error token's `var()`, `c="inherit"` is `inherit`.

## The harm when it breaks

A consumer's `class` silently does nothing, or it replaces the library's classes and the component loses its style. An attribute such as `id`, `aria-label` or `disabled` never reaches the element, so a label points at nothing or a control stays enabled. A class or declaration meant for one part lands on another, `unstyled` leaves the library's look in place or takes the stable classes a consumer's stylesheet targets, a style prop on a component other than `Box` does nothing, or a closed `Modal` that is given `display` shows on the page.

## Does your change touch it?

It does if it edits any of these:

| Covered code | What the check assumes about it |
| --- | --- |
| `packages/core/src/Box.tsx`: `Box` | Its root is a `<div>` unless `component` names another element or component. `hidden` is its boolean attribute. It has no default style: its `stylex.create` block is `{ root: {} }`, so its one part is its root, and it takes `classes`, `styles` and `unstyled` like every other component. |
| `packages/core/src/style-props.ts`: `resolveStyleProps`, `stylePropKeys`, `withConsumerStyle`, `ElementProps`, `PolymorphicProps` | `resolveStyleProps` returns the style-prop classes and their custom properties. `withConsumerStyle` puts a consumer's `style`, written as an object or a string, after a component's own declarations. When it writes the component's declarations out as a string, it leaves out one whose value is `undefined` or `null`. `stylePropKeys` names every style prop. `PolymorphicProps` is `ElementProps` with a `component` prop. |
| `packages/core/src/style-prop-table.ts`: `displayPropNames` | Its table is the only list of style props, and an alias row names the prop it aliases. The check generates every prop from it, with scale keys read from `packages/core/src/tokens.stylex.ts`. `displayPropNames` names the props that set `display`, which `Modal` leaves out. |
| `packages/core/src/parts.ts`: `createParts`, `PartProps`, `partPropKeys`, `rootPart` | `createParts` returns `root`, the root's props, and `part(name)`, the class and style of another part, each read through a getter. A part's class is the library's classes from `stylex.attrs`, unless `unstyled`, then the stable class `solix-<Component>-<part>`, then `classes[part]`, and on the root the style-prop classes and the consumer's `class` after them. Its `style` is `styles[part]`, and on the root the style props' custom properties come before it and the consumer's `style` after it. `root` holds every other prop but the component's own keys, which take no part in the style props either. `partPropKeys` names `classes`, `styles` and `unstyled`, and the check reads it and `rootPart` from the build. |
| `packages/core/src/Button.tsx`: `Button` | Its root is a `<button>` unless `component` names another element or component. `disabled` is one of its boolean attributes. |
| `packages/core/src/Disclosure.tsx`: `Disclosure` | Its root is a `<details>`. `open` is one of its boolean attributes. |
| `packages/core/src/Modal.tsx`: `Modal` | Its root is a `<dialog>`. `hidden` is its boolean attribute. `open` is not part of the contract: the component owns it through `opened`, and its type declares `open` as `never`. So are `display`, `hiddenFrom` and `visibleFrom`, which it leaves out of its style props. It passes a consumer's `ref` the `<dialog>` along with its own. The heading prop is `label`, because `title` is an HTML attribute that must reach the root. |
| `packages/core/src/TextInput.tsx`: `TextInput` | Its root is the `<input>` itself, with no wrapper. `disabled` is its boolean attribute. A consumer's `type` replaces its `text`. |
| `packages/core/src/index.ts` | Every function it exports is a component. |
| `packages/core/build-pipeline.mjs` | The check renders the built files in `packages/core/dist`, which is what a consumer gets. |
| `packages/core/tests/component-contract.test.tsx` | It holds the `rootOf` table, with each component's root tag, one boolean attribute, and whether it takes `display`, which the type checker holds to the component's own props type. Whether a component has a default style comes from whether its built file in `packages/core/dist` uses a class that `dist/styles.css` defines outside the `style-props` layer. A component's parts come from the stable classes in its markup when it is rendered with no props, and must be the root and the keys of the compiled `styles` object in its built file. Every component takes `classes`, `styles` and `unstyled`. It renders the built files in `packages/core/dist`. Its generated values come from `packages/core/tests/arbitraries.ts`, and it reads markup with `packages/core/tests/markup.ts` and renders with `packages/core/tests/built-library.ts`. |
| `packages/core/tests/box.test.tsx` | It holds the fixed `Box` cases and the check that `Box` takes the attributes of the element its `component` prop names. |
| `tests/support/global-setup.ts` | It runs `vp run -r build` in production mode before any test, which is what produces `packages/core/dist`. |
| `apps/playground/tests/consumer.test.ts` | It drives the `Emphasise` button and the `Follows` disclosure in a browser, checks that each component's `ref` receives its root element, and compares the `Unstyled` button with the `Plain button` the library does not style. |
| `apps/playground/src/App.tsx` | The `Emphasise` button switches the class `danger` and `aria-pressed` on itself, the class `outlined` on the `Follows` disclosure, and the class `danger` on its summary through `classes.summary`. One of each component takes `ref={refOf("<Component>")}`, which marks the node it receives with `data-ref`. |
| `scripts/browser-engines.mjs` | It lists the engines `consumer.test.ts` runs on. |
| `scripts/expected-values.ts`: `lookOf` | It reads the background, colour, border, radius, height and padding that `consumer.test.ts` compares between the `Unstyled` button and the `Plain button`. |
| `tests/library-conventions.test.ts` | It requires every component to type its props as `ElementProps` or `PolymorphicProps` with `PartProps<typeof styles>`, to call `createParts` once, to spread `root` on the element it returns, which is the element `ElementProps` names or the `dynamic()` element `component` picks, to spread each `part("<name>")` on an element, inline or through a `const`, and to write no `class` or `style` by hand. |
| `vite.config.ts` | It sets the test include globs, the global setup, and the Solid plugin. |
| `solid-js`, `@solidjs/web` and `@solidjs/vite-plugin` in the catalog in `pnpm-workspace.yaml` | 2.0.0-rc.21, 2.0.0-rc.21 and 3.0.0-next.57. They decide how a `class` value becomes a class attribute. |

Last confirmed against commit `269433e`. Run `git diff 269433e -- packages/core apps/playground tests/support/global-setup.ts scripts/browser-engines.mjs tests/library-conventions.test.ts vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the check still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/component-contract.test.tsx packages/core/tests/box.test.tsx
```

It takes about five seconds, most of it the library and app build that every test run starts with.

## The tool and why

No verifier runs on Solid components, so this is not a proof. The test uses fast-check to generate consumer props and renders each built component to a string with Solid's own server renderer, then reads the root element, and each element that carries a stable part class, out of the markup. Nothing is modelled by hand, and the expected classes come from the generated input, not from a run of the component.

## What a pass covers

- 300 generated cases per component per run, a different set each run.
- Up to six distinct class names per case. Each is switched on or off, and written as part of a string, as an array item, or as an object key, all inside one nested `class` value.
- Any subset of `id`, `title`, `aria-label` and `data-state`, plus the component's boolean attribute set to true or false.
- Every component exported from `index.ts`. A component that is exported and missing from the `rootOf` table fails the first test.
- For each component, three sets of 300 cases for `classes`, `styles` and `unstyled`. In the first, up to twelve distinct class names, each switched on or off and written as a string, an array item or an object key, are spread over its parts in `classes` and over the `class` prop. In the second, up to three declarations of `color`, `margin-top` and `--consumer-gap` for each part in `styles`, each with a value, `undefined` or `null`, and the same for a consumer `style` written as an object, a string or not at all, with `unstyled` on or off. The third is the first with `unstyled` on.
- For every component, another 300 cases with the style props, `hiddenFrom`, `visibleFrom`, consumer class and consumer `style` that the `Box` cases below draw, without `component`, and with `unstyled` on or off. They check the same wiring on the root, and that `Modal` puts nothing on it for `display`, `hiddenFrom` or `visibleFrom`.
- For `Box`, another 300 cases, each with up to eight style props drawn from the table, aliases included. A value is a scale key of any scale, a CSS-wide keyword, a raw length, a number, `null`, or a string that holds `;`, `{` or `}` among other text, and is written plainly or as a responsive object with any of `base`, `xs`, `sm`, `md`, `lg` and `xl`. Each case also draws `hiddenFrom` and `visibleFrom` (a breakpoint or `null`), a `component` of `div`, `section`, `article`, `span` or `a` (with `href`), a consumer class, and a consumer `style` written as an object or a string that may set a `--sx-` property itself. It renders each case twice and requires the same markup. These cases check the wiring only: how many classes and custom properties appear and that each class has its property. They do not check a class name or a value.
- Ten fixed `Box` cases, in `packages/core/tests/box.test.tsx`, that do check the class names and values: a number, a colour scale key, a CSS-wide keyword, a number for a property that is not a length, a responsive value, an alias, `hiddenFrom`, `null`, and a value with `;` or a brace.
- That `Box` with `component="a"` takes `href`, and without it does not, as a type the checker proves, and renders an `<a>` with it. The same for `Button`. That `Disclosure`'s `classes` takes `summary`, a key of its `stylex.create` block, and not `label`, also as a type the checker proves.
- That every root carries exactly one class of the form `solix-<Component>-root`, its own.
- That every part of every component is on one element, the root is the first, and every key of the compiled `styles` object in its built file is a rendered part.

## What a pass does not cover

- A class or attribute that changes after the first render. The check renders once on the server. `apps/playground/tests/consumer.test.ts` drives the `Emphasise` button and the `Follows` disclosure in a browser, including a class that `classes.summary` names on `Follows`. Only those two are driven, and no `styles` or `unstyled` value that changes is driven. `createParts` gives each part its class and style through getters, so a part spread on its element, inline or through a `const`, is read again when a prop changes.
- Event handlers and any attribute outside the four listed. `apps/playground/tests/consumer.test.ts` checks `ref` in a browser, for one instance of each component.
- A part that a component renders only for some props. The parts come from a render with no props.
- Which CSS property a style prop sets, and how the browser ranks a style prop against a component default, a consumer class and a consumer `style`. `packages/core/tests/build-output.test.ts` checks the rules and their layer, and `apps/playground/tests/consumer.test.ts` checks the cascade in each installed engine.
- The same class name switched on in one place and off in another.
- A style-prop value that holds a comment opener `/*` or an unclosed quote. It is kept, and `packages/core/README.md` lists what it can do to the declarations after it.
- How the browser ranks a class from `classes` and a declaration from `styles` against the library's styles. `apps/playground/tests/consumer.test.ts` checks one case of each, and `unstyled` and a style prop on `Button`, in each installed engine.
- What the browser does with the markup. `apps/playground/tests/consumer.test.ts` covers that for the cases in the app.

## Reading a failure

- **`every component the library exports is held to the root contract` fails.** A component was added to `index.ts`, or removed. Add or remove its entry in `rootOf` in the test, with its root tag and one boolean attribute its root accepts.
- **`the root carries one stable root class, its own` fails.** The root carries another component's root class, such as `solix-Box-root`, because the component renders its root through that component. Render its own element and spread `root` on it.
- **`marks the root and each part its built styles object names with one stable class on one element` fails.** Two elements carry the same part, one element carries two, the root is not the first element, or a key of the compiled `styles` object in the component's built file is rendered without its stable class, so a `class` or `style` written next to the part spread replaced it.
- **`the contract skill names each component's root tag and boolean attribute as rootOf does` fails.** `rootOf` and the table in this file disagree. The message names the row and the missing fact. Decide which one describes the component, then make the other agree.
- **An `expect` inside the property fails.** This is a real break. fast-check prints the smallest input under `Counterexample`: the class names with how each was written, the attributes, and the boolean flag. Report it in those terms, for example "a class written as an object key and switched off still appears on the Button". Do not loosen the assertion.
- **`The rendered markup does not start with an element`.** The component now renders something before its root, such as a fragment or a wrapper. Decide whether that is intended before changing `rootElementOf`.
- To replay one failure, add the printed `seed` and `path` to the options object passed to `fc.assert`, run again, and remove them afterwards.

## When the change is intended

- A new style prop: add a row to the table in `packages/core/src/style-prop-table.ts` and nothing else. The check draws it from there. A second name for an existing prop is a row with `aliasOf`.
- A new component: add it to `rootOf` with its root tag, one boolean attribute, and whether it takes `display`. Its parts come from its build and its markup. If its root should not take consumer attributes, that breaks the contract in `AGENTS.md`, so change that rule and its check first.
- A component's root tag or boolean attribute changes: change it in `rootOf` and in that component's row in the table above. The test fails until both agree.
- Upgrading Solid or the Solid plugin: run the check, then update the versions in the table above.
