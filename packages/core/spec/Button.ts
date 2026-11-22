import { createComponent, dynamic, type JSX } from "@solidjs/web";
import { merge } from "solid-js";
import { expect, vi } from "vite-plus/test";
import { defineSpec, dom, type Fixture, type SpecEntry, story, style } from "#/spec/format.ts";

const label = "Save";
const button: Fixture = { component: "Button", children: label };
const salmon = "rgb(250, 128, 114)";
const parts = ["root", "inner", "label", "loader", "section"] as const;
const sizeKeys = ["xs", "sm", "md", "lg", "xl"] as const;
const builtVariants = ["default", "filled", "light", "outline", "subtle", "transparent"] as const;
const missingVariants = ["white", "gradient"] as const;
const colourVariables = [
  ["--button-bg", "var(--solix-color-red-6)"],
  ["--button-hover", "var(--solix-color-red-7)"],
  ["--button-color", "var(--solix-color-red-contrast)"],
  ["--button-bd", "transparent"],
  ["--button-hover-color", "var(--solix-color-red-contrast)"],
] as const;
const compactHeights = {
  "compact-xs": "1.75rem",
  "compact-sm": "2rem",
  "compact-md": "2.25rem",
  "compact-lg": "2.5rem",
  "compact-xl": "3rem",
} as const;

function buttonWith(props: Fixture["props"], children: Fixture["children"] = label): Fixture {
  return { component: "Button", props, children };
}

function group(props: Fixture["props"] = {}): Fixture {
  return {
    component: "Button.Group",
    props: { "aria-label": "Actions", ...props },
    children: [buttonWith({}, "One"), buttonWith({}, "Two")],
  };
}

function partClasses(): Record<string, string> {
  return Object.fromEntries(parts.map((part) => [part, `test-${part}`]));
}

function refEntry(): SpecEntry {
  const received: Element[] = [];
  return {
    says: "ref receives the root element",
    promise: { kind: "prop", prop: "ref" },
    check: dom(buttonWith({ ref: (element: Element) => received.push(element) }), ({ root }) => {
      expect(received).toEqual([root]);
    }),
    ported: "shared suite, supports ref",
    status: "holds",
  };
}

const sizeEntries = sizeKeys.flatMap((key): SpecEntry[] => [
  {
    says: `size="${key}" sets --button-height to the ${key} control height`,
    promise: { kind: "variable", variable: "--button-height" },
    check: style(
      buttonWith({ size: key }),
      "--button-height",
      `var(--solix-control-height-${key})`,
    ),
    status: "holds",
  },
  {
    says: `size="${key}" sets --button-padding-x to the ${key} control padding`,
    promise: { kind: "variable", variable: "--button-padding-x" },
    check: style(
      buttonWith({ size: key }),
      "--button-padding-x",
      `var(--solix-control-padding-${key})`,
    ),
    status: "holds",
  },
  {
    says: `size="${key}" sets --button-fz to the ${key} font size`,
    promise: { kind: "variable", variable: "--button-fz" },
    check: style(buttonWith({ size: key }), "--button-fz", `var(--solix-font-size-${key})`),
    status: "holds",
  },
]);

const compactEntries = Object.entries(compactHeights).flatMap(([key, height]): SpecEntry[] => [
  {
    says: `size="${key}" sets --button-height to the compact height`,
    promise: { kind: "prop", prop: "size", value: key },
    check: style(buttonWith({ size: key }), "--button-height", height),
    status: "pending",
    until: "Button 2",
  },
  {
    says: `size="${key}" keeps the font size of its full size`,
    promise: { kind: "prop", prop: "size", value: key },
    check: style(
      buttonWith({ size: key }),
      "--button-fz",
      `var(--solix-font-size-${key.replace("compact-", "")})`,
    ),
    status: "pending",
    until: "Button 2",
  },
]);

