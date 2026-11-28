---
name: verify-component-spec
description: Checks every entry of the written function spec of the shared foundations and of each component against the built library in Chromium, Firefox and WebKit, where an entry that holds must pass and a pending one must fail as its pin says until the parity-gap item it names lands, that an entry fails on any Solid development diagnostic, that the types of the spec refuse its illegal states, and that the spec registry names every exported component, every waited-on gap item, and every listed prop, part, variable and export. An entry holds only a stateless fact; behaviour over time is a tla-ts model's to specify. Use when a change adds or edits a component, a spec entry, the spec format, its runner, its registry or its shared suite, the component spec project, or Solid, the Solid plugin, Vitest, Playwright or axe-core.
---

# Verify the component spec

## The promise

Every component has a written function spec, or the registry names the parity-gap item that will write it. A spec is data: a `reference`, which lists the reference's props, parts, CSS variables and exports, and a list of `entries`. A later component's spec adds a module of that data and one row in `registry` in `packages/core/spec/registry.ts`.

Each entry states one stateless promise of the functional reference, which the library matches exactly (Q166, Q209): the DOM, the ARIA, the attributes and the CSS variable names that the component renders for the props its fixture gives. Its `about` names the prop, part, variable or export of the reference that it promises, a shared promise, or every part, and the type takes no name the reference does not list. A fixture's props are typed by the built component's own props, and a prop the build does not take yet goes in `unbuilt`. Each entry is checked by assertions on its rendered fixture. An owner's decision is an entry of its component's spec, tagged `decision`.

A tla-ts model specifies behaviour across a sequence of user actions, or a state that changes over time, so no entry checks it. Each such behaviour is an item of `behaviourGapItems` in `packages/core/spec/gaps.ts`, which says that it waits for a tla-ts model, or that `verify-formal-tabs` covers it, for the selection and roving focus of `Tabs`. `Rendered` gives an entry no user events.

A function entry may read a computed value, and compares it only with another computed value of the same fixture under other props, or with a test colour of `packages/core/spec/fixtures.ts`: no function entry compares a value with the reference's literal or with a `--solix-*` token. That is where the line with the look spec sits. Every value compared with the reference's literal is in the look spec, which `.agents/skills/verify-visual-spec` covers, the `lg` end of the size and radius scales among them.

Each entry carries a `status`:

- `"holds"`: the check passes against the built library, and must keep passing.
- `{ until, fails }`: `until` is a key of `parityGapItems` in `packages/core/spec/gaps.ts`, and `fails` is the pin of today's failure. A pin is the start of an assertion's message, `label: expected …`, with the label that the check gave `expect`, or a missing export, part or attribute, `{ export }`, `{ of, part }` or `{ attribute, value }`, which the runner raises when the build lacks it. The check must fail today as pinned. Once it passes, the entry fails with `now holds: mark it holds`. If it fails another way, the entry fails and shows both.

A `SpecError` says the spec itself is wrong: a pin with a blank label, a value the engine does not take, a value that names a custom property, one that computes otherwise in another context, a canvas that cannot paint a colour, a keyboard that does not reach the part, a stylesheet that does not load, or Solid's production build. `held` fails an entry on it whatever its status, so a wrong spec never counts as a pending feature.

Each entry runs in the `scope` of `specTest`, which owns everything the entry makes. The runner resolves every component the fixture names from the build before it mounts anything, so a missing export mounts nothing. A function fixture's provider keeps the props it is given. The fixture's props sit in a shallow store: `update` changes a prop, and each value reaches the component as the fixture gives it, as a consumer's JSX would pass it. After the entry, the scope runs every cleanup, last first, each even when another throws, and then `flush()`. The entry then fails when Solid's development build raised a diagnostic while it ran or closed, and the failure names each code. The project loads the dist modules without Solid's refresh transform.

`sharedSuite` in `packages/core/spec/shared.ts` gives every component the shared promises of the reference's system-props and Styles API suites that no other check of this repository holds: the reference's parts compared with the stable part classes the component renders, `mod`, `variant` and `size` as data attributes, `vars`, `attributes`, `classes` and `styles` as functions, `style` as a list merged in order and as a function, `renderRoot` given the root's props, the static `classes` and `varsResolver`, `extend` and `withProps`, and a theme's component defaults and classes. A component gives its fixture and its `statuses`, a map from every shared promise its reference takes to `"holds"` or the gap item it waits on; `vars` and `static varsResolver` are taken only by a reference that lists variables. The class, the other attributes, `classes` and `styles` as records, `unstyled`, `style` as an object, `component`, the style props, the ref, the id and the hiding props are held by `.agents/skills/verify-component-contract` and the playground's consumer test, so the suite leaves them out.

