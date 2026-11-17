import { expect, test } from "vite-plus/test";
import { activeElementOf, containsComposed, deepActiveElement } from "#/src/internal-active.ts";
import { focusFirst, isFocusTarget, moveFocus } from "#/src/internal-focus.ts";
import "#/tests/support/browser-harness.ts";
import { attached, button, html } from "#/tests/support/dom.ts";

test("moveFocus focuses an element and confirms it holds focus, and an element that does not take it is not confirmed", () => {
  const region = html(
    `<div><a id="link">No href</a><button id="off" disabled>Off</button><button id="on">On</button></div>`,
  );
  const [link, off, on] = [...region.children].filter(isFocusTarget);

  expect([moveFocus(link), moveFocus(off), moveFocus(on)]).toEqual([false, false, true]);
  expect(document.activeElement).toBe(on);
});

test("focusFirst focuses the first candidate that takes focus and passes over the others", () => {
  const region = html(
    `<div><a>No href</a><button disabled>Off</button><button id="on">On</button></div>`,
  );

  expect(focusFirst([...region.children].filter(isFocusTarget))?.id).toBe("on");
  expect(focusFirst([region.children[0]].filter(isFocusTarget))).toBeUndefined();
});

test("inside a shadow root, open or closed, the root's own active element confirms the focus, and the deep active element is found through open roots", () => {
  const seen: unknown[] = [];
  for (const mode of ["open", "closed"] as const) {
    const host = attached(document.createElement("div"));
    const inner = button(`inner ${mode}`, host.attachShadow({ mode }));

    seen.push(moveFocus(inner), activeElementOf(inner) === inner, document.activeElement === host);
    seen.push(deepActiveElement(document) === (mode === "open" ? inner : host));
    seen.push(containsComposed(host, inner), containsComposed(inner, host));
  }
  expect(seen).toEqual([true, true, true, true, true, false, true, true, true, true, true, false]);
});
