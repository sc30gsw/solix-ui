import { afterEach, expect, test, vi } from "vite-plus/test";
import { fetchedJson } from "#/scripts/release-sources.ts";

const url = "https://registry.npmjs.org/a-package";
const shortTimeout = 50;

afterEach(() => {
  vi.unstubAllGlobals();
});

function answering(...answers: (() => Promise<Response>)[]) {
  const calls: (RequestInit | undefined)[] = [];
  vi.stubGlobal("fetch", (_: string, init?: RequestInit) => {
    calls.push(init);
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    return answer();
  });
  return calls;
}

const unreachable = () => {
  const failure = new TypeError("fetch failed");
  failure.cause = new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
  return Promise.reject(failure);
};
const unavailable = () => Promise.resolve(new Response("down", { status: 503 }));
const html = () => Promise.resolve(new Response("<html>maintenance</html>", { status: 200 }));
const json = () => Promise.resolve(Response.json({ name: "a-package" }));

function silentUntilAborted(_: string, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

test("a source that cannot be reached fails, after one retry, with its URL and the network's own error", async () => {
  const calls = answering(unreachable);

  await expect(fetchedJson(url, shortTimeout)).rejects.toThrow(
    `${url}: fetch failed (getaddrinfo ENOTFOUND registry.npmjs.org), on the first try and on the retry.`,
  );
  expect(calls).toHaveLength(2);
});

test("a source that answers with an error status fails, after one retry, with its URL and the status", async () => {
  const calls = answering(unavailable);

  await expect(fetchedJson(url, shortTimeout)).rejects.toThrow(
    `${url}: answered 503, on the first try and on the retry.`,
  );
  expect(calls).toHaveLength(2);
});

test("a source that answers with no JSON fails, after one retry, with its URL", async () => {
  answering(html);

  await expect(fetchedJson(url, shortTimeout)).rejects.toThrow(
    new RegExp(`^${url}: answered 200 with a body that is not JSON`),
  );
});

test("a source that does not answer within the timeout fails, after one retry, with its URL and the timeout", async () => {
  vi.stubGlobal("fetch", silentUntilAborted);

  await expect(fetchedJson(url, shortTimeout)).rejects.toThrow(
    `${url}: no answer within ${shortTimeout} ms, on the first try and on the retry.`,
  );
});

test("a source that fails once and then answers gives its answer, and each try carries its own timeout signal", async () => {
  const calls = answering(unavailable, json);

  await expect(fetchedJson(url, shortTimeout)).resolves.toEqual({ name: "a-package" });
  expect(calls).toHaveLength(2);
  expect(calls.every((init) => init?.signal instanceof AbortSignal)).toBe(true);
  expect(calls[0]?.signal).not.toBe(calls[1]?.signal);
});