const variantEntries: SpecEntry[] = [
  ...builtVariants.map((variant): SpecEntry => ({
    says: `variant="${variant}" sets data-variant="${variant}" on the root`,
    promise: { kind: "prop", prop: "variant", value: variant },
    check: dom(buttonWith({ variant }), ({ root }) => {
      expect(root.getAttribute("data-variant")).toBe(variant);
    }),
    status: "holds",
  })),
  ...missingVariants.map((variant): SpecEntry => ({
    says: `variant="${variant}" sets data-variant="${variant}" on the root`,
    promise: { kind: "prop", prop: "variant", value: variant },
    check: dom(buttonWith({ variant }), ({ root }) => {
      expect(root.getAttribute("data-variant")).toBe(variant);
    }),
    status: "pending",
    until: "Button 3",
  })),
  ...colourVariables.map(([variable, value]): SpecEntry => ({
    says: `variant="filled" color="red" sets ${variable}, the colour variable of that name`,
    promise: { kind: "variable", variable },
    check: style(buttonWith({ variant: "filled", color: "red" }), variable, value),
    status: "pending",
    until: "Button 3",
  })),
];

const stylesApiEntries: SpecEntry[] = [
  {
    says: "the tree is root > inner > label, with the children in the label",
    promise: { kind: "part", part: "inner" },
    check: dom(button, ({ root, part }) => {
      expect(part("inner").parentElement).toBe(root);
      expect(part("label").parentElement).toBe(part("inner"));
      expect(part("label").textContent).toBe(label);
    }),
    status: "pending",
    until: "Button 15",
  },
  {
    says: "every part carries its stable class",
    promise: { kind: "part", part: "section" },
    check: dom(buttonWith({ loading: true, leftSection: "$" }), ({ part }) => {
      for (const name of parts) expect(part(name).classList).toContain(`solix-Button-${name}`);
    }),
    ported: "shared suite, supports styles api: static classNames (default)",
    status: "pending",
    until: "Button 15",
  },
  {
    says: "the root carries its stable class",
    promise: { kind: "part", part: "root" },
    check: dom(button, ({ root }) => {
      expect(root.classList).toContain("solix-Button-root");
    }),
    ported: "shared suite, supports styles api: static classNames (default), root",
    status: "holds",
  },
  {
    says: "classes puts a class on each of root, inner, label, loader and section",
    promise: { kind: "prop", prop: "classes" },
    check: dom(
      buttonWith({ loading: true, leftSection: "$", classes: partClasses() }),
      ({ container }) => {
        for (const name of parts) {
          expect(container.querySelector(`.test-${name}`), name).not.toBeNull();
        }
      },
    ),
    ported: "shared suite, supports styles api: classNames (inline object)",
    status: "pending",
    until: "Button 15",
  },
  {
    says: "classes puts a class on the root",
    promise: { kind: "prop", prop: "classes" },
    check: dom(buttonWith({ classes: { root: "test-root" } }), ({ root }) => {
      expect(root.classList).toContain("test-root");
    }),
    ported: "shared suite, supports styles api: classNames (inline object), root",
    status: "holds",
  },
  {
    says: "styles puts a declaration on each of root, inner, label, loader and section",
    promise: { kind: "prop", prop: "styles" },
    check: dom(
      buttonWith({
        loading: true,
        leftSection: "$",
        styles: Object.fromEntries(parts.map((part) => [part, { "outline-color": salmon }])),
      }),
      ({ part }) => {
        for (const name of parts) {
          expect(getComputedStyle(part(name)).outlineColor, name).toBe(salmon);
        }
      },
    ),
    ported: "shared suite, supports styles api: styles (inline object)",
    status: "pending",
    until: "Button 15",
  },
  {
    says: "styles puts a declaration on the root",
    promise: { kind: "prop", prop: "styles" },
    check: style(
      buttonWith({ styles: { root: { "outline-color": salmon } } }),
      "outline-color",
      salmon,
    ),
    ported: "shared suite, supports styles api: styles (inline object), root",
    status: "holds",
  },
  {
    says: "attributes puts an attribute on each of root, inner, label, loader and section",
    promise: { kind: "prop", prop: "attributes" },
    check: dom(
      buttonWith({
        loading: true,
        leftSection: "$",
        attributes: Object.fromEntries(parts.map((part) => [part, { "data-test-id": part }])),
      }),
      ({ container }) => {
        for (const name of parts) {
          expect(container.querySelector(`[data-test-id="${name}"]`), name).not.toBeNull();
        }
      },
    ),
    ported: "shared suite, supports styles api: attributes",
    status: "pending",
    until: "Button 15",
  },
  {
    says: "unstyled drops the library's look from every part and keeps their stable classes",
    promise: { kind: "prop", prop: "unstyled", value: true },
    check: dom(buttonWith({ unstyled: true, loading: true, leftSection: "$" }), ({ part }) => {
      for (const name of parts) {
        expect([...part(name).classList], name).toEqual([`solix-Button-${name}`]);
      }
    }),
    status: "pending",
    until: "Button 15",
  },
  {
    says: "Button carries its static varsResolver",
    promise: { kind: "behaviour" },
    check: dom(button, ({ exports }) => {
      expect(typeof Reflect.get(Object(exports.Button), "varsResolver")).toBe("function");
    }),
    ported: "shared suite, has static varsResolver",
    status: "pending",
    until: "step 1",
  },
];

