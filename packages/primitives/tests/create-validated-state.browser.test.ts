import fc from "fast-check";
import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createValidatedState, type ValidatedState } from "#/src/index.ts";
import { flush, mount, unmount, watch } from "#/tests/support/browser-harness.ts";
import { command, flushCommand, type Tick } from "#/tests/support/model.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

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

test("each request decides on the value staged by the requests before it in the same tick, and one that changes nothing writes nothing", () => {
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

type Verdict = [value: string, lastValidValue: string | undefined, valid: boolean];
type Model = Tick<Verdict> & { shown: Verdict[] };
type Real = { state: ValidatedState<string>; setValue: (value: string) => void; seen: Verdict[] };

const text = fc.constantFrom("", "a", "ab", "abc", "abcd");

const commands = [
  text.map((value) =>
    command<Model, Real>(`setValue("${value}")`, (model, real) => {
      real.setValue(value);
      const valid = longerThanTwo(value);
      model.staged = [value, valid ? value : model.staged[1], valid];
    }),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      if (JSON.stringify(model.shown[model.shown.length - 1]) !== JSON.stringify(model.committed)) {
        model.shown.push(model.committed);
      }
      expect(shown(real.state), "the value, the last valid value and the verdict").toEqual(
        model.committed,
      );
      expect(real.seen, "every verdict the accessors showed").toEqual(model.shown);
    }),
  ),
];

test("for every generated sequence of values and flushes, it agrees with a model of the value, the last valid value and the verdict", async (context) => {
  await assertProperty(
    context,
    fc.property(
      text,
      fc.option(fc.boolean(), { nil: undefined }),
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initial, initialValidationState, sequence) => {
        const { state, setValue, seen } = mount(() => {
          const [state, setValue] = createValidatedState<string>(
            initial,
            longerThanTwo,
            initialValidationState,
          );
          return { state, setValue, seen: watch(() => shown(state)) };
        });
        const first: Verdict = [
          initial,
          longerThanTwo(initial) ? initial : undefined,
          initialValidationState ?? longerThanTwo(initial),
        ];
        const model: Model = { staged: first, committed: first, shown: [first] };
        fc.modelRun(() => ({ model, real: { state, setValue, seen } }), sequence);
        unmount();
      },
    ),
  );
});
