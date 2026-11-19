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
