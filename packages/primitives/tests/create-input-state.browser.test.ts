import fc from "fast-check";
import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { createInputState, type InputChange } from "../src/index";
import { attached, flush, mount, unmount, watch } from "./support/browser-harness";
import { command, flushCommand, type Tick } from "./support/model";

test("it stores a value, and an empty string, 0, false, null and undefined as they are", () => {
  const [value, onChange] = mount(() => createInputState<unknown>("start"));
  const stored: unknown[] = [];

  for (const next of ["text", "", 0, false, null, undefined]) {
    onChange(next);
    flush();
    stored.push(value());
  }
  expect(stored).toEqual(["text", "", 0, false, null, undefined]);
});

test("it stores what an updater returns for the current value", () => {
  const [value, onChange] = mount(() => createInputState(1));

  onChange((current) => current + 1);
  onChange((current) => current * 10);
  flush();
  expect(value()).toBe(20);
});

test("given the input event of a text field, it stores the field's value", async () => {
  const [value, onChange] = mount(() => createInputState(""));
  const field = attached(document.createElement("input"), "input", onChange);

  await userEvent.type(field, "solid");
  flush();
  expect(value()).toBe("solid");
});

test("given the change event of a checkbox, it stores whether it is checked", async () => {
  const [value, onChange] = mount(() => createInputState(false));
  const checkbox = attached(document.createElement("input"), "change", onChange);
  checkbox.type = "checkbox";

  await userEvent.click(checkbox);
  flush();
  expect(value()).toBe(true);
  await userEvent.click(checkbox);
  flush();
  expect(value()).toBe(false);
});

test("given the change event of a select, it stores the selected value", async () => {
  const [value, onChange] = mount(() => createInputState("a"));
  const select = attached(document.createElement("select"), "change", onChange);
  select.append(new Option("A", "a"), new Option("B", "b"));

  await userEvent.selectOptions(select, "b");
  flush();
  expect(value()).toBe("b");
});

test("given an event after its dispatch, it reads the control from the target", () => {
  const [value, onChange] = mount(() => createInputState(""));
  const field = document.createElement("input");
  const event = new Event("input");

  field.value = "late";
  field.dispatchEvent(event);
  onChange(event);
  flush();
  expect(value()).toBe("late");
});

test("each request decides on the value staged by the requests before it in the same tick, one that changes nothing writes nothing, and the initial value is read once", () => {
  const [initial, setInitial] = createSignal("first");
  const { onChange, seen } = mount(() => {
    const [value, onChange] = createInputState(initial);
    return { onChange, seen: watch(value) };
  });

  setInitial("changed");
  onChange("b");
  onChange("first");
  flush();
  onChange("c");
  flush();
  expect(seen).toEqual(["first", "c"]);
});

type Stored = string | number;
type Model = Tick<Stored> & { shown: Stored[] };
type Real = {
  value: () => Stored;
  onChange: (next: InputChange<Stored>) => void;
  field: HTMLInputElement;
  seen: Stored[];
};

const stored = fc.constantFrom<Stored>("", "a", 0, 1);
const typed = fc.constantFrom("", "a", "ab");

function bumped(current: Stored): Stored {
  return typeof current === "number" ? current + 1 : `${current}!`;
}

const commands = [
  stored.map((next) =>
    command<Model, Real>(`onChange(${JSON.stringify(next)})`, (model, real) => {
      real.onChange(next);
      model.staged = next;
    }),
  ),
  fc.constant(
    command<Model, Real>("onChange(bumped)", (model, real) => {
      real.onChange(bumped);
      model.staged = bumped(model.staged);
    }),
  ),
  typed.map((text) =>
    command<Model, Real>(`an input event from a field holding "${text}"`, (model, real) => {
      real.field.value = text;
      real.field.dispatchEvent(new Event("input"));
      model.staged = text;
    }),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      if (!Object.is(model.shown[model.shown.length - 1], model.committed)) {
        model.shown.push(model.committed);
      }
      expect(real.value(), "the value after the flush").toBe(model.committed);
      expect(real.seen, "every value the accessor showed").toEqual(model.shown);
    }),
  ),
];

test("for every generated sequence of values, updaters, input events and flushes, it agrees with a model of the value", () => {
  fc.assert(
    fc.property(
      stored,
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initial, sequence) => {
        const { value, onChange, seen } = mount(() => {
          const [value, onChange] = createInputState<Stored>(initial);
          return { value, onChange, seen: watch(value) };
        });
        const field = attached(document.createElement("input"), "input", onChange);
        const model: Model = { staged: initial, committed: initial, shown: [initial] };
        fc.modelRun(() => ({ model, real: { value, onChange, field, seen } }), sequence);
        field.remove();
        unmount();
      },
    ),
  );
});
