import { expect } from "vite-plus/test";
import { defineSpec, dom, type Fixture, style } from "#/spec/format.ts";

const box: Fixture = { component: "Box", children: "Content" };
const button: Fixture = { component: "Button", children: "Save" };
const salmon = "rgb(250, 128, 114)";
const olive = "rgb(128, 128, 0)";

function boxWith(props: Fixture["props"]): Fixture {
  return { ...box, props };
}

function buttonWith(props: Fixture["props"], within?: Fixture["within"]): Fixture {
  return { ...button, props, ...(within === undefined ? {} : { within }) };
}

function linkElement(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = "#test-link";
  return link;
}

export const spec = defineSpec("foundations", [
  {
    says: "mod given as a string writes that data attribute on the root",
    promise: { kind: "prop", prop: "mod", value: "test" },
    check: dom(boxWith({ mod: "test" }), ({ root }) => {
      expect(root.hasAttribute("data-test")).toBe(true);
    }),
    ported: "shared suite, supports mod: string",
    status: "pending",
    until: "foundations 1",
  },
  {
    says: "mod given as a record writes the data attribute of each true key and none of a false one",
    promise: { kind: "prop", prop: "mod" },
    check: dom(boxWith({ mod: { test: true, test2: false } }), ({ root }) => {
      expect(root.hasAttribute("data-test")).toBe(true);
      expect(root.hasAttribute("data-test2")).toBe(false);
    }),
    ported: "shared suite, supports mod: object",
    status: "pending",
    until: "foundations 1",
  },
  {
    says: "mod given as a list writes the data attribute of each string in it",
    promise: { kind: "prop", prop: "mod" },
    check: dom(boxWith({ mod: ["test", "test2"] }), ({ root }) => {
      expect(root.hasAttribute("data-test")).toBe(true);
      expect(root.hasAttribute("data-test2")).toBe(true);
    }),
    ported: "shared suite, supports mod: array",
    status: "pending",
    until: "foundations 1",
  },
  {
    says: "mod given as a list of a string and a record writes the data attribute of each",
    promise: { kind: "prop", prop: "mod" },
    check: dom(boxWith({ mod: ["test", { test2: true }] }), ({ root }) => {
      expect(root.hasAttribute("data-test")).toBe(true);
      expect(root.hasAttribute("data-test2")).toBe(true);
    }),
    ported: "shared suite, supports mod: array with object",
    status: "pending",
    until: "foundations 1",
  },
  {
    says: "mod writes a number as its value and drops a falsy entry of a list",
    promise: { kind: "prop", prop: "mod" },
    check: dom(boxWith({ mod: [{ count: 2 }, false, null, "", "kept"] }), ({ root }) => {
      expect(root.getAttribute("data-count")).toBe("2");
      expect(root.hasAttribute("data-kept")).toBe(true);
      expect(root.hasAttribute("data-false")).toBe(false);
    }),
    status: "pending",
    until: "foundations 1",
  },
  {
    says: "variant on a component with no variants of its own writes data-variant with the given string on its root",
    promise: { kind: "attribute", attribute: "data-variant" },
    check: dom(boxWith({ variant: "__test-variant" }), ({ root }) => {
      expect(root.getAttribute("data-variant")).toBe("__test-variant");
    }),
    ported: "shared suite, supports variant",
    status: "pending",
    until: "foundations 2",
  },
  {
    says: "size given as a key writes data-size with the key on the root",
    promise: { kind: "attribute", attribute: "data-size" },
    check: dom(boxWith({ size: "__test-size" }), ({ root }) => {
      expect(root.getAttribute("data-size")).toBe("__test-size");
    }),
    ported: "shared suite, supports size",
    status: "pending",
    until: "foundations 2",
  },
  {
    says: "size given as a length writes no data-size, and as a key after it writes the key",
    promise: { kind: "attribute", attribute: "data-size" },
    check: dom(buttonWith({ size: "5rem" }), ({ root, update }) => {
      expect(root.hasAttribute("data-size")).toBe(false);
      update({ size: "lg" });
      expect(root.getAttribute("data-size")).toBe("lg");
    }),
    ported: "shared suite, supports size (rerendered)",
    status: "pending",
    until: "foundations 2",
  },
  {
    says: "vars given as a function puts each custom property it returns on the part it names, over the component's own",
    promise: { kind: "prop", prop: "vars" },
    check: style(
      buttonWith({ size: "xl", vars: () => ({ root: { "--button-height": "3.25rem" } }) }),
      "--button-height",
      "3.25rem",
    ),
    status: "pending",
    until: "foundations 3",
  },
  {
    says: "attributes given per part puts each attribute on the part it names",
    promise: { kind: "prop", prop: "attributes" },
    check: dom(boxWith({ attributes: { root: { "data-test-id": "root" } } }), ({ root }) => {
      expect(root.getAttribute("data-test-id")).toBe("root");
    }),
    ported: "shared suite, supports styles api: attributes",
    status: "pending",
    until: "foundations 4",
  },
  {
    says: "classes given as a record puts each class on the part it names",
    promise: { kind: "prop", prop: "classes" },
    check: dom(boxWith({ classes: { root: "test-root" } }), ({ root }) => {
      expect(root.classList.contains("test-root")).toBe(true);
    }),
    ported: "shared suite, supports styles api: classNames (inline object)",
    status: "holds",
  },
  {
    says: "classes given as a function of the theme and the props puts each class it returns on the part it names",
    promise: { kind: "prop", prop: "classes" },
    check: dom(
      boxWith({
        "data-test": "__test",
        classes: (_theme: unknown, props: Record<string, unknown>) => ({
          root: `test-${String(props["data-test"])}-root`,
        }),
      }),
      ({ root }) => {
        expect(root.classList.contains("test-__test-root")).toBe(true);
      },
    ),
    ported: "shared suite, supports styles api: classNames (inline function)",
    status: "pending",
    until: "foundations 5",
  },
  {
    says: "styles given as a record puts each declaration on the part it names",
    promise: { kind: "prop", prop: "styles" },
    check: style(
      boxWith({ styles: { root: { "outline-color": salmon } } }),
      "outline-color",
      salmon,
    ),
    ported: "shared suite, supports styles api: styles (inline object)",
    status: "holds",
  },
  {
    says: "styles given as a function of the theme and the props puts each declaration it returns on the part it names",
    promise: { kind: "prop", prop: "styles" },
    check: style(
      boxWith({
        "data-test": salmon,
        styles: (_theme: unknown, props: Record<string, unknown>) => ({
          root: { "outline-color": String(props["data-test"]) },
        }),
      }),
      "outline-color",
      salmon,
    ),
    ported: "shared suite, supports styles api: styles (inline function)",
    status: "pending",
    until: "foundations 5",
  },
  {
    says: "style given as an object reaches the root",
    promise: { kind: "prop", prop: "style" },
    check: style(boxWith({ style: { color: salmon } }), "color", salmon),
    ported: "shared suite, supports style: object",
    status: "holds",
  },
  {
    says: "style given as a list of objects merges them in order on the root",
    promise: { kind: "prop", prop: "style" },
    check: dom(boxWith({ style: [{ color: salmon }, { background: olive }] }), ({ root }) => {
      expect(getComputedStyle(root).color).toBe(salmon);
      expect(getComputedStyle(root).backgroundColor).toBe(olive);
    }),
    ported: "shared suite, supports style: array of objects",
    status: "pending",
    until: "foundations 6",
  },
  {
    says: "style given as a function receives the theme and its object reaches the root",
    promise: { kind: "prop", prop: "style" },
    check: style(
      boxWith({ style: (theme: unknown) => ({ color: theme === undefined ? "inherit" : salmon }) }),
      "color",
      salmon,
    ),
    ported: "shared suite, supports style: theme function",
    status: "pending",
    until: "foundations 6",
  },
  {
    says: "style given as a list of theme functions merges what each returns in order",
    promise: { kind: "prop", prop: "style" },
    check: dom(
      boxWith({ style: [() => ({ color: salmon }), () => ({ background: olive })] }),
      ({ root }) => {
        expect(getComputedStyle(root).color).toBe(salmon);
        expect(getComputedStyle(root).backgroundColor).toBe(olive);
      },
    ),
    ported: "shared suite, supports style: array of theme functions",
    status: "pending",
    until: "foundations 6",
  },
  {
    says: "renderRoot receives the root's props and what it returns is the root",
    promise: { kind: "prop", prop: "renderRoot" },
    check: dom(boxWith({ renderRoot: linkElement }), ({ root }) => {
      expect(root.localName).toBe("a");
      expect(root.getAttribute("href")).toBe("#test-link");
      expect(root.classList.contains("solix-Box-root")).toBe(true);
    }),
    ported: "shared suite, is polymorphic: renderRoot",
    status: "pending",
    until: "foundations 7",
  },
  {
    says: "component given an element name renders the root as that element with the other props",
    promise: { kind: "prop", prop: "component", value: "a" },
    check: dom(boxWith({ component: "a", href: "#test-link" }), ({ root }) => {
      expect(root.localName).toBe("a");
      expect(root.getAttribute("href")).toBe("#test-link");
    }),
    ported: "shared suite, is polymorphic: html element",
    status: "holds",
  },
  {
    says: "every component carries the static map of its stable part classes",
    promise: { kind: "behaviour" },
    check: dom(box, ({ exports }) => {
      expect(Reflect.get(Object(exports.Box), "classes")).toEqual({ root: "solix-Box-root" });
    }),
    ported: "shared suite, has static classes",
    status: "pending",
    until: "step 1",
  },
  {
    says: "a theme's components defaults fill each prop the caller leaves unset, and a prop the caller gives wins",
    promise: { kind: "prop", prop: "theme.components.defaultProps" },
    check: dom(
      buttonWith(
        {},
        { provider: { theme: { components: { Button: { defaultProps: { variant: "light" } } } } } },
      ),
      ({ root, update }) => {
        expect(root.getAttribute("data-variant")).toBe("light");
        update({ variant: "outline" });
        expect(root.getAttribute("data-variant")).toBe("outline");
      },
    ),
    ported: "shared suite, supports provider default props",
    status: "pending",
    until: "foundations 8",
  },
  {
    says: "a theme's components classes reach the part they name, before the caller's",
    promise: { kind: "prop", prop: "theme.components.classNames" },
    check: dom(
      buttonWith(
        { classes: { root: "from-the-caller" } },
        {
          provider: {
            theme: { components: { Button: { classNames: { root: "from-the-theme" } } } },
          },
        },
      ),
      ({ root }) => {
        expect(root.classList.contains("from-the-theme")).toBe(true);
        expect(root.classList.contains("from-the-caller")).toBe(true);
      },
    ),
    ported: "shared suite, supports styles api: classNames (provider object)",
    status: "pending",
    until: "foundations 8",
  },
  {
    says: "Component.extend returns what the theme's components take, and Component.withProps a component with those props",
    promise: { kind: "behaviour" },
    check: dom(button, ({ exports }) => {
      expect(typeof Reflect.get(Object(exports.Button), "extend")).toBe("function");
      expect(typeof Reflect.get(Object(exports.Button), "withProps")).toBe("function");
    }),
    ported: "shared suite, has extend and has withProps",
    status: "pending",
    until: "foundations 9",
  },
  {
    says: "orange is a palette of its own: a filled orange button is not painted as a yellow one",
    promise: { kind: "prop", prop: "color", value: "orange" },
    check: dom(buttonWith({ color: "orange" }), ({ root, update }) => {
      const orange = getComputedStyle(root).backgroundColor;
      update({ color: "yellow" });
      expect(getComputedStyle(root).backgroundColor).not.toBe(orange);
    }),
    status: "pending",
    until: "foundations 10",
  },
  {
    says: "a palette given as color paints the filled variant in its solid shade",
    promise: { kind: "prop", prop: "color", value: "red" },
    check: style(buttonWith({ color: "red" }), "background-color", "var(--solix-color-red-6)"),
    status: "holds",
  },
  {
    says: "a palette's shade given as color paints the filled variant in that shade",
    promise: { kind: "prop", prop: "color", value: "red.8" },
    check: style(buttonWith({ color: "red.8" }), "background-color", "var(--solix-color-red-8)"),
    status: "holds",
  },
  {
    says: "a CSS colour given as color paints the filled variant in it",
    promise: { kind: "prop", prop: "color", value: "oklch(0.45 0.15 260)" },
    check: style(
      buttonWith({ color: "oklch(0.45 0.15 260)" }),
      "background-color",
      "oklch(0.45 0.15 260)",
    ),
    status: "holds",
  },
  {
    says: "autoContrast is on unless false is given: a filled yellow button's text is the one autoContrast picks",
    promise: { kind: "default", prop: "autoContrast", value: true },
    check: dom(buttonWith({ color: "yellow" }), ({ root, update }) => {
      const unset = getComputedStyle(root).color;
      update({ autoContrast: true });
      expect(getComputedStyle(root).color).toBe(unset);
    }),
    status: "pending",
    until: "foundations 11",
  },
  {
    says: "autoContrast={false} keeps the variant's own text colour",
    promise: { kind: "prop", prop: "autoContrast", value: false },
    check: style(
      buttonWith({ color: "yellow", autoContrast: false }),
      "color",
      "var(--solix-color-yellow-contrast)",
    ),
    status: "holds",
  },
  {
    says: "gradient gives the gradient variant a linear gradient between its two colours",
    promise: { kind: "prop", prop: "gradient" },
    check: style(
      buttonWith({ variant: "gradient", gradient: { from: "red", to: "blue", deg: 90 } }),
      "background-image",
      "linear-gradient(90deg, var(--solix-color-red-6), var(--solix-color-blue-6))",
    ),
    status: "pending",
    until: "foundations 12",
  },
  {
    says: "a theme's primaryShade picks the shade the filled variant paints in each scheme",
    promise: { kind: "prop", prop: "theme.primaryShade" },
    check: style(
      buttonWith({}, { provider: { theme: { primaryShade: { light: 8, dark: 8 } } } }),
      "background-color",
      "var(--solix-color-blue-8)",
    ),
    status: "pending",
    until: "foundations 13",
  },
  {
    says: "a theme's defaultRadius is the radius of a component given none",
    promise: { kind: "prop", prop: "theme.defaultRadius" },
    check: style(
      buttonWith({}, { provider: { theme: { defaultRadius: "xs" } } }),
      "border-top-left-radius",
      "0.125rem",
    ),
    status: "pending",
    until: "foundations 14",
  },
  {
    says: "a radius key resolves to its step of the radius scale",
    promise: { kind: "prop", prop: "radius", value: "xs" },
    check: style(buttonWith({ radius: "xs" }), "--button-radius", "0.125rem"),
    status: "holds",
  },
  {
    says: "a radius given as a number is that many pixels in rem",
    promise: { kind: "prop", prop: "radius", value: 8 },
    check: style(buttonWith({ radius: 8 }), "--button-radius", "0.5rem"),
    status: "holds",
  },
  {
    says: "a radius given as another string passes through",
    promise: { kind: "prop", prop: "radius", value: "7px" },
    check: style(buttonWith({ radius: "7px" }), "--button-radius", "7px"),
    status: "holds",
  },
  {
    says: "the library exports Transition, whose named transitions mount and unmount content",
    promise: { kind: "behaviour" },
    check: dom(box, ({ exports }) => {
      expect(typeof exports.Transition).toBe("function");
    }),
    status: "pending",
    until: "step 4",
  },
  {
    says: "lightHidden hides the root in the light scheme",
    promise: { kind: "prop", prop: "lightHidden", value: true },
    check: style(boxWith({ lightHidden: true }), "display", "none", { scheme: "light" }),
    ported: "shared suite, supports lightHidden and darkHidden",
    status: "holds",
  },
  {
    says: "darkHidden hides the root in the dark scheme",
    promise: { kind: "prop", prop: "darkHidden", value: true },
    check: style(boxWith({ darkHidden: true }), "display", "none", { scheme: "dark" }),
    ported: "shared suite, supports lightHidden and darkHidden",
    status: "holds",
  },
  {
    says: "hiddenFrom hides the root from its breakpoint up",
    promise: { kind: "prop", prop: "hiddenFrom", value: "xs" },
    check: style(boxWith({ hiddenFrom: "xs" }), "display", "none", { width: 1024 }),
    ported: "shared suite, supports hiddenFrom and visibleFrom",
    status: "holds",
  },
]);
