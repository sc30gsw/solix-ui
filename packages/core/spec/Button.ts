import { expect } from "vite-plus/test";
import { button, buttonLabel, fixture, group, unbuiltButton } from "#/spec/fixtures.ts";
import type { FunctionEntry, FunctionSpec, Reference } from "#/spec/format.ts";
import { sharedSuite } from "#/spec/shared.ts";

const reference = {
  props: [
    "component",
    "size",
    "color",
    "variant",
    "justify",
    "leftSection",
    "rightSection",
    "fullWidth",
    "radius",
    "gradient",
    "disabled",
    "data-disabled",
    "loading",
    "loaderProps",
    "autoContrast",
    "children",
  ],
  parts: ["root", "inner", "label", "loader", "section"],
  variables: [
    "--button-justify",
    "--button-height",
    "--button-padding-x",
    "--button-fz",
    "--button-radius",
    "--button-bg",
    "--button-hover",
    "--button-hover-color",
    "--button-color",
    "--button-bd",
  ],
  exports: ["Button", "Button.Group", "Button.GroupSection"],
} as const satisfies Reference;

type Entry = FunctionEntry<typeof reference>;

const builtVariants = ["default", "filled", "light", "outline", "subtle", "transparent"] as const;
const missingVariants = ["white", "gradient"] as const;
const colourVariables = [
  "--button-bg",
  "--button-hover",
  "--button-color",
  "--button-bd",
  "--button-hover-color",
] as const;
const sizeVariables = ["--button-height", "--button-padding-x", "--button-fz"] as const;

function variableOf(root: HTMLElement, variable: string): string {
  return getComputedStyle(root).getPropertyValue(variable);
}

const shared = sharedSuite({
  component: "Button",
  reference,
  fixture: (props) => unbuiltButton({ loading: true, leftSection: "$", ...props }),
  statuses: {
    parts: "Button 15",
    mod: "foundations 1",
    variant: "foundations 2",
    size: "foundations 2",
    vars: "foundations 3",
    attributes: "foundations 4",
    "classes as a function": "foundations 5",
    "styles as a function": "foundations 5",
    "style as a list": "foundations 6",
    "style as a function": "foundations 6",
    renderRoot: "foundations 7",
    "static classes": "step 1",
    "static varsResolver": "step 1",
    "extend and withProps": "foundations 9",
    "theme defaults": "foundations 8",
    "theme classes": "foundations 8",
  },
});

const variantEntries: Entry[] = [
  ...builtVariants.map((variant): Entry => ({
    says: `variant="${variant}" writes data-variant="${variant}" on the root`,
    about: "prop variant",
    fixture: button({ variant }),
    assert: ({ root }) => {
      expect(root.getAttribute("data-variant"), "data-variant").toBe(variant);
    },
    status: "holds",
  })),
  ...missingVariants.map((variant): Entry => ({
    says: `variant="${variant}" writes data-variant="${variant}" on the root`,
    about: "prop variant",
    fixture: unbuiltButton({ variant }),
    assert: ({ root }) => {
      expect(root.getAttribute("data-variant"), "data-variant").toBe(variant);
    },
    status: { until: "Button 3", fails: `data-variant: expected 'filled' to be '${variant}'` },
  })),
  ...colourVariables.map((variable): Entry => ({
    says: `variant="filled" color="red" sets ${variable}, the colour variable of that name`,
    about: `variable ${variable}`,
    fixture: button({ variant: "filled", color: "red" }),
    assert: ({ root }) => {
      expect(variableOf(root, variable), `${variable} is set`).not.toBe("");
    },
    status: { until: "Button 3", fails: `${variable} is set: expected '' not to be ''` },
  })),
  {
    says: "with no color and no variant, --button-color is set and --button-bg, --button-hover and --button-bd are unset",
    about: "prop color",
    fixture: button(),
    assert: ({ root }) => {
      expect(variableOf(root, "--button-color"), "--button-color is set").not.toBe("");
      for (const variable of ["--button-bg", "--button-hover", "--button-bd"]) {
        expect(variableOf(root, variable), `${variable} is unset`).toBe("");
      }
    },
    status: { until: "Button 4", fails: "--button-color is set: expected '' not to be ''" },
  },
  {
    says: 'variant="gradient" with gradient draws a linear gradient as its background image',
    about: "prop gradient",
    fixture: unbuiltButton({ variant: "gradient", gradient: { from: "red", to: "blue", deg: 90 } }),
    assert: ({ root }) => {
      expect(getComputedStyle(root).backgroundImage, "background image").toMatch(
        /^linear-gradient/,
      );
    },
    status: { until: "foundations 12", fails: "background image: expected 'none' to match" },
  },
  {
    says: "autoContrast is on unless false is given: a filled yellow Button's text is the one autoContrast picks",
    about: "prop autoContrast",
    fixture: button({ color: "yellow" }),
    assert: ({ root, update }) => {
      const unset = getComputedStyle(root).color;
      update({ autoContrast: false });
      expect(getComputedStyle(root).color, "the text without autoContrast").not.toBe(unset);
      update({ autoContrast: true });
      expect(getComputedStyle(root).color, "the text with autoContrast").toBe(unset);
    },
    status: { until: "foundations 11", fails: "the text without autoContrast: expected" },
  },
];

