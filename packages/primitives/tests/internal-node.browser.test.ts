import { expect, test } from "vite-plus/test";
import {
  isDocument,
  isElement,
  isEvent,
  isHtmlElement,
  isHtmlOrSvgElement,
  isInputOfType,
  isNode,
  isShadowRoot,
  viewOf,
} from "#/src/internal-node.ts";
import "#/tests/support/browser-harness.ts";
import { attached, box } from "#/tests/support/dom.ts";

function framed(): Document {
  const frame = attached(document.createElement("iframe"));
  const page = frame.contentDocument;
  if (!page) throw new Error("the frame has no document");
  return page;
}

test("each check tells nodes apart by what they are, for a node of a frame's page too", () => {
  const page = framed();
  const svg = page.createElementNS("http://www.w3.org/2000/svg", "svg");
  const math = page.createElementNS("http://www.w3.org/1998/Math/MathML", "math");
  const checkbox = page.createElement("input");
  checkbox.type = "checkbox";
  const root = page.createElement("div").attachShadow({ mode: "open" });

  expect([isNode(page), isNode({ nodeType: "1" }), isNode(null)]).toEqual([true, false, false]);
  expect([isElement(svg), isElement(page.createTextNode("text"))]).toEqual([true, false]);
  expect([isHtmlElement(checkbox), isHtmlElement(svg)]).toEqual([true, false]);
  expect([isHtmlOrSvgElement(svg), isHtmlOrSvgElement(math)]).toEqual([true, false]);
  expect([isDocument(page), isDocument(root), isShadowRoot(root)]).toEqual([true, false, true]);
  expect([isInputOfType(checkbox, "checkbox"), isInputOfType(checkbox, "radio")]).toEqual([
    true,
    false,
  ]);
  expect([isEvent(new (page.defaultView ?? window).Event("ping")), isEvent({})]).toEqual([
    true,
    false,
  ]);
});

test("viewOf gives the window of a node's page, and of a page itself", () => {
  const page = framed();

  expect(viewOf(box("here"))).toBe(window);
  expect(viewOf(document)).toBe(window);
  expect(viewOf(page.body)).toBe(page.defaultView);
  expect(viewOf(document.implementation.createHTMLDocument("detached"))).toBe(null);
});
