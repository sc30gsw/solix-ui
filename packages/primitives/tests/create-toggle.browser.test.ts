import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import { createToggle, type ToggleReturn } from "../src/index";
import { flush, mount, unmount, watch } from "./support/browser-harness";
import { command, flushCommand, type Tick } from "./support/model";

test("by default it starts at false and each toggle flips it", () => {
  const [value, toggle] = mount(() => createToggle());

  expect(value()).toBe(false);
  toggle();
  flush();
  expect(value()).toBe(true);
  toggle();
  flush();
  expect(value()).toBe(false);
});

test("with three options it starts at the first, advances, and wraps after the last", () => {
  const [value, toggle] = mount(() => createToggle(["a", "b", "c"]));
  const seen: string[] = [value()];

  for (let step = 0; step < 3; step += 1) {
    toggle();
    flush();
    seen.push(value());
  }
  expect(seen).toEqual(["a", "b", "c", "a"]);
});

test("toggle with an option moves to it, and the next toggle continues from there", () => {
  const [value, toggle] = mount(() => createToggle(["a", "b", "c"]));

  toggle("c");
  flush();
  expect(value()).toBe("c");
  toggle();
  flush();
  expect(value()).toBe("a");
});

test("toggle with an updater moves to the option it returns for the current value", () => {
  const [value, toggle] = mount(() => createToggle(["a", "b", "c"]));
  const received: string[] = [];

  toggle((current) => {
    received.push(current);
    return "b";
  });
  flush();
  expect(received).toEqual(["a"]);
  expect(value()).toBe("b");
});

test("a value that is not an option, or the current one, changes nothing", () => {
  const { toggle, seen } = mount(() => {
    const [value, toggle] = createToggle(["a", "b"]);
    return { toggle, seen: watch(value) };
  });

  toggle("z");
  toggle("a");
  flush();
  expect(seen).toEqual(["a"]);
});

test("each request decides on the value staged by the requests before it in the same tick, so two toggles of two options end where they started", () => {
  const { toggle, seen } = mount(() => {
    const [value, toggle] = createToggle();
    return { toggle, seen: watch(value) };
  });

  toggle();
  toggle();
  flush();
  expect(seen).toEqual([false]);
});

test("the options are read once", () => {
  const options = ["a", "b"];
  const [value, toggle] = mount(() => createToggle(options));

  options.push("c");
  toggle();
  toggle();
  flush();
  expect(value()).toBe("a");
});

test("with no options its value is undefined and toggle does nothing", () => {
  const [value, toggle] = mount(() => createToggle<string>([]));

  toggle();
  flush();
  expect(value()).toBeUndefined();
});

type Model = Tick<number> & { options: string[]; received: string[] };
type Real = { primitive: ToggleReturn<string>; received: string[] };

const letters = fc.constantFrom("a", "b", "c", "d", "e");

function moveTo(model: Model, option: string): void {
  const found = model.options.indexOf(option);
  if (found !== -1) model.staged = found;
}

const commands = [
  fc.constant(
    command<Model, Real>("toggle()", (model, real) => {
      real.primitive[1]();
      model.staged = (model.staged + 1) % model.options.length;
    }),
  ),
  letters.map((option) =>
    command<Model, Real>(`toggle("${option}")`, (model, real) => {
      real.primitive[1](option);
      moveTo(model, option);
    }),
  ),
  letters.map((option) =>
    command<Model, Real>(`toggle(() => "${option}")`, (model, real) => {
      real.primitive[1]((current) => {
        real.received.push(current);
        return option;
      });
      model.received.push(model.options[model.staged]);
      moveTo(model, option);
      expect(real.received, "the values the updaters received").toEqual(model.received);
    }),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      expect(real.primitive[0](), "the value after the flush").toBe(model.options[model.committed]);
    }),
  ),
];

test("for every generated sequence of toggles and flushes, it agrees with a model of the option it is at", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(letters, { minLength: 1, maxLength: 5 }),
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (options, sequence) => {
        const received: string[] = [];
        const primitive = mount(() => createToggle<string>(options));
        const model: Model = { options, staged: 0, committed: 0, received: [] };
        fc.modelRun(() => ({ model, real: { primitive, received } }), sequence);
        unmount();
      },
    ),
  );
});