The reference's Button suite is ported into the entries of `packages/core/spec/Button.ts`: data-loading, data-disabled from `disabled` and from `data-disabled`, the disabled attribute, the left and right sections, `Button.Group`, the Group's `data-orientation`, the GroupSection, and axe on a Button and on a Group. Its focus and click tests are behaviour, so they are items of `behaviourGapItems`.

## The harm when it breaks

A component ships without a feature of the reference and nothing says so, or a feature lands and the spec still calls it missing, so nobody knows what parity is left. A pending entry that fails for a reason other than the missing feature would hide that its check never tested the feature. A reactive mistake that Solid reports only in development ships with a spec that calls it done.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/spec/format.ts`: `held`, `nowHolds`, `givenProps` | The types of a reference, an entry, a fixture, a status and a pin, which refuse a status that holds with a gap item, an unknown gap item, a pin with no label, a name the reference does not list, a prop the built component does not take outside `unbuilt`, and `Rendered` user events; and the rule, `held`, which matches a failure by who raised it. |
| `packages/core/spec/gaps.ts`: `parityGapItems`, `behaviourGapItems` | Each gap item an entry or the registry waits on, keyed `<section> <n>` for the n-th check to write first of a section of the parity audit, its section `foundations` or a component, or `step <n>` for a step of the audit's order; and each behaviour that no entry checks, keyed the same way, with what specifies it. |
| `packages/core/spec/registry.ts`: `registry`, `functionSpecs`, `lookSpecs` | One row per section, its type exhaustive over the shared foundations and the library's components. |
| `packages/core/spec/shared.ts`: `sharedSuite` | The shared promises and their checks. |
| `packages/core/spec/fixtures.ts`: `fixture`, `unbuilt`, `tabs`, `modal`, `button`, `unbuiltButton`, `group`, `buttonLabel`, `testColours` | The fixtures and the test colours the specs share. |
| `packages/core/spec/runner.ts`: `runFunctionSpecs`, `mount`, `runCleanups`, `linkedStylesheet` | It imports the built library and its stable-class module from `packages/core/dist`, links its stylesheet once, refuses Solid's production build, opens Solid's diagnostics gate for each entry, resolves each fixture before it mounts it in a host that carries the library's colour-scheme attribute, and gives a check the root, the parts by their stable class, a reactive `update`, the exports and an axe scan with every WCAG 2 A and AA tag. |
| `packages/core/spec/commands.ts`: `specCommands` | The browser commands that hold a press down and emulate reduced motion through Playwright. |
| `packages/core/spec/foundations.ts`, `packages/core/spec/Button.ts`, `packages/core/spec/Tabs.ts`, `packages/core/spec/Modal.ts`, `packages/core/spec/TextInput.ts` and `packages/core/spec/SolixProvider.ts` | The function specs, each exported under a name of its own, such as `buttonSpec`. Tabs, Modal, TextInput and SolixProvider hold only the owner's decisions so far, and the registry names the step that completes each. |
| `packages/core/tests/component-spec.browser.test.ts` | It runs `functionSpecs` through `runFunctionSpecs`. |
| `packages/core/tests/spec-runner.browser.test.ts` | It holds each rule of the runner, the diagnostics gate among them, in every engine. |
| `packages/core/tests/spec-format.test.ts` | It holds `held` to the rule. |
| `packages/core/tests/spec-types.test.ts` | It holds the refusals of the types, which `vp check` runs. |
| `packages/core/tests/spec-registry.test.ts` | It holds the registry to the build, to every gap item, each written spec to its reference's lists, and each document to unique test names. |
| `scripts/spec-ledger.ts` | It prints every entry and every behaviour gap item, one line each, with its section, its test name and its status. |
| `packages/core/tests/built-library.ts`: `componentExports` | The components the build exports. |
| `tests/support/solid-diagnostics.ts`: `openSolidDiagnosticsGate`, `solidDevelopmentBuildLoaded` | The gate the runner reads Solid's diagnostics through. |
| `packages/core/src` | The components under spec, built to `packages/core/dist`. |
| `vite.config.ts` | It defines the `component spec` project, rooted at `packages/core`, in every engine with `specCommands`, with `solid({ refresh: false })` and not extending the root config, and the lint rules that hold the spec modules' imports. |
| `tests/rules/spec-lint-boundaries.test.ts` | It plants an import under every boundary of `no-restricted-imports`, in the `#/` spelling and the relative one, and holds that each boundary refuses both the same way, that every override keeps the restrictions the root rule gives every file, and that only the program openers' override drops the one that refuses `openProgram`. |
| `scripts/browser-instances.ts`: `browserInEveryEngine` | The engines the project runs in. |
| `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `vite-plus`, `@vitest/browser-playwright`, `playwright` and `axe-core` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `06bb761`. Run `git diff 06bb761 -- packages/core/spec/format.ts packages/core/spec/gaps.ts packages/core/spec/registry.ts packages/core/spec/shared.ts packages/core/spec/fixtures.ts packages/core/spec/runner.ts packages/core/spec/commands.ts packages/core/spec/foundations.ts packages/core/spec/Button.ts packages/core/spec/Tabs.ts packages/core/spec/Modal.ts packages/core/spec/TextInput.ts packages/core/spec/SolixProvider.ts packages/core/tests/component-spec.browser.test.ts packages/core/tests/spec-runner.browser.test.ts packages/core/tests/spec-format.test.ts packages/core/tests/spec-types.test.ts packages/core/tests/spec-registry.test.ts tests/rules/spec-lint-boundaries.test.ts scripts/spec-ledger.ts packages/core/tests/built-library.ts tests/support/solid-diagnostics.ts packages/core/src vite.config.ts scripts/browser-instances.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test packages/core/tests/component-spec.browser.test.ts packages/core/tests/spec-runner.browser.test.ts packages/core/tests/spec-format.test.ts packages/core/tests/spec-types.test.ts packages/core/tests/spec-registry.test.ts
vp check
```

The first line takes about a minute with all three engines installed, most of it the build every run starts with. With `CI` set, all three engines must be installed. The second runs the type tests.

## The tool and why

No model checker runs on a rendered component, so this is not a proof. Each entry is one concrete check against the built library in a real engine, the way the reference's own suites check it. The rule is plain code, `held`, which its own test holds on every case, and the illegal states are types the compiler refuses. Behaviour over time has its own tool, a tla-ts model, whose state graph a browser test replays.

## What a pass covers

- Every entry of `functionSpecs`, one test each, in each installed engine, with no Solid development diagnostic raised while it ran or closed. The run's report lists them under the spec's name. `node scripts/spec-ledger.ts` prints each entry with its status, and each behaviour gap item.
- Each rule of the runner, in each installed engine.
- That the registry names every exported component, that every parity-gap item is waited on and no behaviour gap item is one of them, that every prop, part, variable and export a written spec lists is promised, and that no two entries of a document share a test name.

## What a pass does not cover

- Behaviour over time: a click, a key, focus that moves, or a state an action changes. A tla-ts model specifies it, and `node scripts/spec-ledger.ts` lists each behaviour still waiting for one. No check refuses an entry that calls a DOM method, such as `click`, on what it renders.
- A shared promise checked on a component that has no spec yet. Each component's spec brings its suite.
- Whether a pin names the feature: it pins today's failure, which a reviewer reads when the entry is written.
- A public prop that no reference lists. The coverage rule reads the reference, not the component's type.
- A spec module that no registry imports. Fallow's audit, in the `fallow` job of the `Pull request` workflow, reports it as an unused file.
- The look. `.agents/skills/verify-visual-spec` covers it.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **`now holds: mark it holds`.** The feature the entry waited for landed, or the check passes for another reason. Read the check against the code; if the feature is there, mark the entry `"holds"`.
- **`is pending until … and fails, but not with …`.** The check fails another way than its pin: the fixture, the assertion or the component changed. Read the second message.
- **`Solid raised …`.** The entry, or a cleanup it deferred, made Solid's development build raise a diagnostic. The message names the code; read it in the `reactivity-diagnostics` skill.
- **`SpecError`.** The spec is wrong; its message says how.
- **An entry that holds fails.** A regression, unless the entry is wrong. The message names the assertion's label.
- **A registry failure.** Its message names the component, the gap item or the name to add or remove.
- **`vp check` refuses a spec.** A status, pin, `about` or fixture prop that the types refuse; the error names the field.

## When the change is intended

- A feature lands: run the check, and mark each entry that fails with `now holds` as `"holds"`.
- A component gets its spec: write `packages/core/spec/<Component>.ts` with its `reference` and `entries`, give it `sharedSuite` with its fixture and its `statuses`, and set its row in `registry`.
- A behaviour lands in a tla-ts model: delete its item from `behaviourGapItems`.
- Mutation check after editing `held`: in `packages/core/spec/format.ts` delete the line `if (!outcome.passed && outcome.error instanceof SpecError) throw outcome.error;` and run `vp test packages/core/tests/spec-format.test.ts`. It must fail on `an error that says the spec is wrong fails a pending entry and a holds entry alike`. Restore it afterwards.
- Mutation check after editing a component: in `packages/core/src/Button.tsx` change `const unlistedVariant = "filled";` to `"light"` and run `vp test packages/core/tests/component-spec.browser.test.ts`. It must fail on `with no variant the root has data-variant="filled"`, and on the `white` and `gradient` entries, which are pending with a pin that names the filled default and now fail with `is pending until … and fails, but not with …`. Then, in `packages/core/src/color-table.ts`, delete the line `orange: "yellow",` and run the same command: `orange is a palette of its own` must fail with `now holds: mark it holds`. Restore both afterwards.
- Mutation check after editing a prop that sets a variable: in `packages/core/src/Button.tsx` delete the line `"button-radius": "radius",` and run `vp test packages/core/tests/component-spec.browser.test.ts`. `radius="lg" sets --button-radius on the root, to a radius the default does not give it` must fail with `--button-radius follows the radius: expected '1.5rem' not to be '1.5rem'`, and `a radius given as a number of pixels draws as that many pixels in rem` with `radius 8 against the default radius: expected '24px' not to be '24px'`. Restore it, then delete the three lines beside it that map a variable to `"size"` and run the same command: each `size="lg" sets … to a length the default size does not give it` must fail with `… follows the size`. Restore them afterwards.
- Mutation check after editing a shared check: in `packages/core/src/Button.tsx` write `const renderRoot = Reflect.get(rawProps, "renderRoot"); if (typeof renderRoot === "function") return renderRoot({});` before the `return`, and run `vp test packages/core/tests/component-spec.browser.test.ts`. The `renderRoot` entry must fail with `is pending until foundations 7 and fails, but not with "renderRoot: expected"`, on `renderRoot's root class`, since the root it rendered has no class of the root. Restore it afterwards.
- Mutation check after editing the runner: in `packages/core/spec/runner.ts` change `const diagnostics = raised();` to `const diagnostics: readonly string[] = [];` and run `vp test packages/core/tests/spec-runner.browser.test.ts`. It must fail on `a Solid diagnostic raised while a test closes fails it by its code, beside a cleanup that threw`. Restore it, then delete the line `{ shallow: true },` from `mount` and run `vp test packages/core/tests/component-spec.browser.test.ts`: the `mod`, `attributes`, `style` list, `loaderProps` and `gradient` entries of Button must fail with `Solid raised STRICT_READ_UNTRACKED`, since a deep store hands the button a store proxy that Solid reads outside a tracking scope when it writes the attribute. Restore it afterwards.
- Mutation check after editing the lint boundaries: in `vite.config.ts` make `inEverySpelling` return only ``[`\\#/${nameInThePackage}`]`` and run `vp test tests/rules/spec-lint-boundaries.test.ts`. Each relative spelling of the runner, of its comparison and of a browser module must fail, beside `every spelling of … is refused the same way`. Restore it, then give the `specNodeModules` override `opensPrograms: true` and run the same command: `no override drops the paths the root rule restricts` must fail, and so must both `openProgram` cases of `spec-node-module`. Restore it afterwards.
- Mutation check after editing the registry or a spec: in `packages/core/spec/Button.ts` change `until: "Button 20",` to `until: "Button 17",` and run `vp test packages/core/tests/spec-registry.test.ts`. It must fail on `every parity-gap item is one that an entry or a slot of the registry waits on`, naming `Button 20`. Restore it, then change the `fullWidth` entry's `about: "prop fullWidth",` to `about: "behaviour",`: `vp check` must refuse it, and `vp test packages/core/tests/spec-registry.test.ts` must fail on `every prop, part, variable and export a written function spec lists has an entry that promises it`, naming `Button: no entry promises its prop fullWidth.` Restore it afterwards.
