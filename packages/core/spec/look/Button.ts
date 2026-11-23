import { fixture } from "#/spec/fixtures.ts";
import {
  defineLook,
  type Fixture,
  type GapItem,
  type LookEntry,
  lookEntry,
  type Scheme,
  type State,
  style,
  type StyleOptions,
} from "#/spec/format.ts";
import {
  breakpoints,
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

const notBuilt: ReadonlySet<Variant> = new Set(["white", "gradient"]);

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

const waiting: ReadonlyMap<string, GapItem> = new Map([
  ["* pressed transform", "Button 22"],
  ["* rest opacity", "Button 22"],
  ["outline rest color", "Button 22"],
  ["outline rest border-top-color", "Button 22"],
  ["outline hover background-color", "Button 22"],
  ["outline pressed background-color", "Button 22"],
  ["subtle rest color", "Button 22"],
  ["transparent rest color", "Button 22"],
  ["transparent hover opacity", "Button 22"],
  ["default rest background-color", "Button 22"],
  ["default hover background-color", "Button 22"],
  ["default pressed background-color", "Button 22"],
]);

function button(props: Fixture["props"]): Fixture {
  return fixture("Button", props, "Save");
}

function variantEntry(
  variant: Variant,
  scheme: Scheme,
  state: State,
  property: string,
  value: string,
  props: Fixture["props"] = {},
): LookEntry {
  const check = style(button({ variant, ...props }), property, value, {
    scheme,
    state,
    given: { "data-variant": variant },
  });
  if (notBuilt.has(variant)) {
    return lookEntry(check, {
      until: "Button 3",
      failsWith: `data-variant="${variant}" is not on it`,
    });
  }
  const until =
    waiting.get(`${variant} ${state} ${property}`) ?? waiting.get(`* ${state} ${property}`);
  return lookEntry(check, { until });
}

function gridOf(variant: Variant, scheme: Scheme): LookEntry[] {
  const row = rowsOf(visualReference[scheme])[variant];
  const at = (
    state: State,
    property: string,
    value: string | undefined,
    props?: Fixture["props"],
  ) => (value === undefined ? [] : [variantEntry(variant, scheme, state, property, value, props)]);
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
    ...at("rest", "opacity", statuses.disabledOpacity, { disabled: true }),
  ];
}

function filledWith(
  scheme: Scheme,
  props: Fixture["props"],
  property: string,
  value: string,
): LookEntry {
  return lookEntry(style(button({ variant: "filled", ...props }), property, value, { scheme }), {
    until: "Button 22",
  });
}

const statusEntries = schemes.flatMap((scheme) => [
  filledWith(scheme, { disabled: true }, "cursor", "not-allowed"),
  filledWith(scheme, { disabled: true }, "pointer-events", "none"),
  filledWith(scheme, { "data-disabled": true }, "opacity", statuses.disabledOpacity),
  filledWith(scheme, { "data-disabled": true }, "cursor", "not-allowed"),
  filledWith(scheme, { loading: true }, "pointer-events", "none"),
]);

function sized(
  props: Fixture["props"],
  property: string,
  value: string,
  options: StyleOptions & { readonly until?: GapItem } = {},
): LookEntry {
  const { until, ...check } = options;
  return lookEntry(style(button(props), property, value, check), { until });
}

const narrow = { media: { width: breakpoints.narrow } } as const;
const wide = { media: { width: breakpoints.wide } } as const;

const sizeEntries = [
  sized({}, "height", "2.5rem", narrow),
  sized({ size: "xs" }, "height", "2.25rem", narrow),
  sized({ size: "sm" }, "height", "2.5rem", narrow),
  sized({ size: "md" }, "height", "2.75rem", narrow),
  sized({ size: "xs" }, "height", "2rem", { ...wide, until: "step 4" }),
  sized({ size: "sm" }, "height", "2.25rem", { ...wide, until: "step 4" }),
  sized({ size: "md" }, "height", "2.5rem", { ...wide, until: "step 4" }),
  sized({ size: "3rem" }, "height", "3rem", narrow),
  sized({ size: "compact-xs" }, "height", "1.75rem", { ...narrow, until: "Button 2" }),
  sized({ size: "compact-sm" }, "height", "2rem", { ...narrow, until: "Button 2" }),
  sized({ size: "compact-md" }, "height", "2.25rem", { ...narrow, until: "Button 2" }),
  sized({ size: "compact-lg" }, "height", "2.5rem", { ...narrow, until: "Button 2" }),
  sized({ size: "compact-xl" }, "height", "3rem", { ...narrow, until: "Button 2" }),
  sized({ size: "xs" }, "padding-inline-start", "0.75rem", narrow),
  sized({ size: "sm" }, "padding-inline-start", "1rem", narrow),
  sized({ size: "md" }, "padding-inline-start", "1rem", narrow),
  sized({ size: "xs" }, "font-size", "0.875rem", { ...narrow, until: "Button 23" }),
  sized({ size: "sm" }, "font-size", "0.875rem", narrow),
  sized({ size: "md" }, "font-size", "1rem", narrow),
  sized({ size: "xs" }, "transform", "scale(0.98)", { state: "pressed", until: "Button 22" }),
  sized({ size: "md" }, "transform", "scale(0.96)", { state: "pressed", until: "Button 22" }),
  sized({}, "border-top-left-radius", "1.5rem"),
  sized({}, "font-weight", "500"),
];

const salmon = "rgb(250, 128, 114)";
const givenColour = "oklch(0.45 0.15 260)";

const partEntries = [
  sized({ variant: "outline", color: givenColour }, "border-top-color", givenColour),
  sized({ style: { "--button-bg": salmon } }, "background-color", salmon, { until: "Button 16" }),
  lookEntry(style(button({}), "justify-content", "center", { at: { part: "inner" } }), {
    until: "Button 6",
    failsWith: "it renders no inner part",
  }),
  lookEntry(
    style(button({ justify: "space-between" }), "justify-content", "space-between", {
      at: { part: "inner" },
    }),
    { until: "Button 6", failsWith: "it renders no inner part" },
  ),
  lookEntry(
    style(
      fixture("Button.Group", { "aria-label": "Actions" }, [button({}), button({})]),
      "border-end-end-radius",
      "0px",
      { at: { of: "Button", part: "root" } },
    ),
    { until: "Button 18", failsWith: "exports no component by this name" },
  ),
];

const motionEntries = [
  sized({}, "transition-property", "transform, background-color, box-shadow", { until: "step 4" }),
  sized({}, "transition-duration", "250ms, 100ms, 100ms", { until: "step 4" }),
  sized({}, "transition-property", "none", {
    media: { reducedMotion: true },
    until: "foundations 18",
  }),
];

export const look = defineLook([
  ...variants.flatMap((variant) => schemes.flatMap((scheme) => gridOf(variant, scheme))),
  ...statusEntries,
  ...sizeEntries,
  ...partEntries,
  ...motionEntries,
]);
