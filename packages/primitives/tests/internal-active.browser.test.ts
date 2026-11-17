import { expect, test } from "vite-plus/test";
import { activePath } from "#/src/internal-active.ts";
import "#/tests/support/browser-harness.ts";
import { attached, button } from "#/tests/support/dom.ts";

test("activePath follows focus through open shadow roots and names each root on the way, and without deep it stops at the host", () => {
  const host = attached(document.createElement("div"));
  const root = host.attachShadow({ mode: "open" });
  const inner = button("inner", root);

  inner.focus();
  expect(activePath(document)).toEqual({ element: inner, roots: [root] });
  expect(activePath(document, false)).toEqual({ element: host, roots: [] });
});

test("activePath names a host's open root even when nothing inside it has focus", () => {
  const host = attached(document.createElement("div"));
  host.tabIndex = -1;
  const root = host.attachShadow({ mode: "open" });

  host.focus();
  expect(activePath(document)).toEqual({ element: host, roots: [root] });
});
