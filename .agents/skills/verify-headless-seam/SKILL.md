---
name: verify-headless-seam
description: Checks the merge order of a part bound to a UI SDK slot, for generated consumer props, component props and slot props and not only the ones a component passes today. Use when a change edits `packages/core/src/headless.ts`, `withConsumerStyle`, how a component calls `bind`, the SDK's version, or Solid, the Solid plugin or fast-check.
---

# Verify the behaviour seam

## The promise

A part bound to a slot is given three sets of props: the consumer's and the styles' (`styled`, what `createParts` returns for the part), the component's own (`component`, the `own` entry of the map given to `bind`), and the SDK's for the slot. `bindSlot` in `packages/core/src/headless.ts` merges them in one order, whatever they hold:

- The SDK is told only attributes, the consumer's over the component's, and the id that is the consumer's, else the component's. It is told no handler, ref, class or style.
- An event reaches the consumer's handler, then the component's, then the SDK's, and stops after the first that prevents its default. A handler written as Solid's bound pair `[handler, data]` counts as one.
- A ref receives the element in the same order.
- The id is the consumer's, else the component's, else the SDK's.
- The class is ours alone, even if the SDK gave one.
- A declaration of the SDK's style gives way to ours, whether ours is an object or a string.
- Every other attribute the SDK returns is on the part.

Bound to the SDK's real tabs slots through `bind`, each part keeps exactly our classes and style, takes the slot's role, takes our id where we gave one and the SDK's where we did not, with the panel labelled by whichever id the tab has, and a click reaches the component's handler and then selects through the SDK unless the component prevented the default or the tab is disabled.

The type of `bind` takes a slot for the root and for each part the styles name, with the props that slot needs. It refuses a part the styles do not name, a slot the behaviour does not have, a slot given without the props it needs, a component's own props that carry a `class` or a `style`, which the part would drop, and, with an error that says why, parts whose root still takes `children`, so a component renders its children itself and an attribute the SDK changes never re-creates them. While the names of the handlers stay the same, a bound part keeps the same handlers object, so a selection changes no element in a list.

## The harm when it breaks

A consumer's `onClick` runs after the SDK already selected, or cannot stop it. A ref points at nothing, a label points at an id no element has, the SDK's class or inline style replaces the look a consumer set. A component binds a part that does not exist and nothing says so until a user meets an element with no behaviour.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `packages/core/src/headless.ts`: `bindSlot`, `createBehaviour`, `Behaviour`, `partId` | `bindSlot(styled, component, slot)` calls `slot` once with the attributes and merges what it returns. It reads the names of the handlers each time the part's props are read, so a handler added later is merged too, and returns the same handlers object while the names are unchanged. `createBehaviour` first gives the SDK the nonce of `SolixProvider`, through the `csp-nonce` meta the SDK reads, when the page's head holds none, then wraps the SDK's `usePrimitive`, and its `bind` takes the parts `createParts` returned and calls `bindSlot` once for each part in its map, with the SDK's slot getter. |
| `packages/core/src/parts.ts`: `createParts`, `rootPart` | `createParts` returns `{ root, part }` and knows nothing of a behaviour. `bind` takes the root's props from `root` and another part's from `part(name)`. |
| `packages/core/src/style-props.ts`: `withConsumerStyle` | It puts its first argument's declarations before the second's, as an object or as a string, and leaves out a declaration whose value is `undefined` or `null`. `bindSlot` gives it the SDK's style first and ours second. |
| `packages/core/tests/headless.test.tsx` | The check. Its first test draws three sets of props and a stand-in slot. Another binds a probe component to the SDK's tabs slots and renders it with Solid's server renderer from `packages/core/dist`. The tests whose names start `bind takes` or `bind refuses` hold the type of `bind`, which `vp check` evaluates. |
| `apps/playground/tests/behaviour-seam.test.ts` | It holds, in a browser, what the server renderer cannot show: a handler given to a tab after the first render reaches it; every tab of the controlled list stays the element it was, and an element passed as a section is created once, across a click, an arrow key and a handler given to the list later; tabs in a shadow root keep focus and their arrow keys; and the ids `partId` makes from generated values can be referenced. |
| `tests/support` | It builds the library and the app in production mode before any test. |
| `vite.config.ts` | It sets the test include globs, the global setup and the Solid plugin. |
| `@ui-sdk/core`, `@ui-sdk/solid`, `solid-js`, `@solidjs/signals`, `@solidjs/web`, `@solidjs/compiler`, `@solidjs/vite-plugin` and `fast-check` in the catalog in `pnpm-workspace.yaml` | At the versions the catalog pins. |