const sharedSuiteEntries: SpecEntry[] = [
  {
    says: "class reaches the root beside its own classes",
    promise: { kind: "prop", prop: "class" },
    check: dom(buttonWith({ class: "test-class-name" }), ({ root }) => {
      expect(root.classList).toContain("test-class-name");
      expect(root.classList).toContain("solix-Button-root");
    }),
    ported: "shared suite, supports className prop",
    status: "holds",
  },
  {
    says: "another attribute reaches the root",
    promise: { kind: "behaviour" },
    check: dom(buttonWith({ "data-test-attribute": true }), ({ root }) => {
      expect(root.hasAttribute("data-test-attribute")).toBe(true);
    }),
    ported: "shared suite, supports ...others props",
    status: "holds",
  },
  {
    says: "id reaches the root",
    promise: { kind: "prop", prop: "id" },
    check: dom(buttonWith({ id: "test-id" }), ({ root }) => {
      expect(root.id).toBe("test-id");
    }),
    ported: "shared suite, supports id",
    status: "holds",
  },
  refEntry(),
  {
    says: "children are rendered",
    promise: { kind: "prop", prop: "children" },
    check: dom(buttonWith({}, "test-children"), ({ root }) => {
      expect(root.textContent).toBe("test-children");
    }),
    ported: "shared suite, renders children",
    status: "holds",
  },
  {
    says: "style given as an object reaches the root",
    promise: { kind: "prop", prop: "style" },
    check: style(buttonWith({ style: { "outline-color": salmon } }), "outline-color", salmon),
    ported: "shared suite, supports style: object",
    status: "holds",
  },
  {
    says: "component given an element name renders the root as that element with every Button class and attribute",
    promise: { kind: "prop", prop: "component", value: "a" },
    check: dom(buttonWith({ component: "a", href: "#test-link" }), ({ root }) => {
      expect(root.localName).toBe("a");
      expect(root.getAttribute("href")).toBe("#test-link");
      expect(root.classList).toContain("solix-Button-root");
      expect(root.getAttribute("data-variant")).toBe("filled");
    }),
    ported: "shared suite, is polymorphic: html element",
    status: "holds",
  },
  {
    says: "component given a component renders it as the root with the props of both",
    promise: { kind: "prop", prop: "component" },
    check: dom(
      buttonWith({
        "data-parent-prop": "",
        component: (props: JSX.HTMLAttributes<HTMLElement>) =>
          createComponent(
            dynamic(() => "mark"),
            merge(props, { "data-child-prop": "" }),
          ),
      }),
      ({ root }) => {
        expect(root.localName).toBe("mark");
        expect(root.hasAttribute("data-child-prop")).toBe(true);
        expect(root.hasAttribute("data-parent-prop")).toBe(true);
        expect(root.classList).toContain("solix-Button-root");
      },
    ),
    ported: "shared suite, is polymorphic: component",
    status: "holds",
  },
  {
    says: "renderRoot receives the root's props and what it returns is the root",
    promise: { kind: "prop", prop: "renderRoot" },
    check: dom(
      buttonWith({
        renderRoot: () => {
          const link = document.createElement("a");
          link.href = "#test-link";
          return link;
        },
      }),
      ({ root }) => {
        expect(root.localName).toBe("a");
        expect(root.classList).toContain("solix-Button-root");
      },
    ),
    ported: "shared suite, is polymorphic: renderRoot",
    status: "pending",
    until: "Button 14",
  },
  {
    says: "variant given any string sets data-variant to that string",
    promise: { kind: "attribute", attribute: "data-variant" },
    check: dom(buttonWith({ variant: "__test-variant" }), ({ root }) => {
      expect(root.getAttribute("data-variant")).toBe("__test-variant");
    }),
    ported: "shared suite, supports variant",
    status: "pending",
    until: "Button 3",
  },
  {
    says: "mod writes its data attributes on the root",
    promise: { kind: "prop", prop: "mod" },
    check: dom(buttonWith({ mod: ["test", { test2: true, test3: false }] }), ({ root }) => {
      expect(root.hasAttribute("data-test")).toBe(true);
      expect(root.hasAttribute("data-test2")).toBe(true);
      expect(root.hasAttribute("data-test3")).toBe(false);
    }),
    ported: "shared suite, supports mod",
    status: "pending",
    until: "foundations 1",
  },
  {
    says: "a consumer's onFocus and onBlur are called once per focus and blur",
    promise: { kind: "behaviour" },
    check: dom(button, ({ root, update }) => {
      const onFocus = vi.fn();
      const onBlur = vi.fn();
      update({ onFocus, onBlur });
      root.focus();
      root.blur();
      expect(onFocus).toHaveBeenCalledOnce();
      expect(onBlur).toHaveBeenCalledOnce();
    }),
    ported: "focus events suite, supports focus events",
    status: "holds",
  },
  {
    says: "axe finds no violation in a Button named by aria-label",
    promise: { kind: "behaviour" },
    check: dom(buttonWith({ "aria-label": "test" }, []), async ({ axe }) => {
      expect(await axe()).toEqual([]);
    }),
    ported: "axe suite, Button with aria-label",
    status: "holds",
  },
];

