import fc from "fast-check";
import { createSignal, flush, type Setter } from "solid-js";
import { expect, expectTypeOf, test } from "vite-plus/test";
import {
  createUncontrolled,
  type UncontrolledOptions,
  type UncontrolledReturn,
} from "../src/index";
import { mount, unmount } from "./support/browser-harness";

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

test("requests before a flush resolve to the last one, and a request for the current value does nothing", () => {
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

type Model = {
  follows: boolean;
  committedOutside: string | undefined;
  stagedOutside: string | undefined;
  committedInside: string | undefined;
  stagedInside: string | undefined;
  requestThisTick: string | undefined;
  calls: Call[];
};

type Real = {
  primitive: UncontrolledReturn<string, [number], string | undefined>;
  setOutside: Setter<string | undefined>;
  calls: Call[];
};

const values = fc.constantFrom("a", "b", "c");

function expectAgreement(model: Model, real: Real): void {
  expect(real.calls, "the onChange calls").toEqual(model.calls);
}

class SetOutside implements fc.Command<Model, Real> {
  constructor(readonly next: string | undefined) {}
  check = () => true;
  run(model: Model, real: Real) {
    real.setOutside(this.next);
    model.stagedOutside = this.next;
    expectAgreement(model, real);
  }
  toString = () => `the consumer sets value to ${String(this.next)}`;
}

class Request implements fc.Command<Model, Real> {
  constructor(
    readonly next: string,
    readonly payload: number,
  ) {}
  check = () => true;
  run(model: Model, real: Real) {
    real.primitive[1](this.next, this.payload);
    if (model.committedOutside === undefined) {
      if (model.stagedInside !== this.next) {
        model.stagedInside = this.next;
        model.calls.push([this.next, this.payload]);
      }
    } else if (model.requestThisTick !== this.next) {
      model.requestThisTick = this.next;
      model.calls.push([this.next, this.payload]);
      if (model.follows) model.stagedOutside = this.next;
    }
    expectAgreement(model, real);
  }
  toString = () => `setValue(${this.next}, ${this.payload})`;
}

class Flush implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real) {
    flush();
    model.committedOutside = model.stagedOutside;
    model.committedInside = model.stagedInside;
    model.requestThisTick = undefined;
    const [value, , controlled] = real.primitive;
    expect(value(), "the value after the flush").toBe(
      model.committedOutside ?? model.committedInside,
    );
    expect(controlled(), "controlled after the flush").toBe(model.committedOutside !== undefined);
    expectAgreement(model, real);
  }
  toString = () => "flush";
}

const commands = [
  fc.option(values, { nil: undefined }).map((next) => new SetOutside(next)),
  fc.tuple(values, fc.nat(3)).map(([next, payload]) => new Request(next, payload)),
  fc.constant(new Flush()),
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
        const inside = start.defaultValue ?? start.finalValue;
        const model: Model = {
          follows: start.follows,
          committedOutside: start.outside,
          stagedOutside: start.outside,
          committedInside: inside,
          stagedInside: inside,
          requestThisTick: undefined,
          calls: [],
        };
        fc.modelRun(() => ({ model, real: { primitive, setOutside, calls } }), sequence);
        unmount();
      },
    ),
  );
});
