import { button, group, looks, testColours, unbuiltButton } from "#/spec/fixtures.ts";
import type { GapItem, LookEntry, LookProperty, LookSpec, Scheme, State } from "#/spec/format.ts";
import {
  functionalReference,
  mix,
  schemes,
  statuses,
  type Tokens,
  visualReference,
} from "#/spec/look/reference.ts";

type Row = {
  readonly background?: string;
  readonly backgroundImage?: string;
  readonly text: string;
  readonly border?: string;
  readonly hover?: string;
  readonly hoverOpacity?: string;
};

const variants = [
  "filled",
  "light",
  "outline",
  "subtle",
  "default",
  "transparent",
  "white",
  "gradient",
] as const;

type Variant = (typeof variants)[number];

const unbuiltVariants = ["white", "gradient"] as const;

type BuiltVariant = Exclude<Variant, (typeof unbuiltVariants)[number]>;

function isBuilt(variant: Variant): variant is BuiltVariant {
  return unbuiltVariants.every((unbuiltVariant) => unbuiltVariant !== variant);
}

function rowsOf(tokens: Tokens): Record<Variant, Row> {
  const { defaultGradient } = functionalReference;
  return {
    filled: {
      background: tokens.accent,
      text: tokens.accentForeground,
      hover: mix(tokens.accent, 90, tokens.accentForeground, 10),
    },
    light: {
      background: mix(tokens.accent, tokens.soft, "transparent"),
      text: mix(
        tokens.accent,
        tokens.softForeground[0],
        tokens.foreground,
        tokens.softForeground[1],
      ),
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
      hoverOpacity: statuses.hoveredOpacity,
    },
    white: {
      background: tokens.surface,
      text: tokens.accent,
      hover: mix(tokens.surface, 92, tokens.foreground, 8),
    },
    gradient: {
      backgroundImage: `linear-gradient(${defaultGradient.deg}, ${defaultGradient.from}, ${defaultGradient.to})`,
      text: tokens.accentForeground,
    },
  };
}

type Cell = { readonly variant: Variant; readonly state: State; readonly property: LookProperty };

const cellKeys = ["variant", "state", "property"] as const;

const waiting: readonly (readonly [Partial<Cell>, GapItem])[] = [
  [{ state: "pressed", property: "transform" }, "Button 22"],
  [{ state: "rest", property: "opacity" }, "Button 22"],
  [{ variant: "outline", state: "rest", property: "color" }, "Button 22"],
  [{ variant: "outline", state: "rest", property: "border-top-color" }, "Button 22"],
  [{ variant: "outline", state: "hover", property: "background-color" }, "Button 22"],
  [{ variant: "outline", state: "pressed", property: "background-color" }, "Button 22"],
  [{ variant: "subtle", state: "rest", property: "color" }, "Button 22"],
  [{ variant: "transparent", state: "rest", property: "color" }, "Button 22"],
  [{ variant: "transparent", state: "hover", property: "opacity" }, "Button 22"],
  [{ variant: "default", state: "rest", property: "background-color" }, "Button 22"],
  [{ variant: "default", state: "hover", property: "background-color" }, "Button 22"],
  [{ variant: "default", state: "pressed", property: "background-color" }, "Button 22"],
];

function waitsOn(cell: Cell): GapItem | undefined {
  return waiting.find(([match]) =>
    cellKeys.every((key) => match[key] === undefined || match[key] === cell[key]),
  )?.[1];
}

function variantEntry(
  variant: Variant,
  scheme: Scheme,
  state: State,
  property: LookProperty,
  value: string,
  disabled: boolean,
): LookEntry {
  const requires = { attribute: "data-variant", value: variant };
  if (!isBuilt(variant)) {
    return {
      fixture: unbuiltButton(disabled ? { variant, disabled } : { variant }),
      requires,
      state,
      scheme,
      property,
      value,
      status: { until: "Button 3", fails: requires },
    };
  }
  return {
    ...looks(
      button(disabled ? { variant, disabled } : { variant }),
      property,
      value,
      waitsOn({ variant, state, property }),
      {
        state,
        scheme,
      },
    ),
    requires,
  };
}

function gridOf(variant: Variant, scheme: Scheme): LookEntry[] {
  const row = rowsOf(visualReference[scheme])[variant];
  const at = (state: State, property: LookProperty, value: string | undefined, disabled = false) =>
    value === undefined ? [] : [variantEntry(variant, scheme, state, property, value, disabled)];
  return [
    ...at("rest", "background-color", row.background),
    ...at("rest", "background-image", row.backgroundImage),
    ...at("rest", "color", row.text),
    ...at("rest", "border-top-color", row.border),
    ...at("hover", "background-color", row.hover),
    ...at("hover", "opacity", row.hoverOpacity),
    ...at("pressed", "background-color", row.hover),
    ...at("pressed", "transform", statuses.pressedScale),
    ...at("focus-visible", "outline-style", "solid"),
    ...at("focus-visible", "outline-width", statuses.focusRingWidth),
    ...at("focus-visible", "outline-offset", statuses.focusRingOffset),
    ...at("focus-visible", "outline-color", visualReference[scheme].accent),
    ...at("rest", "opacity", statuses.disabledOpacity, true),
  ];
}

