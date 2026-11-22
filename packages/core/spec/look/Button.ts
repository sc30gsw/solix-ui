import {
  defineLook,
  type Fixture,
  type GapItem,
  type Scheme,
  type SpecEntry,
  type State,
  type StyleCheck,
  style,
  type StyleOptions,
} from "#/spec/format.ts";

type Tokens = {
  readonly accent: string;
  readonly accentForeground: string;
  readonly foreground: string;
  readonly neutral: string;
  readonly neutralForeground: string;
  readonly surface: string;
  readonly soft: number;
  readonly softHover: number;
  readonly softForeground: readonly [accent: number, foreground: number];
};

const accent = "oklch(0.6204 0.195 253.83)";
const snow = "oklch(0.9911 0 0)";
const eclipse = "oklch(0.2103 0.0059 285.89)";

const visualReference: Record<Scheme, Tokens> = {
  light: {
    accent,
    accentForeground: snow,
    foreground: eclipse,
    neutral: "oklch(94% 0.001 286.375)",
    neutralForeground: eclipse,
    surface: "oklch(100% 0 0)",
    soft: 15,
    softHover: 20,
    softForeground: [70, 30],
  },
  dark: {
    accent,
    accentForeground: snow,
    foreground: snow,
    neutral: "oklch(27.4% 0.006 286.033)",
    neutralForeground: snow,
    surface: "oklch(0.2103 0.0059 285.89)",
    soft: 12,
    softHover: 16,
    softForeground: [80, 30],
  },
};

const disabledOpacity = "0.5";
const pressedScale = "scale(0.97)";
const focusRingWidth = "2px";
const focusRingOffset = "2px";
const hoveredOpacity = "0.7";

function mix(one: string, percent: number, other: string, otherPercent?: number): string {
  const second = otherPercent === undefined ? other : `${other} ${otherPercent}%`;
  return `color-mix(in oklab, ${one} ${percent}%, ${second})`;
}

type Row = {
  readonly background: string;
  readonly text: string;
  readonly border?: string;
  readonly hover: string;
  readonly hoverOpacity?: string;
};

function rowsOf(tokens: Tokens) {
  const softForeground = mix(
    tokens.accent,
    tokens.softForeground[0],
    tokens.foreground,
    tokens.softForeground[1],
  );
  return {
    filled: {
      background: tokens.accent,
      text: tokens.accentForeground,
      hover: mix(tokens.accent, 90, tokens.accentForeground, 10),
    },
    light: {
      background: mix(tokens.accent, tokens.soft, "transparent"),
      text: softForeground,
      hover: mix(tokens.accent, tokens.softHover, "transparent"),
    },
    outline: {
      background: "transparent",
      text: tokens.accent,
      border: tokens.accent,
      hover: mix(tokens.accent, 5, "transparent"),
    },
    subtle: {
      background: "transparent",
      text: tokens.accent,
      hover: mix(tokens.accent, tokens.soft, "transparent"),
    },
    default: {
      background: tokens.neutral,
      text: tokens.neutralForeground,
      hover: mix(tokens.neutral, 96, tokens.neutralForeground, 4),
    },
    transparent: {
      background: "transparent",
      text: tokens.accent,
      hover: "transparent",
      hoverOpacity: hoveredOpacity,
    },
    white: {
      background: tokens.surface,
      text: tokens.accent,
      hover: mix(tokens.surface, 92, tokens.foreground, 8),
    },
  } satisfies Record<string, Row>;
}

type Variant = keyof ReturnType<typeof rowsOf> | "gradient";

const variants: readonly Variant[] = [
  "filled",
  "light",
  "outline",
  "subtle",
  "default",
  "transparent",
  "white",
  "gradient",
];
const schemes: readonly Scheme[] = ["light", "dark"];

const notBuilt: ReadonlySet<Variant> = new Set(["white", "gradient"]);

function fixtureOf(variant: Variant, props: Fixture["props"] = {}): Fixture {
  return { component: "Button", props: { variant, ...props }, children: "Save" };
}

function entry(says: string, check: StyleCheck, until: GapItem | undefined): SpecEntry<StyleCheck> {
  const promise = { kind: "look", property: check.property } as const;
  return until === undefined
    ? { says, promise, check, status: "holds" }
    : { says, promise, check, status: "pending", until };
}

function look(
  variant: Variant,
  scheme: Scheme,
  state: State,
  property: string,
  value: string,
  until: GapItem | undefined,
  props: Fixture["props"] = {},
): SpecEntry<StyleCheck> {
  const options: StyleOptions = { scheme, state };
  return entry(
    `${variant}, ${state}, ${scheme}: ${property} is ${value}`,
    style(fixtureOf(variant, props), property, value, options),
    until,
  );
}

const lookOfTheVariant = "Button 22";

const differsToday: ReadonlySet<string> = new Set([
  "outline rest color",
  "outline rest border-top-color",
  "outline hover background-color",
  "outline pressed background-color",
  "subtle rest color",
  "transparent rest color",
  "transparent hover opacity",
  "default rest background-color",
  "default hover background-color",
  "default pressed background-color",
]);