const behaviourEntries: SpecEntry[] = [
  {
    says: "with no props the root is a native button",
    promise: { kind: "default", prop: "component", value: "button" },
    check: dom(button, ({ root }) => {
      expect(root.localName).toBe("button");
    }),
    status: "holds",
  },
  {
    says: 'with no component the root has type="button", and with another element none',
    promise: { kind: "default", prop: "type", value: "button" },
    check: dom(button, ({ root, container, update }) => {
      expect(root.getAttribute("type")).toBe("button");
      update({ component: "a" });
      expect(container.querySelector("a")?.hasAttribute("type")).toBe(false);
    }),
    status: "pending",
    until: "Button 1",
  },
  {
    says: 'with no props the root has data-variant="filled"',
    promise: { kind: "default", prop: "variant", value: "filled" },
    check: dom(button, ({ root }) => {
      expect(root.getAttribute("data-variant")).toBe("filled");
    }),
    status: "holds",
  },
  {
    says: "with no props the filled background is the primary palette's solid shade",
    promise: { kind: "default", prop: "color", value: "primary" },
    check: style(button, "background-color", "var(--solix-color-primary-6)"),
    status: "holds",
  },
  {
    says: "with no props the size is sm",
    promise: { kind: "default", prop: "size", value: "sm" },
    check: style(button, "--button-height", "var(--solix-control-height-sm)"),
    status: "holds",
  },
  {
    says: "with no radius, --button-radius is unset and the root takes the theme's default radius",
    promise: { kind: "variable", variable: "--button-radius" },
    check: style(button, "--button-radius", null),
    status: "pending",
    until: "Button 5",
  },
  {
    says: 'size="lg" sets data-size="lg" on the root',
    promise: { kind: "attribute", attribute: "data-size" },
    check: dom(buttonWith({ size: "lg" }), ({ root }) => {
      expect(root.getAttribute("data-size")).toBe("lg");
    }),
    status: "pending",
    until: "Button 2",
  },
  {
    says: "a size given as a length sets the height, padding and font size to it",
    promise: { kind: "prop", prop: "size", value: "3rem" },
    check: dom(buttonWith({ size: "3rem" }), ({ root }) => {
      const computed = getComputedStyle(root);
      expect(computed.getPropertyValue("--button-height").trim()).toBe("3rem");
      expect(computed.getPropertyValue("--button-padding-x").trim()).toBe("3rem");
      expect(computed.getPropertyValue("--button-fz").trim()).toBe("3rem");
    }),
    status: "holds",
  },
  {
    says: "with no color and no variant, --button-color is set and the other colour variables are unset",
    promise: { kind: "variable", variable: "--button-color" },
    check: dom(button, ({ root }) => {
      const computed = getComputedStyle(root);
      expect(computed.getPropertyValue("--button-color")).not.toBe("");
      for (const variable of ["--button-bg", "--button-hover", "--button-bd"]) {
        expect(computed.getPropertyValue(variable), variable).toBe("");
      }
    }),
    status: "pending",
    until: "Button 4",
  },
  {
    says: "a consumer's --button-bg on style wins over the variant's background",
    promise: { kind: "variable", variable: "--button-bg" },
    check: style(buttonWith({ style: { "--button-bg": salmon } }), "background-color", salmon),
    status: "pending",
    until: "Button 16",
  },
  {
    says: "a CSS colour given to the outline variant draws its border in that colour",
    promise: { kind: "prop", prop: "color" },
    check: style(
      buttonWith({ variant: "outline", color: "oklch(0.45 0.15 260)" }),
      "border-top-color",
      "oklch(0.45 0.15 260)",
    ),
    status: "holds",
  },
  {
    says: "radius sets the root's border radius",
    promise: { kind: "prop", prop: "radius", value: "lg" },
    check: style(buttonWith({ radius: "lg" }), "border-top-left-radius", "var(--solix-radius-lg)"),
    status: "holds",
  },
  {
    says: "justify sets --button-justify on the root and the inner part's justify-content reads it",
    promise: { kind: "prop", prop: "justify", value: "space-between" },
    check: dom(buttonWith({ justify: "space-between" }), ({ root, part }) => {
      expect(getComputedStyle(root).getPropertyValue("--button-justify")).toBe("space-between");
      expect(getComputedStyle(part("inner")).justifyContent).toBe("space-between");
    }),
    status: "pending",
    until: "Button 6",
  },
  {
    says: "the inner part centres its content by default",
    promise: { kind: "default", prop: "justify", value: "center" },
    check: style(button, "justify-content", "center", { part: "inner" }),
    status: "pending",
    until: "Button 6",
  },
  {
    says: "fullWidth sets data-block and the root takes the full width",
    promise: { kind: "prop", prop: "fullWidth", value: true },
    check: dom(buttonWith({ fullWidth: true }), ({ root, container }) => {
      expect(root.hasAttribute("data-block")).toBe(true);
      expect(root.getBoundingClientRect().width).toBe(container.getBoundingClientRect().width);
    }),
    status: "pending",
    until: "Button 7",
  },
  {
    says: 'leftSection renders a section with data-position="left" before the label and sets data-with-left-section',
    promise: { kind: "attribute", attribute: "data-with-left-section" },
    check: dom(buttonWith({ leftSection: "test-left-section" }), ({ root, part }) => {
      const section = part("section");
      expect(section.getAttribute("data-position")).toBe("left");
      expect(section.textContent).toBe("test-left-section");
      expect(section.nextElementSibling).toBe(part("label"));
      expect(root.hasAttribute("data-with-left-section")).toBe(true);
    }),
    ported: "Button suite, renders given left section",
    status: "pending",
    until: "Button 8",
  },
  {
    says: 'rightSection renders a section with data-position="right" after the label and sets data-with-right-section',
    promise: { kind: "attribute", attribute: "data-with-right-section" },
    check: dom(buttonWith({ rightSection: "test-right-section" }), ({ root, part }) => {
      const section = part("section");
      expect(section.getAttribute("data-position")).toBe("right");
      expect(section.textContent).toBe("test-right-section");
      expect(section.previousElementSibling).toBe(part("label"));
      expect(root.hasAttribute("data-with-right-section")).toBe(true);
    }),
    ported: "Button suite, renders given right section",
    status: "pending",
    until: "Button 8",
  },
  {
    says: "disabled sets the disabled attribute, and false removes it",
    promise: { kind: "prop", prop: "disabled", value: true },
    check: dom(buttonWith({ disabled: true }), ({ root, update }) => {
      expect(root.hasAttribute("disabled")).toBe(true);
      update({ disabled: false });
      expect(root.hasAttribute("disabled")).toBe(false);
    }),
    ported: "Button suite, sets disabled attribute when disabled prop is set to true",
    status: "holds",
  },
  {
    says: "disabled sets data-disabled, and false removes it",
    promise: { kind: "attribute", attribute: "data-disabled" },
    check: dom(buttonWith({ disabled: true }), ({ root, update }) => {
      expect(root.hasAttribute("data-disabled")).toBe(true);
      update({ disabled: false });
      expect(root.hasAttribute("data-disabled")).toBe(false);
    }),
    ported: "Button suite, sets data-disabled attribute when disabled prop is set to true",
    status: "pending",
    until: "Button 9",
  },
  {
    says: "data-disabled sets data-disabled and keeps the button focusable, and false removes it",
    promise: { kind: "attribute", attribute: "data-disabled" },
    check: dom(buttonWith({ "data-disabled": true }), ({ root, update }) => {
      expect(root.hasAttribute("data-disabled")).toBe(true);
      expect(root.hasAttribute("disabled")).toBe(false);
      root.focus();
      expect(document.activeElement).toBe(root);
      update({ "data-disabled": false });
      expect(root.hasAttribute("data-disabled")).toBe(false);
    }),
    ported: "Button suite, sets data-disabled attribute when data-disabled prop is set to true",
    status: "holds",
  },
  {
    says: "a disabled button does not call onClick",
    promise: { kind: "behaviour" },
    check: dom(buttonWith({ disabled: true }), ({ root, update }) => {
      const onClick = vi.fn();
      update({ onClick });
      root.click();
      expect(onClick).not.toHaveBeenCalled();
    }),
    status: "holds",
  },
  {
    says: "loading sets data-loading on the root and the label, and false removes it",
    promise: { kind: "attribute", attribute: "data-loading" },
    check: dom(buttonWith({ loading: true }), ({ root, part, update }) => {
      expect(root.hasAttribute("data-loading")).toBe(true);
      expect(part("label").hasAttribute("data-loading")).toBe(true);
      update({ loading: false });
      expect(root.hasAttribute("data-loading")).toBe(false);
    }),
    ported: "Button suite, sets data-loading attribute when loading prop is set to true",
    status: "pending",
    until: "Button 10",
  },
  {
    says: "a loading button renders the loader part hidden from assistive technology",
    promise: { kind: "part", part: "loader" },
    check: dom(buttonWith({ loading: true }), ({ part }) => {
      expect(part("loader").getAttribute("aria-hidden")).toBe("true");
    }),
    status: "pending",
    until: "Button 10",
  },
  {
    says: 'a loading button keeps focus, has aria-disabled="true" and aria-busy="true", and does not call onClick',
    promise: { kind: "prop", prop: "loading", value: true },
    check: dom(buttonWith({ loading: true }), ({ root, update }) => {
      const onClick = vi.fn();
      update({ onClick });
      root.focus();
      expect(document.activeElement).toBe(root);
      expect(root.getAttribute("aria-disabled")).toBe("true");
      expect(root.getAttribute("aria-busy")).toBe("true");
      root.click();
      expect(onClick).not.toHaveBeenCalled();
    }),
    status: "pending",
    until: "Button 10",
  },
  {
    says: "loaderProps reach the loader",
    promise: { kind: "prop", prop: "loaderProps" },
    check: dom(
      buttonWith({ loading: true, loaderProps: { "data-test-loader": "" } }),
      ({ container }) => {
        expect(container.querySelector("[data-test-loader]")).not.toBeNull();
      },
    ),
    status: "pending",
    until: "Button 11",
  },
];