const statusEntries = schemes.flatMap((scheme) => [
  looks(button({ variant: "filled", disabled: true }), "cursor", "not-allowed", "Button 22", {
    scheme,
  }),
  looks(button({ variant: "filled", disabled: true }), "pointer-events", "none", "Button 22", {
    scheme,
  }),
  looks(
    button({ variant: "filled", "data-disabled": true }),
    "opacity",
    statuses.disabledOpacity,
    "Button 22",
    { scheme },
  ),
  looks(
    button({ variant: "filled", "data-disabled": true }),
    "cursor",
    "not-allowed",
    "Button 22",
    { scheme },
  ),
  looks(
    unbuiltButton({ variant: "filled", loading: true }),
    "pointer-events",
    "none",
    "Button 22",
    {
      scheme,
    },
  ),
]);

const narrow = { media: { width: "narrow" } } as const;
const wide = { media: { width: "wide" } } as const;

const sizeEntries = [
  looks(button(), "height", "2.5rem", undefined, narrow),
  looks(button({ size: "xs" }), "height", "2.25rem", undefined, narrow),
  looks(button({ size: "sm" }), "height", "2.5rem", undefined, narrow),
  looks(button({ size: "md" }), "height", "2.75rem", undefined, narrow),
  looks(button({ size: "xs" }), "height", "2rem", "step 4", wide),
  looks(button({ size: "sm" }), "height", "2.25rem", "step 4", wide),
  looks(button({ size: "md" }), "height", "2.5rem", "step 4", wide),
  looks(button({ size: "3rem" }), "height", "3rem", undefined, narrow),
  looks(unbuiltButton({ size: "compact-xs" }), "height", "1.75rem", "Button 2", narrow),
  looks(unbuiltButton({ size: "compact-sm" }), "height", "2rem", "Button 2", narrow),
  looks(unbuiltButton({ size: "compact-md" }), "height", "2.25rem", "Button 2", narrow),
  looks(unbuiltButton({ size: "compact-lg" }), "height", "2.5rem", "Button 2", narrow),
  looks(unbuiltButton({ size: "compact-xl" }), "height", "3rem", "Button 2", narrow),
  looks(button({ size: "xs" }), "padding-inline-start", "0.75rem", undefined, narrow),
  looks(button({ size: "sm" }), "padding-inline-start", "1rem", undefined, narrow),
  looks(button({ size: "md" }), "padding-inline-start", "1rem", undefined, narrow),
  looks(button({ size: "xs" }), "font-size", "0.875rem", "Button 23", narrow),
  looks(button({ size: "sm" }), "font-size", "0.875rem", undefined, narrow),
  looks(button({ size: "md" }), "font-size", "1rem", undefined, narrow),
  looks(button({ size: "xs" }), "transform", "scale(0.98)", "Button 22", { state: "pressed" }),
  looks(button({ size: "md" }), "transform", "scale(0.96)", "Button 22", { state: "pressed" }),
  looks(button(), "border-top-left-radius", "1.5rem"),
  looks(button(), "font-weight", "500"),
];

const { salmon } = testColours;
const givenColour = "oklch(0.45 0.15 260)";
const inner = { part: "inner" } as const;

const partEntries: LookEntry[] = [
  looks(button({ variant: "outline", color: givenColour }), "border-top-color", givenColour),
  looks(button({ style: { "--button-bg": salmon } }), "background-color", salmon, "Button 16"),
  {
    fixture: button(),
    at: inner,
    property: "justify-content",
    value: "center",
    status: { until: "Button 6", fails: inner },
  },
  {
    fixture: unbuiltButton({ justify: "space-between" }),
    at: inner,
    property: "justify-content",
    value: "space-between",
    status: { until: "Button 6", fails: inner },
  },
  {
    fixture: group(),
    at: { of: "Button", part: "root" },
    property: "border-end-end-radius",
    value: "0px",
    status: { until: "Button 18", fails: { export: "Button.Group" } },
  },
];

const motionEntries = [
  looks(button(), "transition-property", "transform, background-color, box-shadow", "step 4"),
  looks(button(), "transition-duration", "250ms, 100ms, 100ms", "step 4"),
  looks(button(), "transition-property", "none", "foundations 18", {
    media: { reducedMotion: true },
  }),
];

export const buttonLook: LookSpec = [
  ...variants.flatMap((variant) => schemes.flatMap((scheme) => gridOf(variant, scheme))),
  ...statusEntries,
  ...sizeEntries,
  ...partEntries,
  ...motionEntries,
];
