import type * as Library from "#/src/index.ts";

type LibraryExports = typeof Library;

export type ComponentName = {
  [Name in keyof LibraryExports]: Name extends Capitalize<Name>
    ? LibraryExports[Name] extends (...args: never[]) => unknown
      ? Name
      : never
    : never;
}[keyof LibraryExports];

export type Section = "foundations" | ComponentName;

type GapKey = `${Section} ${number}` | `step ${number}`;

export const parityGapItems = {
  "foundations 1": "mod writes the data attributes it names",
  "foundations 2": "variant and size write data-variant and data-size on any component",
  "foundations 3": "vars puts the custom properties it returns on the parts it names",
  "foundations 4": "attributes puts its attributes on the parts it names",
  "foundations 5": "classes and styles take a function of the theme and the props",
  "foundations 6": "style takes a list and a function of the theme",
  "foundations 7": "renderRoot renders the root",
  "foundations 8": "a theme's components defaults, classes and styles",
  "foundations 9": "Component.extend and Component.withProps",
  "foundations 10": "the variant table, orange its own palette",
  "foundations 11": "autoContrast is on unless false is given",
  "foundations 12": "gradient and the theme's defaultGradient",
  "foundations 13": "the theme's primaryShade",
  "foundations 14": "the theme's defaultRadius",
  "foundations 16": "the focus ring of a field",
  "foundations 17": "the disabled look: half opacity, the not-allowed cursor, no pointer events",
  "foundations 18": "no transition under reduced motion",
  "Button 1": 'type="button" when the root is a button',
  "Button 2": "data-size and the compact sizes",
  "Button 3":
    "the white and gradient variants and the colour variables under the reference's names",
  "Button 4": "with no color and no variant, only --button-color is set",
  "Button 5": "--button-radius unset when no radius is given",
  "Button 6": "justify and --button-justify",
  "Button 7": "fullWidth and data-block",
  "Button 8": "the left and right sections",
  "Button 9": "data-disabled from disabled",
  "Button 10": "loading",
  "Button 11": "loaderProps",
  "Button 15": "the parts root, inner, label, loader and section",
  "Button 16": "a consumer's colour variables win over the variant",
  "Button 17": "Button.Group",
  "Button 18": "the radii and borders of a group's children",
  "Button 19": "Button.GroupSection",
  "Button 20": "axe on a Button.Group",
  "Button 22": "the look of each variant in each state and scheme",
  "Button 23": "the look of each size",
  "Tabs 9": "keepMountedMode",
  "Tabs 11": "the tabSection part with data-position",
  "Modal 8": "zIndex and the Modal's variables",
  "TextInput 2": "description and error, shown together",
  "SolixProvider 8":
    "the colour-scheme manager in the reference's shape, on data-solix-color-scheme",
  "step 1": "Styles API completion",
  "step 2": "theme and provider defaults, which close the layout family and ColorSchemeScript",
  "step 4": "size, radius and motion",
  "step 8": "Tabs",
  "step 10": "TextInput",
  "step 12": "Accordion and Collapse, which replace Disclosure",
  "step 13": "Modal",
  "step 14": "the rest of SolixProvider",
} as const satisfies Record<GapKey, string>;

export type GapItem = keyof typeof parityGapItems;

type BehaviourGap = {
  readonly says: string;
  readonly specifiedBy: "a tla-ts model, not yet written" | "verify-formal-tabs";
};

export const behaviourGapItems = {
  "Button 24": {
    says: "a disabled Button does not call onClick",
    specifiedBy: "a tla-ts model, not yet written",
  },
  "Button 25": {
    says: "a Button given data-disabled keeps taking focus",
    specifiedBy: "a tla-ts model, not yet written",
  },
  "Button 26": {
    says: "a loading Button keeps focus and does not call onClick",
    specifiedBy: "a tla-ts model, not yet written",
  },
  "Button 27": {
    says: "a consumer's onFocus and onBlur are called once per focus and blur",
    specifiedBy: "a tla-ts model, not yet written",
  },
  "Modal 2": {
    says: "closeOnEscape and closeOnClickOutside: closeOnEscape={false} keeps the Modal open on Escape",
    specifiedBy: "a tla-ts model, not yet written",
  },
  "Tabs 12": {
    says: "Tab from the selected tab moves focus to its panel",
    specifiedBy: "a tla-ts model, not yet written",
  },
  "Tabs 13": {
    says: "with defaultValue=null and the first tab disabled, the first enabled tab is the list's one tab stop",
    specifiedBy: "verify-formal-tabs",
  },
} as const satisfies Record<GapKey, BehaviourGap>;
