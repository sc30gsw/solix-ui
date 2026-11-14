import { expect, test } from "vite-plus/test";
import { isColourToken, tokensFile, tokenValues } from "../../../scripts/tokens.mjs";

type Pairing = [foreground: string, background: string, minimumRatio: number, why: string];

const pairings: Pairing[] = [
  [
    "--solix-color-on-primary",
    "--solix-color-primary",
    4.5,
    "Button text and the open Disclosure summary (WCAG 1.4.3)",
  ],
  ["--solix-color-text", "--solix-color-body", 4.5, "text in TextInput and Modal (WCAG 1.4.3)"],
  [
    "--solix-color-text",
    "--solix-color-surface",
    4.5,
    "the closed Disclosure summary (WCAG 1.4.3)",
  ],
  ["--solix-color-border", "--solix-color-body", 3, "the TextInput boundary (WCAG 1.4.11)"],
  ["--solix-color-primary", "--solix-color-body", 3, "the TextInput focus border (WCAG 1.4.11)"],
  ["--solix-color-error", "--solix-color-body", 3, "the TextInput invalid border (WCAG 1.4.11)"],
];

const remLength = /^\d+(?:\.\d+)?rem$/;
const number = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const oklchNotation = new RegExp(
  String.raw`^oklch\(${number} ${number} ${number}(?: / ${number})?\)$`,
);
const gamutTolerance = 1e-4;

type Oklch = { lightness: number; chroma: number; hue: number; alpha: number };

const tokens = tokenValues();
const colourTokens = Object.keys(tokens).filter((name) => isColourToken(name));
const lengthTokens = Object.keys(tokens).filter((name) => !isColourToken(name));

function oklch(value: string): Oklch | undefined {
  const match = oklchNotation.exec(value);
  if (!match) return undefined;
  const [lightness, chroma, hue] = match.slice(1, 4).map(Number);
  return { lightness, chroma, hue, alpha: match[4] === undefined ? 1 : Number(match[4]) };
}

function opaqueColour(name: string): Oklch | undefined {
  const colour = oklch(tokens[name]);
  return colour?.alpha === 1 ? colour : undefined;
}

function linearSrgb({ lightness, chroma, hue }: Oklch): [number, number, number] {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

function relativeLuminance(colour: Oklch): number {
  const [red, green, blue] = linearSrgb(colour);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Oklch, second: Oklch): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

test("every colour token is written in OKLCH", () => {
  const violations = colourTokens
    .filter((name) => oklch(tokens[name]) === undefined)
    .map(
      (name) =>
        `${name} is "${tokens[name]}" in ${tokensFile}. Write it as oklch(L C H), or as oklch(L C H / A) for a translucent colour.`,
    );

  expect(colourTokens.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every other token is a length in rem, so it means the same wherever it is used", () => {
  const violations = lengthTokens
    .filter((name) => !remLength.test(tokens[name]))
    .map(
      (name) =>
        `${name} is "${tokens[name]}" in ${tokensFile}. Write a length in rem, or name the token --solix-color-* if it is a colour.`,
    );

  expect(lengthTokens.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every colour token lies inside sRGB", () => {
  const violations = colourTokens.flatMap((name) => {
    const colour = oklch(tokens[name]);
    if (!colour) return [];
    const channels = linearSrgb(colour);
    const inside = channels.every(
      (channel) => channel >= -gamutTolerance && channel <= 1 + gamutTolerance,
    );
    return inside
      ? []
      : [
          `${name} is "${tokens[name]}", outside sRGB (linear red, green, blue ${channels.map((channel) => channel.toFixed(4)).join(", ")}). Lower its chroma in ${tokensFile}.`,
        ];
  });

  expect(violations).toEqual([]);
});

test("every foreground and background pairing meets its minimum contrast", () => {
  const violations = pairings.flatMap(([foreground, background, minimumRatio, why]) => {
    const front = opaqueColour(foreground);
    const back = opaqueColour(background);
    if (!front || !back) {
      return [
        `${foreground} and ${background} must both be opaque OKLCH colours in ${tokensFile}, because ${why} is measured between them.`,
      ];
    }
    const ratio = contrastRatio(front, back);
    return ratio >= minimumRatio
      ? []
      : [
          `${foreground} on ${background} has contrast ${ratio.toFixed(2)}:1, below the ${minimumRatio}:1 that ${why} needs. Change one of them in ${tokensFile}.`,
        ];
  });

  expect(violations).toEqual([]);
});
