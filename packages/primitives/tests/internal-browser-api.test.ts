import { expect, test } from "vite-plus/test";
import { lookUp, whereAllowed } from "../src/internal-browser-api";

test("lookUp reads a member of an owner, and nothing where the owner or the member is missing", () => {
  const owner = { matchMedia: () => true };

  expect(lookUp(owner, "matchMedia")).toBe(owner.matchMedia);
  expect(lookUp<{ matchMedia?: () => boolean }, "matchMedia">({}, "matchMedia")).toBe(undefined);
  expect(lookUp<{ size: number }, "size">(null, "size")).toBe(undefined);
});

test("whereAllowed turns only a SecurityError into what it is given, after the cleanup, and rethrows any other error after it", () => {
  const seen: string[] = [];
  const cleanup = () => seen.push("cleanup");
  const blocked = () => "blocked";
  const securityError = Object.assign(new Error("blocked"), { name: "SecurityError" });

  expect(whereAllowed(() => "ran", blocked, cleanup)).toBe("ran");
  expect(
    whereAllowed(
      () => {
        throw securityError;
      },
      blocked,
      cleanup,
    ),
  ).toBe("blocked");
  expect(() =>
    whereAllowed(
      () => {
        throw new TypeError("a bug");
      },
      blocked,
      cleanup,
    ),
  ).toThrow(TypeError);
  expect(seen).toEqual(["cleanup", "cleanup"]);
});
