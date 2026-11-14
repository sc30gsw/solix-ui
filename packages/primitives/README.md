# @solix/primitives

The reactive primitives of Solix UI, for Solid 2.0. Each one holds a piece of state or behaviour that components share, and renders nothing. The components in `@solix/core` build on them, and an app can use them directly.

## Quickstart

From the repository root, with the Vite+ CLI (`vp`). Without a global `vp`, put `pnpm exec` in front of each command.

```bash
vp install
vp run -r build
```

```tsx
import { createUncontrolled } from "@solix/primitives";

function Rating(props: {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
}) {
  const [value, setValue] = createUncontrolled({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    finalValue: 0,
    onChange: (next) => props.onChange?.(next),
  });
  return <button onClick={() => setValue(value() + 1)}>{value()}</button>;
}
```

Every value that changes is an accessor, so call it: `value()`. Commands, such as `setValue`, are plain functions.

## The rules every primitive follows

- **Values.** A value that changes is returned as an `Accessor`. A command is a function. A returned tuple or object holds only functions, so destructuring it never freezes a value.
- **Arguments.** The input a primitive follows, such as a value it remembers, is an accessor: pass `() => props.value`, not `props.value`. An option takes a value or an accessor (`MaybeAccessor`), and is read where it is used, so `() => props.max` stays live. An argument named `initial*`, `default*` or `final*` is read once, when the primitive is created. A callback is read when it is called, so the latest one runs.
- **Requests.** Solid applies writes at its next flush. Requests made before that flush resolve to the last one, and a request that changes nothing does nothing: it writes nothing and calls no callback.
- **Owner.** Call a primitive under an owner: a component, `createRoot` or another primitive. Its state and its cleanup belong to that owner.
- **Server.** A primitive renders on the server, where it touches no browser global, and creates the same reactive nodes there as in the browser, so hydration lines up.
- **Look.** A primitive writes no style and no class. The component that renders the element styles it.

## Primitives

### createUncontrolled

```ts
const [value, setValue, controlled] = createUncontrolled({
  value,
  defaultValue,
  finalValue,
  onChange,
});
```

The state of a control that a consumer may own. While `value` reads anything but `undefined`, the state is controlled: `value()` is that value, and `setValue` only calls `onChange`, so the consumer decides. Otherwise it is uncontrolled: it starts at `defaultValue`, or `finalValue` when that is `undefined`, and `setValue` writes the value and then calls `onChange` with it and any payload. It may switch while it runs, and the uncontrolled value survives a controlled stretch. A request for the value it would replace calls nothing. Passing `finalValue` types the value as `T`; without it the value may be `undefined`.

## How it is built

- `build.mjs` runs Babel with only the TypeScript preset over each file in `src` and writes `dist/*.js`. There is no JSX, no StyleX and no stylesheet.
- It ships under a `solid` export condition, so the Solid Vite plugin compiles it with the app and the app keeps one copy of Solid. `exports` exposes only `.`, so an `internal-*` module cannot be imported from outside.
- Its only peer is `solid-js`. `@solix/core` names it as a peer, and it depends on no other library of this repository.

## Tests

`vp test` builds every package before it runs a test.

- `tests/server-render.test.ts` renders every primitive the build exports on the server, with the browser globals trapped, and checks its server value. Its table of cases is a mapped type over the barrel, so a primitive without a case fails the type check.
- `tests/<file>.browser.test.ts` checks each primitive in Chromium, Firefox and WebKit with Vitest's browser mode. `tests/support/browser-harness.ts` fails a test on any Solid development diagnostic and on any listener, timer or observer left after its owner is disposed. Some of them run generated sequences of commands against a plain model with fast-check.
- `tests/primitive-conventions.test.ts` at the repository root checks the shape every primitive follows.
