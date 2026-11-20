import type { SolixTheme } from "@solix/core";

export const themeSection = "Theme";

export const themedByTheProvider = "data-provider-theme";

export const themedSpacing = { md: "2.25rem" } as const;

export const brandSubtree = "brand";

export const brandPrimaryColor = "grape" satisfies SolixTheme["primaryColor"];

export const themeNames = {
  themed: "Padding the provider's theme sets",
  untouched: "Padding outside the provider's theme",
};

export const nestedThemes = {
  outer: { scope: "brand-outer", primaryColor: "teal" },
  inner: { scope: "brand-inner", primaryColor: "red" },
} as const satisfies Record<string, { scope: string; primaryColor: SolixTheme["primaryColor"] }>;

export const nestedThemeNames = {
  outerIsland: "Outer theme in a dark island",
  innerScope: "Inner theme on a scope that is a dark island",
  innerIsland: "Inner theme in a light island",
};
