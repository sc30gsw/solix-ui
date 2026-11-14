import { createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createSetState } from "../src/index";
import { mount, watch } from "./support/browser-harness";

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

test("updates before a flush build on each other, and one that sets every key to its value writes nothing", () => {
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
