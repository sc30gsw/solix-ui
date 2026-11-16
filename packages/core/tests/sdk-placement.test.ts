import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";

const positioning = join(
  import.meta.dirname,
  "../node_modules/@ui-sdk/core/dist/foundation/platform/position.js",
);
const writtenOnAPopup = [
  "position",
  "inset",
  "margin",
  "left",
  "top",
  "--available-height",
  "--available-width",
  "--anchor-width",
  "--anchor-height",
  "--transform-origin",
  "--arrow-offset",
];
const writtenOnItsArrow = ["position", "left", "top"];
const assignedAtOnce = /Object\.assign\(el\.style, \{([^}]*)\}\)/g;
const assignedName = /^\s*(?:"([^"]+)"|([A-Za-z-]+))\s*:/gm;

function writtenThrough(writer: string, source: string): string[] {
  return [...source.matchAll(new RegExp(`\\b${writer}\\.style\\(\\s*"([^"]+)"`, "g"))].map(
    ([, name]) => name,
  );
}

test("the SDK's positioning writes exactly these inline style properties on a popup part and on its arrow, the only ones that win over a consumer's style", () => {
  const source = readFileSync(positioning, "utf8");
  const atOnce = [...source.matchAll(assignedAtOnce)].flatMap(([, body]) =>
    [...body.matchAll(assignedName)].map(([, quoted, bare]) => quoted ?? bare),
  );
  const directly = [...source.matchAll(/\bel\.style\.([A-Za-z]+)\s*=/g)].map(([, name]) => name);

  expect([...new Set([...atOnce, ...writtenThrough("popup", source)])]).toEqual(writtenOnAPopup);
  expect([...new Set(writtenThrough("write", source))]).toEqual(writtenOnItsArrow);
  expect([...new Set(directly)], "it sets and restores transition while it measures").toEqual([
    "transition",
  ]);
  expect(
    source
      .replaceAll(assignedAtOnce, "")
      .replaceAll(/\b(?:popup|write)\.style\(/g, "")
      .replaceAll(/\bel\.style\.transition\b/g, "")
      .replaceAll("el.style.setProperty(name, value)", "")
      .match(/.*\.style\b.*/g),
    "no other line touches an element's style",
  ).toBeNull();
});
