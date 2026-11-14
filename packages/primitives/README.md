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

In the order they build on each other: `createUncontrolled` first, since most inputs rest on it, then the rest of the state primitives.

### createUncontrolled

```ts
const [value, setValue, controlled] = createUncontrolled({
  value,
  defaultValue,
  finalValue,
  onChange,
});
```

The state of a control that a consumer may own. While `value` reads anything but `undefined`, the state is controlled: `value()` is that value, and `setValue` only calls `onChange`, so the consumer decides. Otherwise it is uncontrolled: it starts at `defaultValue`, or `finalValue` when that is `undefined`, and `setValue` writes the value and then calls `onChange` with it and any payload. It may switch while it runs, and the uncontrolled value survives a controlled stretch. A request for the value it would replace calls nothing, and while controlled a request the consumer refused can be made again after the flush. Passing `finalValue` types the value as `T`; without it the value may be `undefined`.

### createToggle

```ts
const [value, toggle] = createToggle(["light", "dark", "contrast"]);
```

A value that cycles through its options, `[false, true]` by default, read once. `toggle()` moves to the next option and wraps around. `toggle(option)` moves to that option, and the next `toggle()` continues from there. `toggle(updater)` moves to the option the updater returns for the current value. A value that is not an option does nothing. With two options, `toggle(); toggle()` before a flush ends where it started.

### createCounter

```ts
const [count, { increment, decrement, set, reset }] = createCounter(0, {
  min: 0,
  max: () => props.max,
  step: 1,
});
```

A number kept between `min` and `max`, which start at `-Infinity` and `Infinity`. The initial value is read once and clamped. `increment` and `decrement` move by the absolute value of `step`, `set` writes a value, and `reset` returns to the initial value, each clamped to the bounds as they are when it runs. A count already outside new bounds stays until the next command.

### createDisclosure

```ts
const [opened, { open, close, toggle, set }] = createDisclosure(false, { onOpen, onClose });
```

Whether something is open. `open`, `close` and `toggle` run `onOpen` or `onClose` after the write, and only when they change the state, so `open(); open()` runs `onOpen` once, and `toggle(); toggle()` runs both and ends where it started. `set` writes the state and runs neither callback. The callbacks are read when they run.

### createListState

```ts
const [
  list,
  {
    setState,
    append,
    prepend,
    insert,
    pop,
    shift,
    apply,
    applyWhere,
    remove,
    reorder,
    swap,
    setItem,
    setItemProp,
    filter,
  },
] = createListState(initial);
```

A list whose commands each make a new array and leave the old one as it was. The initial value is an array or a function that returns one, read once. `insert(index, ...items)` inserts before `index`, `remove(...indices)` counts indices in the list before the removal, `reorder({ from, to })` moves one item and `swap({ from, to })` exchanges two, and `setItemProp(index, key, value)` copies the object at `index` with one key replaced. Indices are not checked. A command that leaves every item in place writes nothing.

### createMap

```ts
const map = createMap<string, User>([["ada", ada]]);
map().set("grace", grace);
```

An accessor of a `Map` whose `set`, `delete` and `clear` update it. Each change makes a new `Map`. A mutator taken from an older instance writes to the latest one, and every mutation before a flush lands. `set` with the value a key holds, and `delete` or `clear` of nothing, change nothing. `get`, `has`, `size` and iteration are the platform's own.

### createSet

```ts
const selected = createSet<string>();
selected().add(id);
```

An accessor of a `Set` whose `add`, `delete` and `clear` update it, as `createMap` does. `union`, `intersection`, `difference` and `symmetricDifference` are the platform's own: they take a set or anything with `size`, `has` and `keys`, and return a new plain `Set` without changing this one.

### createQueue

```ts
const { state, queue, add, update, cleanQueue } = createQueue({ initialValues: [], limit: 3 });
```

A list split in two: the first `limit` items in `state` and the rest in `queue`. `add` appends and splits again, `update` replaces every item, `state` then `queue`, with what it returns and splits again, so removing a shown item moves the next queued one up, and `cleanQueue` empties the queue. `limit` is read by each command, so a new limit applies from the next one.

### createStateHistory

```ts
const [value, { set, back, forward, reset }, { history, current }] = createStateHistory(initial);
```

A value with an undo history that starts with the initial value, read once. `set` drops the entries after the current one and appends, `back(steps)` and `forward(steps)` move 1 step by default and stop at either end, and `reset` returns to the initial value alone.

### createValidatedState

```ts
const [{ value, lastValidValue, valid }, setValue] = createValidatedState(
  "",
  (text) => text.length > 2,
);
```

A value that remembers the last one that passed `validate`. `value` is the last value set, valid or not. `lastValidValue` starts as the initial value when it passes, or `undefined`, and moves only on a valid value. `initialValidationState`, a third argument read once, replaces the first verdict when it is a boolean. `validate` is called when a value is set.

### createInputState

```tsx
const [name, onNameInput] = createInputState("");
<input value={name()} onInput={onNameInput} />;
```

A value with one handler that takes a value, an updater, or a form control's event. Given an event, it stores the `checked` of a checkbox and the `value` of any other control. Anything else, `""`, `0`, `false` and `null` included, is stored as it is.

### createSetState

```ts
const [filters, setFilters] = createSetState({ query: "", page: 1 });
setFilters({ page: 2 });
```

An object that takes partial updates. `setState` merges the keys it is given, or the keys an updater returns for the current object, into a new object. One that sets every key to the value it holds writes nothing.

### createPrevious

```ts
const previousPage = createPrevious(() => props.page);
```

The value the accessor held before its latest change, `undefined` until it first changes. Several writes before a flush are one change, and a read that returns the value it already held is not a change.

## How it is built

- `build.mjs` runs Babel with only the TypeScript preset over each file in `src` and writes `dist/*.js`. There is no JSX, no StyleX and no stylesheet.
- It ships under a `solid` export condition, so the Solid Vite plugin compiles it with the app and the app keeps one copy of Solid. `exports` exposes only `.`, so an `internal-*` module cannot be imported from outside.
- Its only peer is `solid-js`. `@solix/core` names it as a peer, and it depends on no other library of this repository.

## Tests

`vp test` builds every package before it runs a test.

- `tests/server-render.test.ts` renders every primitive the build exports on the server, with the browser globals trapped, and checks its server value. Its table of cases is a mapped type over the barrel, so a primitive without a case fails the type check.
- `tests/<file>.browser.test.ts` checks each primitive in Chromium, Firefox and WebKit with Vitest's browser mode. `tests/support/browser-harness.ts` fails a test on any Solid development diagnostic and on any listener, timer or observer left after its owner is disposed. Some of them run generated sequences of commands against a plain model with fast-check.
- `tests/primitive-conventions.test.ts` at the repository root checks the shape every primitive follows.
