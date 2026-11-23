import { expect, vi } from "vite-plus/test";
import { fixture } from "#/spec/fixtures.ts";
import { defineReference, defineSpec, dom, type Fixture, type SpecEntry } from "#/spec/format.ts";
import { sharedSuite } from "#/spec/shared.ts";

const reference = defineReference({
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
});

type Entry = SpecEntry<typeof reference>;

const label = "Save";
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

function button(props: Fixture["props"] = {}, children: Fixture["children"] = label): Fixture {
  return fixture("Button", props, children);
}

function group(props: Fixture["props"] = {}): Fixture {
  return fixture("Button.Group", { "aria-label": "Actions", ...props }, [
    button({}, "One"),
    button({}, "Two"),
  ]);
}

function variableOf(root: HTMLElement, variable: string): string {
  return getComputedStyle(root).getPropertyValue(variable);
}

const shared = sharedSuite({
  component: "Button",
  reference,
  fixture: button({ loading: true, leftSection: "$" }),
  until: {
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
    promise: { kind: "prop", prop: "variant", value: variant },
    check: dom(button({ variant }), ({ root }) => {
      expect(root.getAttribute("data-variant"), "data-variant").toBe(variant);
    }),
    status: "holds",
  })),
  ...missingVariants.map((variant): Entry => ({
    says: `variant="${variant}" writes data-variant="${variant}" on the root`,
    promise: { kind: "prop", prop: "variant", value: variant },
    check: dom(button({ variant }), ({ root }) => {
      expect(root.getAttribute("data-variant"), "data-variant").toBe(variant);
    }),
    status: "pending",
    until: "Button 3",
    failsWith: `data-variant: expected 'filled' to be '${variant}'`,
  })),
  ...colourVariables.map((variable): Entry => ({
    says: `variant="filled" color="red" sets ${variable}, the colour variable of that name`,
    promise: { kind: "variable", variable },
    check: dom(button({ variant: "filled", color: "red" }), ({ root }) => {
      expect(variableOf(root, variable), `${variable} is set`).not.toBe("");
    }),
    status: "pending",
    until: "Button 3",
    failsWith: `${variable} is set: expected '' not to be ''`,
  })),
  {
    says: "with no color and no variant, --button-color is set and --button-bg, --button-hover and --button-bd are unset",
    promise: { kind: "prop", prop: "color" },
    check: dom(button(), ({ root }) => {
      expect(variableOf(root, "--button-color"), "--button-color is set").not.toBe("");
      for (const variable of ["--button-bg", "--button-hover", "--button-bd"]) {
        expect(variableOf(root, variable), `${variable} is unset`).toBe("");
      }
    }),
    status: "pending",
    until: "Button 4",
    failsWith: "--button-color is set: expected '' not to be ''",
  },
  {
    says: 'variant="gradient" with gradient draws a linear gradient as its background image',
    promise: { kind: "prop", prop: "gradient" },
    check: dom(
      button({ variant: "gradient", gradient: { from: "red", to: "blue", deg: 90 } }),
      ({ root }) => {
        expect(getComputedStyle(root).backgroundImage, "background image").toMatch(
          /^linear-gradient/,
        );
      },
    ),
    status: "pending",
    until: "foundations 12",
    failsWith: "background image: expected 'none' to match",
  },
  {
    says: "autoContrast is on unless false is given: a filled yellow Button's text is the one autoContrast picks",
    promise: { kind: "default", prop: "autoContrast", value: true },
    check: dom(button({ color: "yellow" }), ({ root, update }) => {
      const unset = getComputedStyle(root).color;
      update({ autoContrast: true });
      expect(getComputedStyle(root).color, "the text with autoContrast").toBe(unset);
    }),
    status: "pending",
    until: "foundations 11",
    failsWith: "the text with autoContrast: expected",
  },
];