function gridOf(variant: Variant, scheme: Scheme): SpecEntry<StyleCheck>[] {
  const at = (state: State, property: string, value: string, until?: GapItem) =>
    look(variant, scheme, state, property, value, until);
  const ofTheVariant = (state: State, property: string, value: string) =>
    at(
      state,
      property,
      value,
      notBuilt.has(variant) || differsToday.has(`${variant} ${state} ${property}`)
        ? lookOfTheVariant
        : undefined,
    );
  const shared = [
    at("pressed", "transform", pressedScale, lookOfTheVariant),
    at("focus-visible", "outline-width", focusRingWidth),
    at("focus-visible", "outline-offset", focusRingOffset),
    at("focus-visible", "outline-color", visualReference[scheme].accent),
    look(variant, scheme, "rest", "opacity", disabledOpacity, lookOfTheVariant, {
      disabled: true,
    }),
  ];
  if (variant === "gradient") {
    return [
      ofTheVariant(
        "rest",
        "background-image",
        "linear-gradient(45deg, var(--solix-color-blue-6), var(--solix-color-cyan-6))",
      ),
      at("rest", "color", visualReference[scheme].accentForeground),
      ...shared,
    ];
  }
  const row: Row = rowsOf(visualReference[scheme])[variant];
  return [
    ofTheVariant("rest", "background-color", row.background),
    ofTheVariant("rest", "color", row.text),
    ...(row.border === undefined ? [] : [ofTheVariant("rest", "border-top-color", row.border)]),
    ofTheVariant("hover", "background-color", row.hover),
    ...(row.hoverOpacity === undefined ? [] : [ofTheVariant("hover", "opacity", row.hoverOpacity)]),
    ofTheVariant("pressed", "background-color", row.hover),
    ...shared,
  ];
}

const statusEntries = schemes.flatMap((scheme): SpecEntry<StyleCheck>[] => [
  look("filled", scheme, "rest", "cursor", "not-allowed", "Button 22", { disabled: true }),
  look("filled", scheme, "rest", "pointer-events", "none", "Button 22", { disabled: true }),
  look("filled", scheme, "rest", "opacity", disabledOpacity, "Button 22", {
    "data-disabled": true,
  }),
  look("filled", scheme, "rest", "cursor", "not-allowed", "Button 22", { "data-disabled": true }),
  look("filled", scheme, "rest", "pointer-events", "none", "Button 22", { loading: true }),
  entry(
    `filled inside a disabled fieldset, ${scheme}: opacity is ${disabledOpacity}`,
    style(
      { ...fixtureOf("filled"), within: { fieldset: "disabled" } },
      "opacity",
      disabledOpacity,
      { scheme },
    ),
    "Button 22",
  ),
]);

const narrow = 414;
const wide = 1024;

function sized(
  size: string,
  property: string,
  value: string,
  width: number,
  until: GapItem | undefined,
  state: State = "rest",
): SpecEntry<StyleCheck> {
  const where = width < 768 ? "below md" : "from md";
  return entry(
    `size ${size}, ${state}, ${where}: ${property} is ${value}`,
    style({ component: "Button", props: { size }, children: "Save" }, property, value, {
      width,
      state,
    }),
    until,
  );
}

const sizeEntries: SpecEntry<StyleCheck>[] = [
  sized("xs", "height", "2.25rem", narrow, undefined),
  sized("sm", "height", "2.5rem", narrow, undefined),
  sized("md", "height", "2.75rem", narrow, undefined),
  sized("xs", "height", "2rem", wide, "step 4"),
  sized("sm", "height", "2.25rem", wide, "step 4"),
  sized("md", "height", "2.5rem", wide, "step 4"),
  sized("xs", "padding-inline-start", "0.75rem", narrow, undefined),
  sized("sm", "padding-inline-start", "1rem", narrow, undefined),
  sized("md", "padding-inline-start", "1rem", narrow, undefined),
  sized("xs", "font-size", "0.875rem", narrow, "Button 23"),
  sized("sm", "font-size", "0.875rem", narrow, undefined),
  sized("md", "font-size", "1rem", narrow, undefined),
  sized("xs", "transform", "scale(0.98)", narrow, "Button 22", "pressed"),
  sized("md", "transform", "scale(0.96)", narrow, "Button 22", "pressed"),
  sized("sm", "border-top-left-radius", "1.5rem", narrow, undefined),
  sized("sm", "font-weight", "500", narrow, undefined),
];

const motionEntries: SpecEntry<StyleCheck>[] = [
  entry(
    "filled, rest: transition-property is transform, background-color, box-shadow",
    style(fixtureOf("filled"), "transition-property", "transform, background-color, box-shadow"),
    "step 4",
  ),
  entry(
    "filled, rest: transition-duration is 250ms, 100ms, 100ms",
    style(fixtureOf("filled"), "transition-duration", "250ms, 100ms, 100ms"),
    "step 4",
  ),
  entry(
    "filled, reduced motion: transition-property is none",
    style(fixtureOf("filled"), "transition-property", "none", { state: "reduced-motion" }),
    "foundations 18",
  ),
];

export const spec = defineLook("Button", [
  ...variants.flatMap((variant) => schemes.flatMap((scheme) => gridOf(variant, scheme))),
  ...statusEntries,
  ...sizeEntries,
  ...motionEntries,
]);
