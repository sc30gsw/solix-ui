import { expect, test } from "vite-plus/test";
import {
  type FunctionStatus,
  held,
  LookDiffers,
  type LookStatus,
  MissingError,
  nowHolds,
  SpecError,
} from "#/spec/format.ts";

const pinned: FunctionStatus = { until: "Button 1", fails: "type: expected null to be 'button'" };
const missingPart: FunctionStatus = { until: "Button 15", fails: { part: "inner" } };
const differs: LookStatus = { until: "Button 22", fails: "differs" };
const wrongSpec = new SpecError("transform: scale(x) is not a value the engine takes");
const innerMissing = new MissingError({ part: "inner" }, "Button: it renders no inner part.");

function passes(): void {}

function throwing(error: unknown): () => never {
  return () => {
    throw error;
  };
}

function assertionFailure(): () => void {
  return () => {
    expect(null, "type").toBe("button");
  };
}

test("a holds entry passes when its check passes", async () => {
  await expect(held("holds", "holds", passes)).resolves.toBeUndefined();
});

test("a holds entry fails with its check's own error when the check fails", async () => {
  await expect(held("holds", "holds", throwing(innerMissing))).rejects.toBe(innerMissing);
});

test("a pending entry pinned to an assertion passes while an assertion fails with a message that starts with the pin", async () => {
  await expect(held("pending", pinned, assertionFailure())).resolves.toBeUndefined();
});

test("a pending entry pinned to an assertion fails when a TypeError carries the pinned text", async () => {
  const carrying = new TypeError("type: expected null to be 'button'");

  await expect(held("pending", pinned, throwing(carrying))).rejects.toThrow(
    `"pending" is pending until Button 1 and fails, but not with "type: expected null to be 'button'": type: expected null to be 'button'`,
  );
});

test("a pending entry pinned to an assertion fails when the assertion fails with another message", async () => {
  const other = () => {
    expect("a", "type").toBe("button");
  };

  await expect(held("pending", pinned, other)).rejects.toThrow("but not with");
});

test("a pending entry pinned to a missing part passes on a MissingError for that part, and fails on one for another", async () => {
  const otherPart = new MissingError({ part: "label" }, "Button: it renders no label part.");

  await expect(held("pending", missingPart, throwing(innerMissing))).resolves.toBeUndefined();
  await expect(held("pending", missingPart, throwing(otherPart))).rejects.toThrow(
    `"pending" is pending until Button 15 and fails, but not with "it renders no inner part"`,
  );
});

test("a pending entry pinned to a missing part fails on an assertion that names the part", async () => {
  const naming = () => {
    expect("Button: it renders no inner part", "inner").toBe("");
  };

  await expect(held("pending", missingPart, naming)).rejects.toThrow("but not with");
});

test('a pending look pinned to "differs" passes on LookDiffers and fails on a MissingError', async () => {
  const differing = new LookDiffers("Button root, color: expected red, computed red; it is blue.");

  await expect(held("look", differs, throwing(differing))).resolves.toBeUndefined();
  await expect(held("look", differs, throwing(innerMissing))).rejects.toThrow("but not with");
});

test(`a pending entry whose check passes fails with "${nowHolds}" and the item it waited for`, async () => {
  await expect(held("pending", pinned, passes)).rejects.toThrow(
    `${nowHolds}. "pending" is pending until Button 1, and its check passes.`,
  );
});

test("an error that says the spec is wrong fails a pending entry and a holds entry alike", async () => {
  await expect(held("pending", pinned, throwing(wrongSpec))).rejects.toBe(wrongSpec);
  await expect(held("holds", "holds", throwing(wrongSpec))).rejects.toBe(wrongSpec);
});

test("a pin whose label before the colon is blank is a SpecError before its check runs", async () => {
  let ran = false;
  const blank: FunctionStatus = { until: "Button 1", fails: " : expected null" };

  await expect(
    held("blank", blank, () => {
      ran = true;
    }),
  ).rejects.toBeInstanceOf(SpecError);
  expect(ran).toBe(false);
});

test("a check that rejects asynchronously counts as failing", async () => {
  await expect(
    held("pending", missingPart, () => Promise.reject(innerMissing)),
  ).resolves.toBeUndefined();
  await expect(held("holds", "holds", () => Promise.reject(innerMissing))).rejects.toBe(
    innerMissing,
  );
});
