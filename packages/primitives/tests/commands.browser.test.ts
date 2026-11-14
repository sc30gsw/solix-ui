import { createRoot } from "solid-js";
import { expect, test, vi } from "vite-plus/test";
import * as primitives from "../src/index";
import { flush, mount, unmount } from "./support/browser-harness";
import { type Primitive, serialized, serverCases } from "./support/server-cases";

const names = Object.keys(serverCases) as Primitive[];
const withStateCommands = names.filter((name) => serverCases[name].stateCommands !== undefined);
const withCommands = names.filter(
  (name) =>
    serverCases[name].stateCommands !== undefined ||
    serverCases[name].browserCommands !== undefined,
);

test.each(withStateCommands)(
  "%s: a state command called after the owner is created and before its effects run changes the value",
  (name) => {
    const { create, read, stateCommands, afterStateCommands } = serverCases[name];
    const created = createRoot((dispose) => ({
      returned: create(Reflect.get(primitives, String(name))),
      dispose,
    }));
    try {
      stateCommands?.(created.returned as never);
      flush();

      expect(read?.(created.returned as never)).toEqual(afterStateCommands);
    } finally {
      created.dispose();
    }
  },
);

test.each(withCommands)(
  "%s: once its owner is disposed, every state and browser command it returned writes nothing and calls nothing",
  (name) => {
    const { create, read, stateCommands, browserCommands } = serverCases[name];
    const returned = mount(() => create(Reflect.get(primitives, String(name))));
    const before = serialized(read?.(returned as never));
    const scrolls = vi.spyOn(window, "scrollTo");
    const focuses = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      unmount();
      stateCommands?.(returned as never);
      browserCommands?.(returned as never);

      expect(serialized(read?.(returned as never))).toBe(before);
      expect([scrolls.mock.calls.length, focuses.mock.calls.length]).toEqual([0, 0]);
    } finally {
      scrolls.mockRestore();
      focuses.mockRestore();
    }
  },
);
