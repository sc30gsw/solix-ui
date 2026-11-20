import { afterEach, expect } from "vite-plus/test";
import { consoleProblemsSinceLastAsked } from "#/tests/support/opening.ts";

afterEach(() => {
  expect(
    consoleProblemsSinceLastAsked(),
    "the console errors, warnings and page errors that the pages opened through opened reported during this test, or before it in a hook. Fix their cause, or give opened the message a page must report as reportsToTheConsole.",
  ).toEqual([]);
});
