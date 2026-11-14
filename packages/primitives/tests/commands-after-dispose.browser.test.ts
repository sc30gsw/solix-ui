import { expect, test, vi } from "vite-plus/test";
import * as primitives from "../src/index";
import { mount, unmount } from "./support/browser-harness";
import { type Primitive, serialized, serverCases } from "./support/server-cases";

const withCommands = (Object.keys(serverCases) as Primitive[]).filter(
  (name) => serverCases[name].commands !== undefined,
);

test.each(withCommands)(
  "%s: once its owner is disposed, every command it returned writes nothing and calls nothing",
  (name) => {
    const { create, read, commands } = serverCases[name];
    const returned = mount(() => create(Reflect.get(primitives, String(name))));
    const before = serialized(read?.(returned as never));
    const scrolls = vi.spyOn(window, "scrollTo");
    const focuses = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      unmount();
      commands?.(returned as never);

      expect(serialized(read?.(returned as never))).toBe(before);
      expect([scrolls.mock.calls.length, focuses.mock.calls.length]).toEqual([0, 0]);
    } finally {
      scrolls.mockRestore();
      focuses.mockRestore();
    }
  },
);
