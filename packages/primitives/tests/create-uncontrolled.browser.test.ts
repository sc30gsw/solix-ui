import fc from "fast-check";
import { createSignal, flush, type Setter } from "solid-js";
import { expect, expectTypeOf, test } from "vite-plus/test";
import {
  createUncontrolled,
  type UncontrolledOptions,
  type UncontrolledReturn,
} from "../src/index";
import { mount, unmount } from "./support/browser-harness";
import { command, flushCommand, type Tick } from "./support/model";

type Call = [value: string, payload: number];

test("uncontrolled, it starts at defaultValue, writes each request, then calls onChange with the payload", () => {
  const calls: Call[] = [];
  const [value, setValue, controlled] = mount(() =>
    createUncontrolled<string, [number]>({
      defaultValue: "a",
      finalValue: "z",
      onChange: (next, payload) => calls.push([next, payload]),
    }),
  );

  expect([value(), controlled()]).toEqual(["a", false]);
  setValue("b", 1);
  expect(calls).toEqual([["b", 1]]);
  flush();
  expect(value()).toBe("b");
});

test("without defaultValue it starts at finalValue, and without either at undefined", () => {
  const [withFinal] = mount(() => createUncontrolled({ finalValue: "final" }));
  const [withNothing] = mount(() => createUncontrolled<string>({}));

  expect(withFinal()).toBe("final");
  expect(withNothing()).toBeUndefined();
});

test("defaultValue and finalValue are read once", () => {
  const [initial, setInitial] = createSignal("first");
  const [value] = mount(() => createUncontrolled({ defaultValue: initial, finalValue: initial }));

  setInitial("second");
  flush();
  expect(value()).toBe("first");
});

test("controlled, it shows value, writes nothing, and leaves the change to onChange", () => {
  const calls: Call[] = [];
  const [outside] = createSignal<string | undefined>("outside");
  const [value, setValue, controlled] = mount(() =>
    createUncontrolled<string, [number]>({
      value: outside,
      defaultValue: "inside",
      onChange: (next, payload) => calls.push([next, payload]),
    }),
  );

  expect([value(), controlled()]).toEqual(["outside", true]);
  setValue("request", 7);
  flush();
  expect(calls).toEqual([["request", 7]]);
  expect(value()).toBe("outside");
});

test("switching to controlled and back keeps the uncontrolled value", () => {
  const [outside, setOutside] = createSignal<string | undefined>(undefined);
  const [value, setValue, controlled] = mount(() =>
    createUncontrolled({ value: outside, defaultValue: "kept" }),
  );

  setOutside("outside");
  flush();
  expect([value(), controlled()]).toEqual(["outside", true]);
  setValue("ignored");
  setOutside(undefined);
  flush();
  expect([value(), controlled()]).toEqual(["kept", false]);
});

test("uncontrolled, each request decides on the value staged by the requests before it in the same tick, and a request for the value it would replace writes nothing and calls nothing", () => {
  const calls: string[] = [];
  const [value, setValue] = mount(() =>
    createUncontrolled({ defaultValue: "a", onChange: (next: string) => calls.push(next) }),
  );

  setValue("a");
  expect(calls).toEqual([]);
  setValue("b");
  setValue("b");
  setValue("a");
  flush();
  expect(value()).toBe("a");
  expect(calls).toEqual(["b", "a"]);
});

test("controlled, a request reaches onChange unless the request before it in the same tick asked for the same value", () => {
  const calls: string[] = [];
  const [outside, setOutside] = createSignal<string | undefined>("a");
  const [value, setValue] = mount(() =>
    createUncontrolled({
      value: outside,
      onChange: (next: string) => {
        calls.push(next);
        setOutside(next);
      },
    }),
  );

  setValue("a");
  setValue("b");
  setValue("b");
  setValue("a");
  flush();
  expect(calls).toEqual(["a", "b", "a"]);
  expect(value()).toBe("a");
});

test("controlled, a request for the committed value reaches onChange after the consumer wrote another value in the same tick", () => {
  const calls: string[] = [];
  const [outside, setOutside] = createSignal<string | undefined>("a");
  const [value, setValue] = mount(() =>
    createUncontrolled({
      value: outside,
      onChange: (next: string) => {
        calls.push(next);
        setOutside(next);
      },
    }),
  );

  setOutside("b");
  setValue("a");
  flush();
  expect(calls).toEqual(["a"]);
  expect(value()).toBe("a");
});

test("controlled, a request the consumer refused can be made again", () => {
  const calls: string[] = [];
  const [value, setValue] = mount(() =>
    createUncontrolled({ value: () => "fixed", onChange: (next: string) => calls.push(next) }),
  );

  setValue("other");
  flush();
  setValue("other");
  flush();
  expect(calls).toEqual(["other", "other"]);
  expect(value()).toBe("fixed");
});