const sizeEntries: Entry[] = [
  ...sizeVariables.map((variable): Entry => ({
    says: `size="lg" sets ${variable} on the root`,
    promise: { kind: "variable", variable },
    check: dom(button({ size: "lg" }), ({ root }) => {
      expect(variableOf(root, variable), `${variable} is set`).not.toBe("");
    }),
    status: "holds",
  })),
  {
    says: 'size="lg" writes data-size="lg" on the root',
    promise: { kind: "prop", prop: "size", value: "lg" },
    check: dom(button({ size: "lg" }), ({ root }) => {
      expect(root.getAttribute("data-size"), "data-size").toBe("lg");
    }),
    status: "pending",
    until: "Button 2",
    failsWith: "data-size: expected null to be 'lg'",
  },
  {
    says: 'size="compact-sm" writes data-size="compact-sm" on the root',
    promise: { kind: "prop", prop: "size", value: "compact-sm" },
    check: dom(button({ size: "compact-sm" }), ({ root }) => {
      expect(root.getAttribute("data-size"), "data-size").toBe("compact-sm");
    }),
    status: "pending",
    until: "Button 2",
    failsWith: "data-size: expected null to be 'compact-sm'",
  },
  {
    says: 'radius="lg" sets --button-radius on the root',
    promise: { kind: "prop", prop: "radius", value: "lg" },
    check: dom(button({ radius: "lg" }), ({ root }) => {
      expect(variableOf(root, "--button-radius"), "--button-radius is set").not.toBe("");
    }),
    status: "holds",
  },
  {
    says: "with no radius, --button-radius is unset, so the root takes the theme's default radius",
    promise: { kind: "variable", variable: "--button-radius" },
    check: dom(button(), ({ root }) => {
      expect(variableOf(root, "--button-radius"), "--button-radius is unset").toBe("");
    }),
    status: "pending",
    until: "Button 5",
    failsWith: "--button-radius is unset: expected '1.5rem' to be ''",
  },
  {
    says: 'justify="space-between" sets --button-justify on the root',
    promise: { kind: "prop", prop: "justify", value: "space-between" },
    check: dom(button({ justify: "space-between" }), ({ root }) => {
      expect(variableOf(root, "--button-justify"), "--button-justify").toBe("space-between");
    }),
    status: "pending",
    until: "Button 6",
    failsWith: "--button-justify: expected '' to be 'space-between'",
  },
  {
    says: "with no justify, --button-justify is unset",
    promise: { kind: "variable", variable: "--button-justify" },
    check: dom(button(), ({ root }) => {
      expect(variableOf(root, "--button-justify"), "--button-justify is unset").toBe("");
    }),
    status: "holds",
  },
];

