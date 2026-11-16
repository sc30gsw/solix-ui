import { expect, test } from "vite-plus/test";
import { builtComponents, library, renderBuilt } from "./built-library";

const whole = "Tabs";
const carried: Record<string, unknown> = Object.fromEntries(Object.entries(library.Tabs));
const exported: Record<string, unknown> = library;
const parts = builtComponents.filter((name) => name !== whole && name.startsWith(whole));

test("Tabs carries each component whose name starts with its own under the rest of that name, as List, Tab and Panel", () => {
  expect(parts.map((name) => name.slice(whole.length)).sort()).toEqual(["List", "Panel", "Tab"]);
  for (const name of parts) expect(carried[name.slice(whole.length)], name).toBe(exported[name]);
});

test.each(parts)("%s rendered outside Tabs throws an error that says where it belongs", (name) => {
  expect(() => renderBuilt(name, { value: "first" })).toThrow(/must be rendered inside Tabs\.$/);
});