const sizeEntries: Entry[] = [
  ...sizeVariables.map((variable): Entry => ({
    says: `size="lg" sets ${variable} on the root, to a length the default size does not give it`,
    about: `variable ${variable}`,
    fixture: button({ size: "lg" }),
    assert: ({ root, update }) => {
      const given = variableOf(root, variable);
      expect(given, `${variable} is set`).not.toBe("");
      update({ size: undefined });
      expect(variableOf(root, variable), `${variable} follows the size`).not.toBe(given);
    },
    status: "holds",
  })),
  {
    says: 'size="lg" writes data-size="lg" on the root',
    about: "prop size",
    fixture: button({ size: "lg" }),
    assert: ({ root }) => {
      expect(root.getAttribute("data-size"), "data-size").toBe("lg");
    },
    status: { until: "Button 2", fails: "data-size: expected null to be 'lg'" },
  },
  {
    says: 'size="compact-sm" writes data-size="compact-sm" on the root',
    about: "prop size",
    fixture: button({ size: "compact-sm" }),
    assert: ({ root }) => {
      expect(root.getAttribute("data-size"), "data-size").toBe("compact-sm");
    },
    status: { until: "Button 2", fails: "data-size: expected null to be 'compact-sm'" },
  },
  {
    says: 'radius="lg" sets --button-radius on the root, to a radius the default does not give it',
    about: "prop radius",
    fixture: button({ radius: "lg" }),
    assert: ({ root, update }) => {
      const given = variableOf(root, "--button-radius");
      expect(given, "--button-radius is set").not.toBe("");
      update({ radius: undefined });
      expect(variableOf(root, "--button-radius"), "--button-radius follows the radius").not.toBe(
        given,
      );
    },
    status: "holds",
  },
  {
    says: "with no radius, --button-radius is unset, so the root takes the theme's default radius",
    about: "variable --button-radius",
    fixture: button(),
    assert: ({ root }) => {
      expect(variableOf(root, "--button-radius"), "--button-radius is unset").toBe("");
    },
    status: { until: "Button 5", fails: "--button-radius is unset: expected '1.5rem' to be ''" },
  },
  {
    says: 'justify="space-between" sets --button-justify on the root',
    about: "prop justify",
    fixture: unbuiltButton({ justify: "space-between" }),
    assert: ({ root }) => {
      expect(variableOf(root, "--button-justify"), "--button-justify").toBe("space-between");
    },
    status: { until: "Button 6", fails: "--button-justify: expected '' to be 'space-between'" },
  },
  {
    says: "with no justify, --button-justify is unset",
    about: "variable --button-justify",
    fixture: button(),
    assert: ({ root }) => {
      expect(variableOf(root, "--button-justify"), "--button-justify is unset").toBe("");
    },
    status: "holds",
  },
];

