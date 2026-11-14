import fc from "fast-check";
import { createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createDisclosure, type DisclosureHandlers } from "../src/index";
import { mount, unmount, watch } from "./support/browser-harness";

function recording() {
  const calls: string[] = [];
  return {
    calls,
    options: { onOpen: () => calls.push("open"), onClose: () => calls.push("close") },
  };
}

test("it starts closed by default, or at initialState", () => {
  const [closed] = mount(() => createDisclosure());
  const [opened] = mount(() => createDisclosure(true));

  expect([closed(), opened()]).toEqual([false, true]);
});

test("open and close run their callback only when they change the state", () => {
  const { calls, options } = recording();
  const [opened, { open, close }] = mount(() => createDisclosure(false, options));

  open();
  flush();
  open();
  flush();
  expect(opened()).toBe(true);
  close();
  flush();
  close();
  flush();
  expect(opened()).toBe(false);
  expect(calls).toEqual(["open", "close"]);
});

test("toggle runs the callbacks too: open, close, open runs onOpen twice and onClose once", () => {
  const { calls, options } = recording();
  const [, { toggle }] = mount(() => createDisclosure(false, options));

  toggle();
  flush();
  toggle();
  flush();
  toggle();
  flush();
  expect(calls).toEqual(["open", "close", "open"]);
});

test("set writes the state and runs neither callback", () => {
  const { calls, options } = recording();
  const [opened, { set }] = mount(() => createDisclosure(false, options));

  set(true);
  flush();
  expect(opened()).toBe(true);
  set(false);
  flush();
  expect(calls).toEqual([]);
});

test("before a flush, open twice runs onOpen once, and toggle twice ends where it started", () => {
  const { calls, options } = recording();
  const { handlers, seen } = mount(() => {
    const [opened, handlers] = createDisclosure(false, options);
    return { handlers, seen: watch(opened) };
  });

  handlers.open();
  handlers.open();
  expect(calls).toEqual(["open"]);
  handlers.toggle();
  handlers.toggle();
  flush();
  expect(seen).toEqual([false, true]);
});

test("a callback runs after the write, so a close inside onOpen closes again", () => {
  const calls: string[] = [];
  const { opened, handlers } = mount(() => {
    const [opened, handlers] = createDisclosure(false, {
      onOpen: () => {
        calls.push("open");
        handlers.close();
      },
      onClose: () => calls.push("close"),
    });
    return { opened, handlers };
  });

  handlers.open();
  flush();
  expect(calls).toEqual(["open", "close"]);
  expect(opened()).toBe(false);
});

test("the callbacks are read when they run, and initialState is read once", () => {
  const calls: string[] = [];
  const [initial, setInitial] = createSignal(false);
  const options = { onOpen: () => calls.push("first") };
  const [opened, { open }] = mount(() => createDisclosure(initial, options));

  options.onOpen = () => calls.push("second");
  setInitial(true);
  flush();
  expect(opened()).toBe(false);
  open();
  expect(calls).toEqual(["second"]);
});

type Model = { staged: boolean; committed: boolean; calls: string[] };
type Real = { opened: () => boolean; handlers: DisclosureHandlers; calls: string[] };

function transition(model: Model, next: boolean): void {
  if (model.staged === next) return;
  model.staged = next;
  model.calls.push(next ? "open" : "close");
}

class Open implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real) {
    real.handlers.open();
    transition(model, true);
    expect(real.calls, "the callbacks that ran").toEqual(model.calls);
  }
  toString = () => "open()";
}

class Close implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real) {
    real.handlers.close();
    transition(model, false);
    expect(real.calls, "the callbacks that ran").toEqual(model.calls);
  }
  toString = () => "close()";
}

class Toggle implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real) {
    real.handlers.toggle();
    transition(model, !model.staged);
    expect(real.calls, "the callbacks that ran").toEqual(model.calls);
  }
  toString = () => "toggle()";
}

class SetOpened implements fc.Command<Model, Real> {
  constructor(readonly opened: boolean) {}
  check = () => true;
  run(model: Model, real: Real) {
    real.handlers.set(this.opened);
    model.staged = this.opened;
    expect(real.calls, "the callbacks that ran").toEqual(model.calls);
  }
  toString = () => `set(${this.opened})`;
}

class Flush implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real) {
    flush();
    model.committed = model.staged;
    expect(real.opened(), "opened after the flush").toBe(model.committed);
  }
  toString = () => "flush";
}

const commands = [
  fc.constant(new Open()),
  fc.constant(new Close()),
  fc.constant(new Toggle()),
  fc.boolean().map((opened) => new SetOpened(opened)),
  fc.constant(new Flush()),
];

test("for every generated sequence of commands and flushes, it agrees with a model of open and closed and its callbacks", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initial, sequence) => {
        const { calls, options } = recording();
        const [opened, handlers] = mount(() => createDisclosure(initial, options));
        const model: Model = { staged: initial, committed: initial, calls: [] };
        fc.modelRun(() => ({ model, real: { opened, handlers, calls } }), sequence);
        unmount();
      },
    ),
  );
});
