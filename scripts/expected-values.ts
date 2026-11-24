import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { themedSpacing } from "#/apps/playground/src/sections/theme-setups.ts";
import { repositoryRoot } from "#/scripts/repository.ts";
import { type TokenKind, tokenKind, tokenValues } from "#/scripts/tokens.ts";

const playgroundStylesheet = "apps/playground/src/app.css";
const probedProperty = {
  colour: "color",
  radius: "border-top-left-radius",
  spacing: "margin-top",
  length: "height",
  shadow: "box-shadow",
} satisfies Record<TokenKind, string>;

type Probe = [name: string, property: string, value: string];

function playgroundValue(selector: string, property: string): string {
  const values: string[] = [];
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

const quarterPixelsInRem = 0.328125;
const pixelInRem = 0.0625;

function lengthNoEngineRounds(index: number): string {
  return `${(index + 1) * pixelInRem + quarterPixelsInRem}rem`;
}

function sentinelValues(names: string[]): Record<string, string> {
  const colours = names.filter((name) => tokenKind(name) === "colour");
  const shadows = names.filter((name) => tokenKind(name) === "shadow");
  const lengths = names.filter((name) => !["colour", "shadow"].includes(tokenKind(name)));
  return Object.fromEntries([
    ...colours.map((name, index) => [
      name,
      `oklch(0.6 0.1 ${Math.round((360 * index) / colours.length)})`,
    ]),
    ...lengths.map((name, index) => [name, lengthNoEngineRounds(index)]),
    ...shadows.map((name, index) => [name, `0 0 ${lengthNoEngineRounds(index)} oklch(0 0 0)`]),
  ]);
}

export type ProbeInput = { written: Probe[]; injected: string };

function computedValues({ written, injected }: ProbeInput): Record<string, string> {
  if (injected) {
    const style = document.createElement("style");
    style.nonce = document.querySelector<HTMLElement>("[nonce]")?.nonce ?? "";
    style.textContent = injected;
    document.head.append(style);
  }
  const computed: Record<string, string> = {};
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
}

export type ProbeReader = (
  probe: typeof computedValues,
  input: ProbeInput,
) => Promise<Record<string, string>>;

function sameValues(values: Record<string, string>): string[] {
  const names = Object.keys(values);
  return names.flatMap((name, index) =>
    names
      .slice(index + 1)
      .filter((other) => values[other] === values[name])
      .map((other) => `${name} and ${other} both compute to ${values[name]}`),
  );
}

export type Expected = (name: string) => string;

export async function expectedValues(
  read: ProbeReader,
  { sentinels = true }: { sentinels?: boolean } = {},
): Promise<Expected> {
  const tokens = tokenValues();
  const sentinelByName = sentinels ? sentinelValues(Object.keys(tokens)) : undefined;
  const probes: Probe[] = [
    ...Object.entries(tokens).map(([name, value]): Probe => [
      name,
      probedProperty[tokenKind(name)],
      sentinelByName ? `var(${name})` : value,
    ]),
    ["danger", "color", playgroundValue(".danger", "background-color")],
    ["roomy", "margin-top", playgroundValue(".roomy", "margin-top")],
    ["pinnedMargin", "margin-top", playgroundValue(":root", "--playground-pinned-margin")],
    ["partBackground", "color", playgroundValue(":root", "--playground-part-background")],
    ["partText", "color", playgroundValue(":root", "--playground-part-text")],
    ["zero", "margin-top", "0"],
    ["themedSpacingMd", "padding-top", themedSpacing.md],
  ];
  const rootRule =
    sentinelByName &&
    `:root { ${Object.entries(sentinelByName)
      .map(([name, value]) => `${name}: ${value};`)
      .join(" ")} }`;
  const values = await read(computedValues, { written: probes, injected: rootRule ?? "" });

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
