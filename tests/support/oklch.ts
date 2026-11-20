import { luminanceWeights } from "#/packages/core/src/color-table.ts";

export type Oklch = { lightness: number; chroma: number; hue: number; alpha: number };

export const cssNumber = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
export const oklchText = String.raw`oklch\(${cssNumber} ${cssNumber} ${cssNumber}(?: / ${cssNumber})?\)`;
const oklchNotation = new RegExp(`^${oklchText}$`);

export const transparentOklch: Oklch = { lightness: 0, chroma: 0, hue: 0, alpha: 0 };

export function parsedOklch(value: string): Oklch | undefined {
  const match = oklchNotation.exec(value);
  if (!match) return undefined;
  const [lightness, chroma, hue] = match.slice(1, 4).map(Number);
  return { lightness, chroma, hue, alpha: match[4] === undefined ? 1 : Number(match[4]) };
}

export function oklabOf({ lightness, chroma, hue }: Oklch): [l: number, a: number, b: number] {
  const radians = (hue * Math.PI) / 180;
  return [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)];
}

export function mixedInOklab(colour: Oklch, percent: number, toward: Oklch): Oklch {
  const share = percent / 100;
  const alpha = colour.alpha * share + toward.alpha * (1 - share);
  if (alpha === 0) return transparentOklch;
  const [l1, a1, b1] = oklabOf(colour);
  const [l2, a2, b2] = oklabOf(toward);
  const at = (one: number, other: number) =>
    (one * colour.alpha * share + other * toward.alpha * (1 - share)) / alpha;
  const [a, b] = [at(a1, a2), at(b1, b2)];
  return {
    lightness: at(l1, l2),
    chroma: Math.hypot(a, b),
    hue: (Math.atan2(b, a) * 180) / Math.PI,
    alpha,
  };
}

export type Rgb = readonly [red: number, green: number, blue: number];

function encoded(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function decoded(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function over(top: Oklch, under: Rgb): Rgb {
  const [red, green, blue] = linearSrgb(top).map(encoded);
  return [
    red * top.alpha + under[0] * (1 - top.alpha),
    green * top.alpha + under[1] * (1 - top.alpha),
    blue * top.alpha + under[2] * (1 - top.alpha),
  ];
}

export function opaque(colour: Oklch): Rgb {
  return over({ ...colour, alpha: 1 }, [0, 0, 0]);
}

export function linearSrgb(colour: Oklch): [number, number, number] {
  const [lightness, a, b] = oklabOf(colour);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

function relativeLuminance(colour: Rgb): number {
  const [red, green, blue] = colour.map(decoded);
  return luminanceWeights.r * red + luminanceWeights.g * green + luminanceWeights.b * blue;
}

export function contrastRatio(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastOn(front: Oklch, back: Oklch, page: Oklch): number {
  const drawnOn = over(back, opaque(page));
  return contrastRatio(over(front, drawnOn), drawnOn);
}