const rootEntries: Entry[] = [
  {
    says: "with no component the root is a native button",
    about: "prop component",
    fixture: button(),
    assert: ({ root }) => {
      expect(root.localName, "the root").toBe("button");
    },
    status: "holds",
  },
  {
    says: 'with no component the root has type="button", and as component="a" none',
    about: "prop component",
    fixture: button(),
    assert: ({ root, container, update }) => {
      expect(root.getAttribute("type"), "type").toBe("button");
      update({ component: "a" });
      expect(container.querySelector("a")?.hasAttribute("type"), "type of a link").toBe(false);
    },
    status: { until: "Button 1", fails: "type: expected null to be 'button'" },
  },
  {
    says: 'with no variant the root has data-variant="filled"',
    about: "prop variant",
    fixture: button(),
    assert: ({ root }) => {
      expect(root.getAttribute("data-variant"), "data-variant").toBe("filled");
    },
    status: "holds",
  },
  {
    says: "children render inside the label part, inside the inner part, inside the root",
    about: "prop children",
    fixture: button(),
    assert: ({ root, at }) => {
      expect(at({ part: "inner" }).parentElement, "the inner part's parent").toBe(root);
      expect(at({ part: "label" }).parentElement, "the label's parent").toBe(at({ part: "inner" }));
      expect(at({ part: "label" }).textContent, "the label").toBe(buttonLabel);
    },
    status: { until: "Button 15", fails: { part: "inner" } },
  },
  {
    says: "fullWidth writes data-block on the root",
    about: "prop fullWidth",
    fixture: unbuiltButton({ fullWidth: true }),
    assert: ({ root }) => {
      expect(root.hasAttribute("data-block"), "data-block").toBe(true);
    },
    status: { until: "Button 7", fails: "data-block: expected false to be true" },
  },
  {
    says: 'leftSection renders a section part with data-position="left" before the label, and writes data-with-left-section',
    about: "prop leftSection",
    fixture: unbuiltButton({ leftSection: "test-left-section" }),
    assert: ({ root, at }) => {
      const section = at({ part: "section" });
      expect(section.getAttribute("data-position"), "data-position").toBe("left");
      expect(section.textContent, "the section").toBe("test-left-section");
      expect(section.nextElementSibling, "after the section").toBe(at({ part: "label" }));
      expect(root.hasAttribute("data-with-left-section"), "data-with-left-section").toBe(true);
    },
    status: { until: "Button 8", fails: { part: "section" } },
  },
  {
    says: 'rightSection renders a section part with data-position="right" after the label, and writes data-with-right-section',
    about: "prop rightSection",
    fixture: unbuiltButton({ rightSection: "test-right-section" }),
    assert: ({ root, at }) => {
      const section = at({ part: "section" });
      expect(section.getAttribute("data-position"), "data-position").toBe("right");
      expect(section.textContent, "the section").toBe("test-right-section");
      expect(section.previousElementSibling, "before the section").toBe(at({ part: "label" }));
      expect(root.hasAttribute("data-with-right-section"), "data-with-right-section").toBe(true);
    },
    status: { until: "Button 8", fails: { part: "section" } },
  },
  {
    says: "disabled sets the disabled attribute, and false removes it",
    about: "prop disabled",
    fixture: button({ disabled: true }),
    assert: ({ root, update }) => {
      expect(root.hasAttribute("disabled"), "disabled").toBe(true);
      update({ disabled: false });
      expect(root.hasAttribute("disabled"), "disabled after false").toBe(false);
    },
    status: "holds",
  },
  {
    says: "disabled writes data-disabled, and false removes it",
    about: "prop disabled",
    fixture: button({ disabled: true }),
    assert: ({ root, update }) => {
      expect(root.hasAttribute("data-disabled"), "data-disabled").toBe(true);
      update({ disabled: false });
      expect(root.hasAttribute("data-disabled"), "data-disabled after false").toBe(false);
    },
    status: { until: "Button 9", fails: "data-disabled: expected false to be true" },
  },
  {
    says: "data-disabled writes data-disabled and no disabled attribute, and false removes it",
    about: "prop data-disabled",
    fixture: button({ "data-disabled": true }),
    assert: ({ root, update }) => {
      expect(root.hasAttribute("data-disabled"), "data-disabled").toBe(true);
      expect(root.hasAttribute("disabled"), "disabled").toBe(false);
      update({ "data-disabled": false });
      expect(root.hasAttribute("data-disabled"), "data-disabled after false").toBe(false);
    },
    status: "holds",
  },
  {
    says: "loading writes data-loading on the root and the label, and false removes it",
    about: "prop loading",
    fixture: unbuiltButton({ loading: true }),
    assert: ({ root, at, update }) => {
      expect(root.hasAttribute("data-loading"), "data-loading").toBe(true);
      expect(at({ part: "label" }).hasAttribute("data-loading"), "the label's data-loading").toBe(
        true,
      );
      update({ loading: false });
      expect(root.hasAttribute("data-loading"), "data-loading after false").toBe(false);
    },
    status: { until: "Button 10", fails: "data-loading: expected false to be true" },
  },
  {
    says: "a loading Button renders the loader part, hidden from assistive technology",
    about: "part loader",
    fixture: unbuiltButton({ loading: true }),
    assert: ({ at }) => {
      expect(at({ part: "loader" }).getAttribute("aria-hidden"), "aria-hidden").toBe("true");
    },
    status: { until: "Button 10", fails: { part: "loader" } },
  },
  {
    says: 'a loading Button has aria-disabled="true" and aria-busy="true"',
    about: "prop loading",
    fixture: unbuiltButton({ loading: true }),
    assert: ({ root }) => {
      expect(root.getAttribute("aria-disabled"), "aria-disabled").toBe("true");
      expect(root.getAttribute("aria-busy"), "aria-busy").toBe("true");
    },
    status: { until: "Button 10", fails: "aria-disabled: expected null to be 'true'" },
  },
  {
    says: "loaderProps reach the loader",
    about: "prop loaderProps",
    fixture: unbuiltButton({ loading: true, loaderProps: { "data-test-loader": "" } }),
    assert: ({ container }) => {
      expect(container.querySelector("[data-test-loader]"), "the loader").not.toBeNull();
    },
    status: { until: "Button 11", fails: "the loader: expected null not to be null" },
  },
  {
    says: "axe finds no violation in a Button named by aria-label",
    about: "export Button",
    fixture: button({ "aria-label": "test" }, []),
    assert: async ({ axe }) => {
      expect(await axe(), "axe").toEqual([]);
    },
    status: "holds",
  },
];

