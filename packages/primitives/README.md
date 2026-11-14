# @solix/primitives

The reactive primitives of Solix UI, for Solid 2.0. Each one holds a piece of state or behaviour, and renders nothing. An app can use them directly.

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

- **Values.** A value that changes is returned as an `Accessor`. A command is a function. A primitive returns nothing, or a tuple or object that holds only functions, so destructuring it never freezes a value.
- **Arguments.** The input a primitive follows, such as a value it remembers, is an accessor: pass `() => props.value`, not `props.value`. An option takes a value or an accessor (`MaybeAccessor`), and is read where it is used, so `() => props.max` stays live. An argument read once, when the primitive is created, is typed `ReadOnce` and named `initial*`, `default*` or `final*`. A callback is read when it is called, so the latest one runs.
- **Requests.** Solid applies writes at its next flush. Each request decides on the value staged by the requests before it in the same tick; a request that changes nothing writes nothing and calls nothing.
- **Owner.** Call a primitive under an owner: a component, `createRoot` or another primitive. Its state and its cleanup belong to that owner, and once the owner is disposed its commands write nothing and call nothing.
- **Server.** A primitive renders on the server, where it reads no browser global.
- **Look.** A primitive writes no style and no class. The component that renders the element styles it.

## Primitives

`src/index.ts` exports every primitive. Each one's doc comment, in `src/<file>.ts` and in your editor, says what it does and what it promises.
