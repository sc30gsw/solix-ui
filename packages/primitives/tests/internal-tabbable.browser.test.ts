import { expect, test } from "vite-plus/test";
import { initialFocusCandidates, tabStopCandidates } from "../src/internal-tabbable";
import "./support/browser-harness";
import { html } from "./support/dom";

function ids(elements: readonly Element[]): string[] {
  return elements.map((element) => element.id);
}

test("the tab stop candidates come in the browser's order: positive tabindex ascending, then the rest in tree order, skipping disabled, inert, hidden and tabindex -1 elements", () => {
  const region = html(`<div>
    <button id="zero-a">Zero A</button>
    <button id="two" tabindex="2">Two</button>
    <button id="disabled" disabled>Disabled</button>
    <div inert><button id="inert">Inert</button></div>
    <button id="hidden" hidden>Hidden</button>
    <div style="visibility: hidden"><button id="invisible">Invisible</button></div>
    <details><summary id="summary" tabindex="0">More</summary><button id="closed">Closed</button></details>
    <button id="minus" tabindex="-1">Minus</button>
    <button id="one" tabindex="1">One</button>
    <div id="editor" contenteditable>Editor</div>
    <div id="zero-b" tabindex="0">Zero B</div>
  </div>`);

  expect(ids(tabStopCandidates(region, false))).toEqual([
    "one",
    "two",
    "zero-a",
    "summary",
    "editor",
    "zero-b",
  ]);
  expect(ids(tabStopCandidates(region, true))).toEqual(
    ids(tabStopCandidates(region, false)).reverse(),
  );
});

test("a radio group is one candidate: the checked radio, or with none checked the first going forwards and the last going backwards", () => {
  const region = html(`<div>
    <input type="radio" name="size" id="small" aria-label="Small">
    <input type="radio" name="size" id="large" aria-label="Large">
    <input type="radio" name="tone" id="light" aria-label="Light">
    <input type="radio" name="tone" id="dark" aria-label="Dark" checked>
  </div>`);

  expect([ids(tabStopCandidates(region, false)), ids(tabStopCandidates(region, true))]).toEqual([
    ["small", "dark"],
    ["dark", "large"],
  ]);
});

test("the content of an open shadow root follows its host", () => {
  const region = html(`<div><div id="host"></div><button id="after">After</button></div>`);
  const shadow = region.children[0].attachShadow({ mode: "open" });
  shadow.innerHTML = `<button id="inner">Inner</button>`;

  expect(ids(tabStopCandidates(region, false))).toEqual(["inner", "after"]);
});

test("the first focus candidates are the elements marked data-autofocus, then the tab stops, then every focusable element", () => {
  const region = html(`<div>
    <span id="programmatic" tabindex="-1">Programmatic</span>
    <button id="stop">Stop</button>
    <input id="marked" data-autofocus aria-label="Marked">
  </div>`);

  expect(ids(initialFocusCandidates(region))).toEqual([
    "marked",
    "stop",
    "marked",
    "programmatic",
    "stop",
    "marked",
  ]);
});
