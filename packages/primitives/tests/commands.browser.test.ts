import { createRoot } from "solid-js";
import { expect, test, vi } from "vite-plus/test";
import { type Primitive, serialized, serverCases, startCase } from "#/fixtures/server-cases.ts";
import * as primitives from "#/src/index.ts";
import { flush, mount, unmount } from "#/tests/support/browser-harness.ts";

const names = Object.keys(serverCases) as Primitive[];

const withStateCommands = names.filter((name) => serverCases[name].has.stateCommands);
const withCommands = names.filter(
  (name) => serverCases[name].has.stateCommands || serverCases[name].has.browserCommands,
);

test.each(withStateCommands)(
  "%s: a state command called after the owner is created and before its effects run changes the value",
  (name) => {
    const created = createRoot((dispose) => ({ started: startCase(name, primitives), dispose }));
    try {
      created.started.stateCommands?.run();
      flush();

      expect(created.started.value?.read()).toEqual(created.started.stateCommands?.after);
    } finally {
      created.dispose();
    }
  },
);

test.each(withCommands)(
  "%s: once its owner is disposed, every state and browser command its case names writes nothing and calls nothing",
  (name) => {
    const { value, stateCommands, browserCommands } = mount(() => startCase(name, primitives));
    const before = serialized(value?.read());
    const scrolls = vi.spyOn(window, "scrollTo");
    const focuses = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      unmount();
      stateCommands?.run();
      browserCommands?.();

      expect(serialized(value?.read())).toBe(before);
      expect([scrolls.mock.calls.length, focuses.mock.calls.length]).toEqual([0, 0]);
    } finally {
      scrolls.mockRestore();
      focuses.mockRestore();
    }
  },
);