test("after its owner is disposed, a request writes nothing and calls no onChange, controlled or not", () => {
  const calls: string[] = [];
  const onChange = (next: string) => calls.push(next);
  const [uncontrolled, setUncontrolled] = mount(() =>
    createUncontrolled({ defaultValue: "a", onChange }),
  );
  const [, setControlled] = mount(() => createUncontrolled({ value: () => "a", onChange }));

  unmount();
  setUncontrolled("b");
  setControlled("b");
  flush();
  expect(calls).toEqual([]);
  expect(uncontrolled()).toBe("a");
});

test("the controlled value is an accessor, so value: props.value does not type-check", () => {
  type Props = { value?: string };

  expectTypeOf<{ value: Props["value"] }>().not.toExtend<UncontrolledOptions<string>>();
  expectTypeOf<{ value: () => Props["value"] }>().toExtend<UncontrolledOptions<string>>();
});

test("setValue takes a value, never undefined, with or without finalValue", () => {
  const [withFinal, setWithFinal] = mount(() => createUncontrolled({ finalValue: "" }));
  const [withoutFinal, setWithoutFinal] = mount(() => createUncontrolled<string>({}));

  expectTypeOf(withFinal).returns.toEqualTypeOf<string>();
  expectTypeOf(withoutFinal).returns.toEqualTypeOf<string | undefined>();
  expectTypeOf(setWithFinal).parameter(0).toEqualTypeOf<string>();
  expectTypeOf(setWithoutFinal).parameter(0).toEqualTypeOf<string>();
});

test("onChange is read when a request is made, so the latest one runs", () => {
  const calls: string[] = [];
  const options = {
    defaultValue: "a",
    onChange: (next: string) => calls.push(`first ${next}`),
  };
  const [, setValue] = mount(() => createUncontrolled(options));

  options.onChange = (next) => calls.push(`second ${next}`);
  setValue("b");
  expect(calls).toEqual(["second b"]);
});

type Values = { outside: string | undefined; inside: string | undefined };
type Model = Tick<Values> & {
  follows: boolean;
  requestThisTick: string | undefined;
  calls: Call[];
};
type Real = {
  primitive: UncontrolledReturn<string, [number], string | undefined>;
  setOutside: Setter<string | undefined>;
  calls: Call[];
};

const values = fc.constantFrom("a", "b", "c");

const commands = [
  fc.option(values, { nil: undefined }).map((next) =>
    command<Model, Real>(`the consumer sets value to ${String(next)}`, (model, real) => {
      real.setOutside(next);
      model.staged = { ...model.staged, outside: next };
      expect(real.calls, "the onChange calls").toEqual(model.calls);
    }),
  ),
  fc.tuple(values, fc.nat(3)).map(([next, payload]) =>
    command<Model, Real>(`setValue(${next}, ${payload})`, (model, real) => {
      real.primitive[1](next, payload);
      if (model.committed.outside === undefined) {
        if (model.staged.inside !== next) {
          model.staged = { ...model.staged, inside: next };
          model.calls.push([next, payload]);
        }
      } else if (model.requestThisTick !== next) {
        model.requestThisTick = next;
        model.calls.push([next, payload]);
        if (model.follows) model.staged = { ...model.staged, outside: next };
      }
      expect(real.calls, "the onChange calls").toEqual(model.calls);
    }),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      model.requestThisTick = undefined;
      const [value, , controlled] = real.primitive;
      expect(value(), "the value after the flush").toBe(
        model.committed.outside ?? model.committed.inside,
      );
      expect(controlled(), "controlled after the flush").toBe(
        model.committed.outside !== undefined,
      );
    }),
  ),
];

test("for every generated sequence of requests, consumer writes and flushes, it agrees with a model of the two values", () => {
  fc.assert(
    fc.property(
      fc.record({
        follows: fc.boolean(),
        outside: fc.option(values, { nil: undefined }),
        defaultValue: fc.option(values, { nil: undefined }),
        finalValue: fc.option(values, { nil: undefined }),
      }),
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (start, sequence) => {
        const calls: Call[] = [];
        const [outside, setOutside] = createSignal<string | undefined>(start.outside);
        const primitive = mount(() =>
          createUncontrolled<string, [number]>({
            value: outside,
            defaultValue: start.defaultValue,
            finalValue: start.finalValue,
            onChange: (next, payload) => {
              calls.push([next, payload]);
              const controlling = outside();
              if (start.follows && controlling !== undefined) setOutside(next);
            },
          }),
        );
        const first = { outside: start.outside, inside: start.defaultValue ?? start.finalValue };
        const model: Model = {
          follows: start.follows,
          staged: first,
          committed: first,
          requestThisTick: undefined,
          calls: [],
        };
        fc.modelRun(() => ({ model, real: { primitive, setOutside, calls } }), sequence);
        unmount();
      },
    ),
  );
});
