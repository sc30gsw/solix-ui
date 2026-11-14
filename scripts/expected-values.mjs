import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { tokenKind, tokenValues } from "./tokens.mjs";

const playgroundStylesheet = "apps/playground/src/app.css";

const repositoryRoot = join(import.meta.dirname, "..");

const probedProperty = {
  colour: "color",
  radius: "border-top-left-radius",
  spacing: "margin-top",
  length: "height",
};

function playgroundValue(selector, property) {
  const values = [];
  postcss
    .parse(readFileSync(join(repositoryRoot, playgroundStylesheet), "utf8"))
    .walkRules((rule) => {
      if (rule.selector === selector) {
        rule.walkDecls(property, (declaration) => {
          values.push(declaration.value);
        });
      }
    });
  if (values.length !== 1) {
    throw new Error(
      `${playgroundStylesheet}: expected one ${property} in the rule for ${selector}, found ${values.length}.`,
    );
  }
  return values[0];
}

function lengthThatLayoutRounds(index) {
  return `${index + 1}.33rem`;
}

function sentinelValues(names) {
  const colours = names.filter((name) => tokenKind(name) === "colour");
  const lengths = names.filter((name) => tokenKind(name) !== "colour");
  return Object.fromEntries([
    ...colours.map((name, index) => [
      name,
      `oklch(0.6 0.1 ${Math.round((360 * index) / colours.length)})`,
    ]),
    ...lengths.map((name, index) => [name, lengthThatLayoutRounds(index)]),
  ]);
}

function computedValues(page, probes, rootRule) {
  return page.evaluate(
    ([written, injected]) => {
      if (injected) {
        const style = document.createElement("style");
        style.textContent = injected;
        document.head.append(style);
      }
      const computed = {};
      for (const [name, property, value] of written) {
        const probe = document.createElement("div");
        probe.style.setProperty(property, value);
        if (probe.style.getPropertyValue(property) === "") {
          throw new Error(`${name}: "${value}" is not a valid ${property} in this browser.`);
        }
        document.body.append(probe);
        computed[name] = getComputedStyle(probe).getPropertyValue(property);
        probe.remove();
      }
      return computed;
    },
    [probes, rootRule],
  );
}

function sameValues(values) {
  const names = Object.keys(values);
  return names.flatMap((name, index) =>
    names
      .slice(index + 1)
      .filter((other) => values[other] === values[name])
      .map((other) => `${name} and ${other} both compute to ${values[name]}`),
  );
}

/**
 * @param {import("playwright").Page} page
 * @param {{ sentinels?: boolean }} [options]
 * @returns {Promise<(name: string) => string>}
 */
export async function expectedValues(page, { sentinels = false } = {}) {
  const tokens = tokenValues();
  const sentinelByName = sentinels ? sentinelValues(Object.keys(tokens)) : undefined;
  const probes = [
    ...Object.entries(tokens).map(([name, value]) => [
      name,
      probedProperty[tokenKind(name)],
      sentinelByName ? `var(${name})` : value,
    ]),
    ["danger", "color", playgroundValue(".danger", "background-color")],
    ["brandGreen", "color", playgroundValue(".brand-green", "--solix-color-primary")],
    ["roomy", "margin-top", playgroundValue(".roomy", "margin-top")],
    ["pinnedMargin", "margin-top", playgroundValue(":root", "--playground-pinned-margin")],
  ];
  const rootRule =
    sentinelByName &&
    `:root { ${Object.entries(sentinelByName)
      .map(([name, value]) => `${name}: ${value};`)
      .join(" ")} }`;
  const values = await computedValues(page, probes, rootRule);

  const collisions = sentinels ? sameValues(values) : [];
  if (collisions.length > 0) {
    throw new Error(
      `${collisions.join("; ")}. A component that reads the wrong one would pass, so give each a sentinel of its own.`,
    );
  }
  return (name) => {
    if (!(name in values)) {
      throw new Error(
        `No expected value is named "${name}". Use one of: ${Object.keys(values).join(", ")}.`,
      );
    }
    return values[name];
  };
}
