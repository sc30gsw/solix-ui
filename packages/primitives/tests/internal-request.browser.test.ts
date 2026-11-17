import { expect, test } from "vite-plus/test";
import { createRequest } from "#/src/internal-request.ts";
import { flush, mount } from "#/tests/support/browser-harness.ts";

test("a request for the value an earlier request in the same tick staged changes nothing, and the next tick starts afresh", () => {
  const request = mount(() => createRequest<string>());

  const seen = [request("a"), request("a"), request("b")];
  flush();
  seen.push(request("b"));
  expect(seen).toEqual([true, false, true, true]);
});
