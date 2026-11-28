---
name: verify-component-spec
description: Checks every entry of the written function spec of the shared foundations and of each component against the built library in Chromium, Firefox and WebKit, where an entry that holds must pass and a pending one must fail with the failure it names until the parity-gap item it names lands, and checks that the spec registry names every exported component, every spec, every waited-on gap item and every listed prop, part and variable. Its entries include the reference's own test suites, ported into entries and the shared suite. Use when a change adds or edits a component, a spec entry, the spec format, its runner, its registry or its shared suite, the component spec project, or Solid, the Solid plugin, Vitest, Playwright or axe-core.
---

# Verify the component spec

## The promise

Every component has a written function spec, or the registry names the parity-gap item that will write it. A spec is data: the reference's props, parts and CSS variables, which `defineReference` declares, and a list of entries that `defineSpec` takes. A later component's spec adds only that data, its entries and one line in `specs` in `packages/core/spec/registry.ts`.

Each entry states one promise of the functional reference, which the library matches exactly (Q166): a prop and its value, a default, a part, every part at once, a data attribute, a CSS variable's name, a shared promise or a behaviour. The type of `promise` takes only a prop, part or variable that the spec's reference lists. Each entry is checked by a DOM assertion on a rendered fixture. An owner's decision is an entry of its component's spec, tagged `decision`.

The function spec holds the DOM, the attributes, the behaviour and the names of the public CSS variables. Every computed value is in the look spec, with the reference's literal value, so no function entry compares a value with a `--solix-*` token. `.agents/skills/verify-visual-spec` covers the look spec.

Each entry carries a status:

- `holds`: the check passes against the built library, and must keep passing.
- `pending`, with `until`, a key of `parityGapItems` in `packages/core/spec/gaps.ts`, and `failsWith`, the text its failure must hold. The check must fail today with that text. Once it passes, the entry fails with `now holds: mark it holds`; if it fails with other text, the entry fails and shows both.

A `SpecError` says the spec itself is wrong: a value the engine does not take, a value that names a custom property, one that computes otherwise in another context, a canvas that cannot paint a colour, or a keyboard that does not reach the part. `held` fails an entry on it whatever its status, so a wrong spec never counts as a pending feature.

`sharedSuite` in `packages/core/spec/shared.ts` gives every component the shared promises of the reference's system-props and Styles API suites that no other check of this repository holds: the reference's parts compared with the stable part classes the component renders, `mod`, `variant` and `size` as data attributes, `vars`, `attributes`, `classes` and `styles` as functions, `style` as a list and as a function, `renderRoot`, the static `classes` and `varsResolver`, `extend` and `withProps`, and a theme's component defaults and classes. A component gives its fixture and a map from each shared promise to the gap item it waits on. The class, the other attributes, `classes` and `styles` as records, `unstyled`, `style` as an object, `component`, the style props, the ref, the id and the hiding props are held by `.agents/skills/verify-component-contract` and the playground's consumer test, so the suite leaves them out.

The reference's Button suite is ported into the entries of `packages/core/spec/Button.ts`: data-loading, data-disabled from `disabled` and from `data-disabled`, the disabled attribute, the left and right sections, `Button.Group`, the Group's `data-orientation`, the GroupSection, axe on a Button and on a Group, and the focus events.

## The harm when it breaks