Last confirmed against commit `c32bce2`. Run `git diff c32bce2 -- packages/core/src/headless.ts packages/core/src/parts.ts packages/core/src/style-props.ts packages/core/tests/headless.test.tsx apps/playground/tests/behaviour-seam.test.ts tests/support vite.config.ts pnpm-workspace.yaml`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp check --deny-warnings
vp test packages/core/tests/headless.test.tsx apps/playground/tests/behaviour-seam.test.ts
```

The first evaluates the type test. The second takes about ten seconds with one engine installed, most of it the build that every test run starts with. With `CI` set, all three engines must be installed.

## The tool and why

No model checker or verifier runs on a Solid component or on the SDK, so this is not a proof. The merge order is a pure function of three objects, so the first test generates the objects and a stand-in for the slot with fast-check and checks the function on the real code. The test against the SDK's slots generates our props and the tab's slot props and checks the same order against the SDK itself, rendered on the server. What `bind` refuses is a fact about a type, so the compiler checks it.

## What a pass covers

- `generatedRuns` draws per run of the stand-in test, as `headless.test.tsx` sets it. Each of the three sources may give an id, a ref, a class, a style as an object or a string, any of four attributes, and any of `onClick`, `onKeyDown` and `onFocus`, each a plain function or a bound pair, each preventing the default or not.
- As many draws per run against the SDK's `root`, `list`, `tab` and `panel` slots: a consumer class and id on the root, a component id on the tab, the tab disabled or not, and a component click handler that prevents the default or not.
- A symbol key of ours does not break the binding.
- Each shape of what is given to `bind` that those type tests list: maps it takes and maps it refuses, and roots it takes and roots that still take `children`, which it refuses. Each is given as a type, so the answer is the same for a map written inline and for one held in a constant.
- In each installed engine, one handler given after the first render, the identity of every tab of one list across a click, an arrow key and a handler given later, the arrow keys in a shadow root, and `generatedRuns` generated sets of tab values, as `behaviour-seam.test.ts` sets it.

## What a pass does not cover

- Handlers and refs of the generated props in a browser. The stand-in test calls merged handlers with a stand-in event, and the SDK test calls the tab's click handler directly in Node. `behaviour-seam.test.ts` holds one handler given after the first render; `consumer.test.ts` each root's ref.
- A ref given after the first render. `bindSlot` reads the refs once, when it binds.
- An SDK slot whose attributes include a style. No tabs slot has one, so the style order is checked against the stand-in only.
- A part repeated inside one component, such as an option rendered from data. `bind` binds each part of its map once, and no component binds one per item.
- The selection of `Tabs`. `.agents/skills/verify-behaviour-protocol` covers that.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **The stand-in test fails.** fast-check prints the three drawn sources under `Counterexample`. Say which rule broke in the terms above, for example "a component handler that prevents the default did not stop the SDK's". A failure in `expect(seen)` means the SDK is being told something other than attributes.
- **The SDK test fails on a class, a style or a role.** The SDK's slot began to write a class or a style attribute, or its role changed. Read the SDK's release notes before changing `bindSlot`.
- **The SDK test fails on `aria-labelledby`.** The SDK no longer labels the panel by the id it was told. A component's own id reaches the SDK only through `bindSlot`'s attributes.
- **`vp check` fails in `headless.test.tsx` with `Expected: literal boolean`.** The type of `bind` began to take a map it refused, or to refuse one it took. The line names which.
- **The browser test fails on `its own`.** An `aria-controls` or `aria-labelledby` names no element, or more than one. fast-check prints the tab values; a value with a space or a `%` points at `partId`.
- To replay one failure, add the printed `seed` and `path` to the options object passed to `fc.assert`, run again, and remove them afterwards.

## When the change is intended

- A new source of props in the order, or a new kind of prop: change `bindSlot`, then the sources and the expectations in the first test, from the rule you intend, before you rerun.
- A new shape of the map given to `bind`, such as a part bound once per item: add it to the type test with the answer you intend.
- Upgrading the SDK, Solid or fast-check: run both commands.
- Mutation check after editing covered code: in `packages/core/src/headless.ts` change `const inOrder: AnyProps[] = [styled, component, behaviour];` to put `behaviour` first and run the first test file, which must fail with a counterexample in which the slot and the consumer or the component handle the same event. Then change the type of `slots` in `Behaviour` to `{ [Part in keyof Slots]: Bound<P> }` and run `vp check`, which must fail in `headless.test.tsx`. Restore both afterwards.
