import { expect, test } from "vite-plus/test";
import { dom, held, nowHolds, type SpecEntry, SpecError } from "#/spec/format.ts";

const promise = { kind: "behaviour" } as const;
const check = dom({ component: "Button" }, () => undefined);
const holding: SpecEntry = { says: "holds", promise, check, status: "holds" };
const pending: SpecEntry = {
  says: "pending",
  promise,
  check,
  status: "pending",
  until: "Button 1",
  failsWith: "the feature is missing",
};
const missing = new Error("type: the feature is missing");
const wrongReason = new TypeError("Cannot read properties of undefined");
const wrongSpec = new SpecError("transform: scale(x) is not a value the engine takes");

function passes(): void {}

function throwing(error: Error): () => never {
  return () => {
    throw error;
  };
}

test("a holds entry passes when its check passes", async () => {
  await expect(held(holding, passes)).resolves.toBeUndefined();
});

test("a holds entry fails with its check's own error when the check fails", async () => {
  await expect(held(holding, throwing(missing))).rejects.toBe(missing);
});

test("a pending entry passes while its check fails with the reason it names", async () => {
  await expect(held(pending, throwing(missing))).resolves.toBeUndefined();
});

test("a pending entry whose check fails for another reason fails, naming the reason it expected", async () => {
  await expect(held(pending, throwing(wrongReason))).rejects.toThrow(
    '"pending" is pending until Button 1 and fails, but not with "the feature is missing": Cannot read properties of undefined',
  );
});

test(`a pending entry whose check passes fails with "${nowHolds}" and the item it waited for`, async () => {
  await expect(held(pending, passes)).rejects.toThrow(
    `${nowHolds}. "pending" is pending until Button 1, and its check passes.`,
  );
});

test("an error that says the spec is wrong fails a pending entry and a holds entry alike", async () => {
  await expect(held(pending, throwing(wrongSpec))).rejects.toBe(wrongSpec);
  await expect(held(holding, throwing(wrongSpec))).rejects.toBe(wrongSpec);
});

test("a check that rejects asynchronously counts as failing", async () => {
  await expect(held(pending, () => Promise.reject(missing))).resolves.toBeUndefined();
  await expect(held(holding, () => Promise.reject(missing))).rejects.toBe(missing);
});
