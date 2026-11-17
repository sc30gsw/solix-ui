import fc from "fast-check";
import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createSetState, type SetStatePatch } from "#/src/index.ts";
import { flush, mount, unmount, watch } from "#/tests/support/browser-harness.ts";
import { command, flushCommand, type Tick } from "#/tests/support/model.ts";

type Filters = { query: string; page: number; tags?: string[] };

test("it merges the keys it is given into a new object and leaves the old one as it was", () => {
  const [state, setState] = mount(() => createSetState<Filters>({ query: "", page: 1 }));
  const before = state();

  setState({ page: 2 });
  flush();
  expect(state()).toEqual({ query: "", page: 2 });
  expect(before).toEqual({ query: "", page: 1 });
  setState({ tags: ["new"] });
  flush();
  expect(state()).toEqual({ query: "", page: 2, tags: ["new"] });
});

test("it merges what an updater returns for the current object", () => {
  const [state, setState] = mount(() => createSetState<Filters>({ query: "a", page: 1 }));

  setState((current) => ({ page: current.page + 1 }));
  setState((current) => ({ query: `${current.query}${current.page}` }));
  flush();
  expect(state()).toEqual({ query: "a2", page: 2 });
});

test("each request decides on the value staged by the requests before it in the same tick, and one that sets every key to its value writes nothing", () => {
  const [initial, setInitial] = createSignal<Filters>({ query: "", page: 1 });
  const { setState, seen } = mount(() => {
    const [state, setState] = createSetState(initial);
    return { setState, seen: watch(state) };
  });

  setInitial({ query: "ignored", page: 9 });
  setState({ page: 1 });
  setState({});
  flush();
  setState({ query: "x" });
  setState({ page: 3 });
  flush();
  expect(seen).toEqual([
    { query: "", page: 1 },
    { query: "x", page: 3 },
  ]);
});

test("a symbol key is merged like any other, and setting it to the value it holds writes nothing", () => {
  const marker = Symbol("marker");
  const { state, setState, seen } = mount(() => {
    const [state, setState] = createSetState<{ [marker]: number; page: number }>({
      [marker]: 1,
      page: 1,
    });
    return { state, setState, seen: watch(state) };
  });

  setState({ [marker]: 2 });
  flush();
  expect(state()[marker]).toBe(2);
  setState({ [marker]: 2 });
  flush();
  expect(seen.length).toBe(2);
});

type Fields = Partial<Record<"a" | "b" | "c", number>>;
type Model = Tick<Fields> & { shown: Fields[] };
type Real = {
  state: () => Fields;
  setState: (patch: SetStatePatch<Fields>) => void;
  seen: Fields[];
};

const key = fc.constantFrom("a" as const, "b" as const, "c" as const);
const value = fc.integer({ min: 0, max: 2 });

function sameFields(left: Fields, right: Fields): boolean {
  const keys = Object.keys(left) as (keyof Fields)[];
  return (
    keys.length === Object.keys(right).length &&
    keys.every((name) => name in right && left[name] === right[name])
  );
}

const commands = [
  fc.array(fc.tuple(key, value), { maxLength: 3 }).map((entries) => {
    const patch: Fields = Object.fromEntries(entries);
    return command<Model, Real>(`setState(${JSON.stringify(patch)})`, (model, real) => {
      real.setState(patch);
      model.staged = { ...model.staged, ...patch };
    });
  }),
  key.map((name) =>
    command<Model, Real>(
      `setState((current) => ({ ${name}: current.${name} + 1 }))`,
      (model, real) => {
        real.setState((current) => ({ [name]: (current[name] ?? 0) + 1 }));
        model.staged = { ...model.staged, [name]: (model.staged[name] ?? 0) + 1 };
      },
    ),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      if (!sameFields(model.shown[model.shown.length - 1], model.committed)) {
        model.shown.push(model.committed);
      }
      expect(real.state(), "the object after the flush").toEqual(model.committed);
      expect(real.seen, "every object the accessor showed").toEqual(model.shown);
    }),
  ),
];

test("for every generated sequence of patches, updaters and flushes, it agrees with a model of the object and shows an object only when a key changes", () => {
  fc.assert(
    fc.property(
      fc
        .array(fc.tuple(key, value), { maxLength: 3 })
        .map((entries): Fields => Object.fromEntries(entries)),
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initial, sequence) => {
        const { state, setState, seen } = mount(() => {
          const [state, setState] = createSetState<Fields>(initial);
          return { state, setState, seen: watch(state) };
        });
        const model: Model = { staged: initial, committed: initial, shown: [initial] };
        fc.modelRun(() => ({ model, real: { state, setState, seen } }), sequence);
        unmount();
      },
    ),
  );
});
