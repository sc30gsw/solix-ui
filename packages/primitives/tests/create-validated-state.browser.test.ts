import { createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createValidatedState, type ValidatedState } from "../src/index";
import { mount, watch } from "./support/browser-harness";

const longerThanTwo = (text: string) => text.length > 2;

function shown<T>(state: ValidatedState<T>): [T, T | undefined, boolean] {
  return [state.value(), state.lastValidValue(), state.valid()];
}

test("a valid initial value is also the last valid value", () => {
  const [state] = mount(() => createValidatedState("abc", longerThanTwo));

  expect(shown(state)).toEqual(["abc", "abc", true]);
});

test("an invalid initial value leaves the last valid value undefined", () => {
  const [state] = mount(() => createValidatedState("ab", longerThanTwo));

  expect(shown(state)).toEqual(["ab", undefined, false]);
});

test("the last valid value moves only on a valid value and survives a run of invalid ones", () => {
  const [state, setValue] = mount(() => createValidatedState("abc", longerThanTwo));

  setValue("abcd");
  flush();
  expect(shown(state)).toEqual(["abcd", "abcd", true]);
  setValue("a");
  flush();
  setValue("b");
  flush();
  expect(shown(state)).toEqual(["b", "abcd", false]);
});

test("initialValidationState replaces only the first verdict", () => {
  const [state, setValue] = mount(() => createValidatedState("ab", longerThanTwo, true));

  expect(shown(state)).toEqual(["ab", undefined, true]);
  setValue("ab");
  flush();
  expect(shown(state)).toEqual(["ab", undefined, false]);
});

test("validate runs when a value is set, with that value, and the initial values are read once", () => {
  const judged: string[] = [];
  const [initial, setInitial] = createSignal("abc");
  const [state, setValue] = mount(() =>
    createValidatedState(initial, (text: string) => {
      judged.push(text);
      return text.length > 2;
    }),
  );

  setInitial("x");
  setValue("wxyz");
  flush();
  expect(judged).toEqual(["abc", "wxyz"]);
  expect(shown(state)).toEqual(["wxyz", "wxyz", true]);
});

test("values set before a flush resolve to the last one, and one that changes nothing writes nothing", () => {
  const { setValue, seen } = mount(() => {
    const [state, setValue] = createValidatedState("abc", longerThanTwo);
    return { setValue, seen: watch(() => shown(state)) };
  });

  setValue("x");
  setValue("abc");
  flush();
  expect(seen.length).toBe(1);
  setValue("y");
  setValue("wxyz");
  flush();
  expect(seen).toEqual([
    ["abc", "abc", true],
    ["wxyz", "wxyz", true],
  ]);
});