const behaviourEntries: Entry[] = [
  {
    says: "with no component the root is a native button",
    promise: { kind: "default", prop: "component", value: "button" },
    check: dom(button(), ({ root }) => {
      expect(root.localName, "the root").toBe("button");
    }),
    status: "holds",
  },
  {
    says: 'with no component the root has type="button", and as component="a" none',
    promise: { kind: "default", prop: "component", value: "button" },
    check: dom(button(), ({ root, container, update }) => {
      expect(root.getAttribute("type"), "type").toBe("button");
      update({ component: "a" });
      expect(container.querySelector("a")?.hasAttribute("type"), "type of a link").toBe(false);
    }),
    status: "pending",
    until: "Button 1",
    failsWith: "type: expected null to be 'button'",
  },
  {
    says: 'with no variant the root has data-variant="filled"',
    promise: { kind: "default", prop: "variant", value: "filled" },
    check: dom(button(), ({ root }) => {
      expect(root.getAttribute("data-variant"), "data-variant").toBe("filled");
    }),
    status: "holds",
  },
  {
    says: "children render inside the label part, inside the inner part, inside the root",
    promise: { kind: "prop", prop: "children" },
    check: dom(button(), ({ root, at }) => {
      expect(at({ part: "inner" }).parentElement, "the inner part's parent").toBe(root);
      expect(at({ part: "label" }).parentElement, "the label's parent").toBe(at({ part: "inner" }));
      expect(at({ part: "label" }).textContent, "the label").toBe(label);
    }),
    status: "pending",
    until: "Button 15",
    failsWith: "Button: it renders no inner part",
  },
  {
    says: "fullWidth writes data-block on the root",
    promise: { kind: "prop", prop: "fullWidth", value: true },
    check: dom(button({ fullWidth: true }), ({ root }) => {
      expect(root.hasAttribute("data-block"), "data-block").toBe(true);
    }),
    status: "pending",
    until: "Button 7",
    failsWith: "data-block: expected false to be true",
  },
  {
    says: 'leftSection renders a section part with data-position="left" before the label, and writes data-with-left-section',
    promise: { kind: "prop", prop: "leftSection" },
    check: dom(button({ leftSection: "test-left-section" }), ({ root, at }) => {
      const section = at({ part: "section" });
      expect(section.getAttribute("data-position"), "data-position").toBe("left");
      expect(section.textContent, "the section").toBe("test-left-section");
      expect(section.nextElementSibling, "after the section").toBe(at({ part: "label" }));
      expect(root.hasAttribute("data-with-left-section"), "data-with-left-section").toBe(true);
    }),
    status: "pending",
    until: "Button 8",
    failsWith: "Button: it renders no section part",
  },
  {
    says: 'rightSection renders a section part with data-position="right" after the label, and writes data-with-right-section',
    promise: { kind: "prop", prop: "rightSection" },
    check: dom(button({ rightSection: "test-right-section" }), ({ root, at }) => {
      const section = at({ part: "section" });
      expect(section.getAttribute("data-position"), "data-position").toBe("right");
      expect(section.textContent, "the section").toBe("test-right-section");
      expect(section.previousElementSibling, "before the section").toBe(at({ part: "label" }));
      expect(root.hasAttribute("data-with-right-section"), "data-with-right-section").toBe(true);
    }),
    status: "pending",
    until: "Button 8",
    failsWith: "Button: it renders no section part",
  },
  {
    says: "disabled sets the disabled attribute, and false removes it",
    promise: { kind: "prop", prop: "disabled", value: true },
    check: dom(button({ disabled: true }), ({ root, update }) => {
      expect(root.hasAttribute("disabled"), "disabled").toBe(true);
      update({ disabled: false });
      expect(root.hasAttribute("disabled"), "disabled after false").toBe(false);
    }),
    status: "holds",
  },
  {
    says: "disabled writes data-disabled, and false removes it",
    promise: { kind: "attribute", attribute: "data-disabled" },
    check: dom(button({ disabled: true }), ({ root, update }) => {
      expect(root.hasAttribute("data-disabled"), "data-disabled").toBe(true);
      update({ disabled: false });
      expect(root.hasAttribute("data-disabled"), "data-disabled after false").toBe(false);
    }),
    status: "pending",
    until: "Button 9",
    failsWith: "data-disabled: expected false to be true",
  },
  {
    says: "data-disabled writes data-disabled and keeps the button focusable, and false removes it",
    promise: { kind: "prop", prop: "data-disabled", value: true },
    check: dom(button({ "data-disabled": true }), ({ root, update }) => {
      expect(root.hasAttribute("data-disabled"), "data-disabled").toBe(true);
      expect(root.hasAttribute("disabled"), "disabled").toBe(false);
      root.focus();
      expect(document.activeElement, "focus").toBe(root);
      update({ "data-disabled": false });
      expect(root.hasAttribute("data-disabled"), "data-disabled after false").toBe(false);
    }),
    status: "holds",
  },
  {
    says: "a disabled Button does not call onClick",
    promise: { kind: "behaviour" },
    check: dom(button({ disabled: true }), ({ root, update }) => {
      const onClick = vi.fn();
      update({ onClick });
      root.click();
      expect(onClick, "onClick").not.toHaveBeenCalled();
    }),
    status: "holds",
  },
  {
    says: "loading writes data-loading on the root and the label, and false removes it",
    promise: { kind: "prop", prop: "loading", value: true },
    check: dom(button({ loading: true }), ({ root, at, update }) => {
      expect(root.hasAttribute("data-loading"), "data-loading").toBe(true);
      expect(at({ part: "label" }).hasAttribute("data-loading"), "the label's data-loading").toBe(
        true,
      );
      update({ loading: false });
      expect(root.hasAttribute("data-loading"), "data-loading after false").toBe(false);
    }),
    status: "pending",
    until: "Button 10",
    failsWith: "data-loading: expected false to be true",
  },
  {
    says: "a loading Button renders the loader part, hidden from assistive technology",
    promise: { kind: "part", part: "loader" },
    check: dom(button({ loading: true }), ({ at }) => {
      expect(at({ part: "loader" }).getAttribute("aria-hidden"), "aria-hidden").toBe("true");
    }),
    status: "pending",
    until: "Button 10",
    failsWith: "Button: it renders no loader part",
  },
  {
    says: 'a loading Button keeps focus, has aria-disabled="true" and aria-busy="true", and does not call onClick',
    promise: { kind: "behaviour" },
    check: dom(button({ loading: true }), ({ root, update }) => {
      const onClick = vi.fn();
      update({ onClick });
      root.focus();
      expect(document.activeElement, "focus").toBe(root);
      expect(root.getAttribute("aria-disabled"), "aria-disabled").toBe("true");
      expect(root.getAttribute("aria-busy"), "aria-busy").toBe("true");
      root.click();
      expect(onClick, "onClick").not.toHaveBeenCalled();
    }),
    status: "pending",
    until: "Button 10",
    failsWith: "aria-disabled: expected null to be 'true'",
  },
  {
    says: "loaderProps reach the loader",
    promise: { kind: "prop", prop: "loaderProps" },
    check: dom(
      button({ loading: true, loaderProps: { "data-test-loader": "" } }),
      ({ container }) => {
        expect(container.querySelector("[data-test-loader]"), "the loader").not.toBeNull();
      },
    ),
    status: "pending",
    until: "Button 11",
    failsWith: "the loader: expected null not to be null",
  },
  {
    says: "a consumer's onFocus and onBlur are called once per focus and blur",
    promise: { kind: "behaviour" },
    check: dom(button(), ({ root, update }) => {
      const onFocus = vi.fn();
      const onBlur = vi.fn();
      update({ onFocus, onBlur });
      root.focus();
      root.blur();
      expect(onFocus, "onFocus").toHaveBeenCalledOnce();
      expect(onBlur, "onBlur").toHaveBeenCalledOnce();
    }),
    status: "holds",
  },
  {
    says: "axe finds no violation in a Button named by aria-label",
    promise: { kind: "behaviour" },
    check: dom(button({ "aria-label": "test" }, []), async ({ axe }) => {
      expect(await axe(), "axe").toEqual([]);
    }),
    status: "holds",
  },
];