A component ships without a feature of the reference and nothing says so, or a feature lands and the spec still calls it missing, so nobody knows what parity is left. A pending entry that fails for a reason other than the missing feature would hide that its check never tested the feature.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/spec/format.ts`: `held`, `nowHolds`, `givenProps` | The types of a reference, an entry, a fixture and a check, and the rule. |
| `packages/core/spec/gaps.ts`: `parityGapItems` | Each gap item an entry or the registry waits on, keyed `<section> <n>` for the n-th check to write first of a section of the parity audit, its section `foundations` or a component, or `step <n>` for a step of the audit's order. |
| `packages/core/spec/registry.ts`: `specs`, `foundations`, `functionSpecs`, `lookSpecs`, `drawsNoLook` | One entry per exported component, its type exhaustive over the library's components. |
| `packages/core/spec/shared.ts`: `sharedSuite`, `sharedPromises` | The shared promises and their checks. |
| `packages/core/spec/fixtures.ts`: `fixture`, `unbuilt`, `tabs`, `modal` | The fixtures the specs share. |
| `packages/core/spec/runner.ts`: `runFunctionSpecs` | It imports the built library and its stable-class module from `packages/core/dist`, links its stylesheet, mounts each fixture in a host that carries the library's colour-scheme attribute, inside a `SolixProvider` forced to that scheme or a disabled `fieldset` when the fixture asks, and gives a DOM check the root, the parts by their stable class, a reactive `update`, an axe scan with every WCAG 2 A and AA tag, and the user's clicks and keys. |
| `packages/core/spec/commands.ts`: `specCommands` | The browser commands that hold a press down and emulate reduced motion through Playwright. |
| `packages/core/spec/foundations.ts`, `packages/core/spec/Button.ts`, `packages/core/spec/Tabs.ts`, `packages/core/spec/Modal.ts`, `packages/core/spec/TextInput.ts` and `packages/core/spec/SolixProvider.ts` | The function specs, each exported as `spec`. Tabs, Modal, TextInput and SolixProvider hold only the owner's decisions so far, and the registry names the step that completes each. |
| `packages/core/tests/component-spec.browser.test.ts` | It runs `functionSpecs` through `runFunctionSpecs`. |
| `packages/core/tests/spec-format.test.ts` | It holds `held` to the rule. |
| `packages/core/tests/spec-registry.test.ts` | It holds the registry to the build, to every spec under `packages/core/spec`, to every gap item, and each complete spec to its reference's lists. |
| `packages/core/tests/built-library.ts`: `componentExports` | The components the build exports. |
| `packages/core/src` | The components under spec, built to `packages/core/dist`. |
| `vite.config.ts` | It defines the `component spec` project, rooted at `packages/core`, in every engine with `specCommands`, in the shape of the `browser` project. |
| `scripts/browser-instances.ts`: `browserInEveryEngine` | The engines the project runs in. |
| `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `vite-plus`, `@vitest/browser-playwright`, `playwright` and `axe-core` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `06bb761`. Run `git diff 06bb761 -- packages/core/spec/format.ts packages/core/spec/gaps.ts packages/core/spec/registry.ts packages/core/spec/shared.ts packages/core/spec/fixtures.ts packages/core/spec/runner.ts packages/core/spec/commands.ts packages/core/spec/foundations.ts packages/core/spec/Button.ts packages/core/spec/Tabs.ts packages/core/spec/Modal.ts packages/core/spec/TextInput.ts packages/core/spec/SolixProvider.ts packages/core/tests/component-spec.browser.test.ts packages/core/tests/spec-format.test.ts packages/core/tests/spec-registry.test.ts packages/core/tests/built-library.ts packages/core/src vite.config.ts scripts/browser-instances.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/component-spec.browser.test.ts packages/core/tests/spec-format.test.ts packages/core/tests/spec-registry.test.ts
```

It takes about a minute with all three engines installed, most of it the build every run starts with. With `CI` set, all three engines must be installed.

## The tool and why

No model checker runs on a rendered component, so this is not a proof. Each entry is one concrete check against the built library in a real engine, the way the reference's own suites check it. The rule is plain code, `held`, which its own test holds on every case, and the registry is a type the compiler holds exhaustive.

## What a pass covers

- Every entry of `functionSpecs`, one test each, in each installed engine. The run's report lists them under the spec's name. To count the entries of a spec and how many hold, filter its `entries` by `status` in a Node script that imports `packages/core/spec/registry.ts`.
- That the registry names every exported component and every spec, that every gap item is waited on, and that every prop, part and variable a complete spec lists is promised.

## What a pass does not cover

- A shared promise checked on a component that has no spec yet. Each component's spec brings its suite.
- Whether `failsWith` names the feature: it pins the text of today's failure, which a reviewer reads when the entry is written.
- The look. `.agents/skills/verify-visual-spec` covers it.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **`now holds: mark it holds`.** The feature the entry waited for landed, or the check passes for another reason. Read the check against the code; if the feature is there, mark the entry `holds`.
- **`is pending until … and fails, but not with …`.** The check fails for another reason than the one it waits on: the fixture, the assertion or the component changed. Read the second message.
- **`SpecError`.** The spec is wrong; its message says how.
- **An entry that holds fails.** A regression, unless the entry is wrong. The message names the assertion's label.
- **A registry failure.** Its message names the component, the spec, the gap item or the prop to add or remove.

## When the change is intended

- A feature lands: run the check, and mark each entry that fails with `now holds` as `holds`.
- A component gets its spec: write `packages/core/spec/<Component>.ts` with `defineReference` and `defineSpec`, give it `sharedSuite` with its fixture and gap items, and set its line in `specs`.
- Mutation check after editing `held`: in `packages/core/spec/format.ts` delete the line `if (!outcome.passed && outcome.error instanceof SpecError) throw outcome.error;` and run `vp test packages/core/tests/spec-format.test.ts`. It must fail on `an error that says the spec is wrong fails a pending entry and a holds entry alike`. Restore it afterwards.
- Mutation check after editing a component: in `packages/core/src/Button.tsx` change `const unlistedVariant = "filled";` to `"light"` and run `vp test packages/core/tests/component-spec.browser.test.ts`. It must fail on `with no variant the root has data-variant="filled"`, on the `white` and `gradient` entries, which are pending with a failure that names the filled default and now fail with `is pending until … and fails, but not with …`, and on the `autoContrast` entry, which fails with `now holds: mark it holds`, since a light Button draws the same text with `autoContrast` and without it. Then, in `packages/core/src/color-table.ts`, delete the line `orange: "yellow",` and run the same command: `orange is a palette of its own` must fail with `now holds: mark it holds`. Restore both afterwards.
- Mutation check after editing the registry or a spec: in `packages/core/spec/Button.ts` change `until: "Button 20",` to `until: "Button 17",` and run `vp test packages/core/tests/spec-registry.test.ts`. It must fail on `every parity-gap item is one that an entry or the registry waits on`, naming `Button 20`. Restore it afterwards.
