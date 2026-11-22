import { expect, test } from "vite-plus/test";
import { held, nowHolds, type SpecEntry, story } from "#/spec/format.ts";

const promise = { kind: "behaviour" } as const;
const check = story("Button", "Default");
const holding: SpecEntry = { says: "holds", promise, check, status: "holds" };
const pending: SpecEntry = {
  says: "pending",
  promise,
  check,
  status: "pending",
  until: "Button 1",
};
const broken = new Error("the check failed");

function passes(): void {}

function fails(): never {
  throw broken;
}

test("a holds entry passes when its check passes", async () => {
  await expect(held(holding, passes)).resolves.toBeUndefined();
});

test("a holds entry fails with its check's own error when the check fails", async () => {
  await expect(held(holding, fails)).rejects.toBe(broken);
});

test("a pending entry passes while its check fails", async () => {
  await expect(held(pending, fails)).resolves.toBeUndefined();
});

test(`a pending entry whose check passes fails with "${nowHolds}" and the item it waited for`, async () => {
  await expect(held(pending, passes)).rejects.toThrow(
    `${nowHolds}. "pending" is pending until Button 1, and its check passes.`,
  );
});

test("a check that rejects asynchronously counts as failing", async () => {
  await expect(held(pending, () => Promise.reject(broken))).resolves.toBeUndefined();
  await expect(held(holding, () => Promise.reject(broken))).rejects.toBe(broken);
});