const groupEntries: SpecEntry[] = [
  {
    says: "Button.Group and Button.GroupSection are static members of Button",
    promise: { kind: "behaviour" },
    check: dom(button, ({ exports }) => {
      expect(typeof Reflect.get(Object(exports.Button), "Group")).toBe("function");
      expect(typeof Reflect.get(Object(exports.Button), "GroupSection")).toBe("function");
    }),
    ported: "Button suite, exposes Button.Group component",
    status: "pending",
    until: "Button 17",
  },
  {
    says: 'Button.Group renders role="group" with data-orientation="horizontal" by default',
    promise: { kind: "default", prop: "orientation", value: "horizontal" },
    check: dom(group(), ({ root }) => {
      expect(root.getAttribute("role")).toBe("group");
      expect(root.getAttribute("data-orientation")).toBe("horizontal");
    }),
    status: "pending",
    until: "Button 17",
  },
  {
    says: "Button.Group sets data-orientation from orientation",
    promise: { kind: "prop", prop: "orientation", value: "vertical" },
    check: dom(group({ orientation: "vertical" }), ({ root }) => {
      expect(root.getAttribute("data-orientation")).toBe("vertical");
    }),
    ported:
      "ButtonGroup suite, adds data-orientation attribute to root element based on orientation prop",
    status: "pending",
    until: "Button 17",
  },
  {
    says: "Button.Group's borderWidth sets --button-border-width, a number in rem",
    promise: { kind: "variable", variable: "--button-border-width" },
    check: style(group({ borderWidth: 2 }), "--button-border-width", "0.125rem"),
    status: "pending",
    until: "Button 17",
  },
  {
    says: "in a horizontal group the first button loses its end radii and the last its start radii",
    promise: { kind: "behaviour" },
    check: dom(group(), ({ parts: all }) => {
      const [first, last] = all("root", "Button");
      expect(getComputedStyle(first).borderEndEndRadius).toBe("0px");
      expect(getComputedStyle(last).borderStartStartRadius).toBe("0px");
    }),
    status: "pending",
    until: "Button 18",
  },
  {
    says: "Button.GroupSection takes size and sets its --section-* variables",
    promise: { kind: "variable", variable: "--section-height" },
    check: style(
      { component: "Button.GroupSection", props: { size: "md" }, children: "Section" },
      "--section-height",
      "var(--solix-control-height-md)",
    ),
    ported: "ButtonGroupSection suite, supports system props (groupSection)",
    status: "pending",
    until: "Button 19",
  },
  {
    says: "axe finds no violation in a Button.Group of two named buttons",
    promise: { kind: "behaviour" },
    check: dom(group(), async ({ axe }) => {
      expect(await axe()).toEqual([]);
    }),
    ported: "axe suite, Button.Group with two buttons",
    status: "pending",
    until: "Button 20",
  },
];