const groupEntries: Entry[] = [
  {
    says: "Button.Group and Button.GroupSection are static members of Button",
    promise: { kind: "behaviour" },
    check: dom(button(), ({ exports }) => {
      const holder = Object(exports.Button);
      expect(typeof Reflect.get(holder, "Group"), "Button.Group").toBe("function");
      expect(typeof Reflect.get(holder, "GroupSection"), "Button.GroupSection").toBe("function");
    }),
    status: "pending",
    until: "Button 17",
    failsWith: "Button.Group: expected 'undefined' to be 'function'",
  },
  {
    says: 'Button.Group renders role="group" with data-orientation="horizontal" by default',
    promise: { kind: "attribute", attribute: "data-orientation" },
    check: dom(group(), ({ root }) => {
      expect(root.getAttribute("role"), "role").toBe("group");
      expect(root.getAttribute("data-orientation"), "data-orientation").toBe("horizontal");
    }),
    status: "pending",
    until: "Button 17",
    failsWith: "Button.Group: the built library exports no component by this name",
  },
  {
    says: 'Button.Group orientation="vertical" writes data-orientation="vertical"',
    promise: { kind: "attribute", attribute: "data-orientation" },
    check: dom(group({ orientation: "vertical" }), ({ root }) => {
      expect(root.getAttribute("data-orientation"), "data-orientation").toBe("vertical");
    }),
    status: "pending",
    until: "Button 17",
    failsWith: "Button.Group: the built library exports no component by this name",
  },
  {
    says: "Button.Group borderWidth=2 sets --button-border-width",
    promise: { kind: "attribute", attribute: "--button-border-width" },
    check: dom(group({ borderWidth: 2 }), ({ root }) => {
      expect(variableOf(root, "--button-border-width"), "--button-border-width").not.toBe("");
    }),
    status: "pending",
    until: "Button 17",
    failsWith: "Button.Group: the built library exports no component by this name",
  },
  {
    says: 'Button.GroupSection size="md" sets --section-height',
    promise: { kind: "attribute", attribute: "--section-height" },
    check: dom(fixture("Button.GroupSection", { size: "md" }, "Section"), ({ root }) => {
      expect(variableOf(root, "--section-height"), "--section-height").not.toBe("");
    }),
    status: "pending",
    until: "Button 19",
    failsWith: "Button.GroupSection: the built library exports no component by this name",
  },
  {
    says: "axe finds no violation in a Button.Group of two named buttons",
    promise: { kind: "behaviour" },
    check: dom(group(), async ({ axe }) => {
      expect(await axe(), "axe").toEqual([]);
    }),
    status: "pending",
    until: "Button 20",
    failsWith: "Button.Group: the built library exports no component by this name",
  },
];

export const spec = defineSpec(reference, [
  ...shared,
  ...behaviourEntries,
  ...variantEntries,
  ...sizeEntries,
  ...groupEntries,
]);