const groupEntries: Entry[] = [
  {
    says: "Button.Group and Button.GroupSection are static members of Button",
    about: "export Button.Group",
    fixture: button(),
    assert: ({ exports }) => {
      const holder = Object(exports.Button);
      expect(typeof Reflect.get(holder, "Group"), "Button.Group").toBe("function");
      expect(typeof Reflect.get(holder, "GroupSection"), "Button.GroupSection").toBe("function");
    },
    status: { until: "Button 17", fails: "Button.Group: expected 'undefined' to be 'function'" },
  },
  {
    says: 'Button.Group renders role="group" with data-orientation="horizontal" by default',
    about: "export Button.Group",
    fixture: group(),
    assert: ({ root }) => {
      expect(root.getAttribute("role"), "role").toBe("group");
      expect(root.getAttribute("data-orientation"), "data-orientation").toBe("horizontal");
    },
    status: { until: "Button 17", fails: { export: "Button.Group" } },
  },
  {
    says: 'Button.Group orientation="vertical" writes data-orientation="vertical"',
    about: "export Button.Group",
    fixture: group({ orientation: "vertical" }),
    assert: ({ root }) => {
      expect(root.getAttribute("data-orientation"), "data-orientation").toBe("vertical");
    },
    status: { until: "Button 17", fails: { export: "Button.Group" } },
  },
  {
    says: "Button.Group borderWidth=2 sets --button-border-width",
    about: "export Button.Group",
    fixture: group({ borderWidth: 2 }),
    assert: ({ root }) => {
      expect(variableOf(root, "--button-border-width"), "--button-border-width").not.toBe("");
    },
    status: { until: "Button 17", fails: { export: "Button.Group" } },
  },
  {
    says: 'Button.GroupSection size="md" sets --section-height',
    about: "export Button.GroupSection",
    fixture: fixture("Button.GroupSection", { size: "md" }, "Section"),
    assert: ({ root }) => {
      expect(variableOf(root, "--section-height"), "--section-height").not.toBe("");
    },
    status: { until: "Button 19", fails: { export: "Button.GroupSection" } },
  },
  {
    says: "axe finds no violation in a Button.Group of two named buttons",
    about: "export Button.Group",
    fixture: group(),
    assert: async ({ axe }) => {
      expect(await axe(), "axe").toEqual([]);
    },
    status: { until: "Button 20", fails: { export: "Button.Group" } },
  },
];

export const buttonSpec: FunctionSpec<typeof reference> = {
  reference,
  entries: [...shared, ...rootEntries, ...variantEntries, ...sizeEntries, ...groupEntries],
};