const storyEntries: SpecEntry[] = [
  {
    says: "a press calls onClick once",
    promise: { kind: "behaviour" },
    check: story("Button", "Pressed"),
    status: "holds",
  },
  {
    says: "a disabled button cannot be pressed",
    promise: { kind: "prop", prop: "disabled", value: true },
    check: story("Button", "Disabled"),
    status: "holds",
  },
  {
    says: "the smallest size and radius are still 24 by 24 px",
    promise: { kind: "behaviour" },
    check: story("Button", "NeverBelowTheTargetSize"),
    status: "holds",
  },
  {
    says: "toggling loading keeps the width and shows the loader over the label",
    promise: { kind: "prop", prop: "loading" },
    check: story("Button", "Loading"),
    status: "pending",
    until: "Button 10",
  },
  {
    says: "a button inside a disabled fieldset looks disabled",
    promise: { kind: "behaviour" },
    check: story("Button", "InsideADisabledFieldset"),
    status: "pending",
    until: "Button 22",
  },
];

export const spec = defineSpec("Button", [
  ...behaviourEntries,
  ...sizeEntries,
  ...compactEntries,
  ...variantEntries,
  ...stylesApiEntries,
  ...sharedSuiteEntries,
  ...groupEntries,
  ...storyEntries,
]);
