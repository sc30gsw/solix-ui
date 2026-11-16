import { expect, test } from "vite-plus/test";
import { browserMethod, lookUp } from "../src/internal-browser-api";

test("lookUp reads a member of an owner, and nothing where the owner or the member is missing", () => {
  const owner = { matchMedia: () => true };

  expect(lookUp(owner, "matchMedia")).toBe(owner.matchMedia);
  expect(lookUp<{ matchMedia?: () => boolean }, "matchMedia">({}, "matchMedia")).toBe(undefined);
  expect(lookUp<{ size: number }, "size">(null, "size")).toBe(undefined);
});

test("browserMethod gives a member function bound to its owner, and nothing where the owner or the method is missing", () => {
  const owner = {
    name: "owner",
    describe(suffix: string) {
      return `${this.name} ${suffix}`;
    },
    size: 1,
  };
  const describe = browserMethod(owner, "describe");

  expect(describe?.("bound")).toBe("owner bound");
  expect(browserMethod<{ describe?: () => string }, "describe">({}, "describe")).toBe(undefined);
  expect(browserMethod<typeof owner, "describe">(null, "describe")).toBe(undefined);
});
