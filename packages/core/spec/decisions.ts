import { expect } from "vite-plus/test";
import { defineSpec, dom, type Fixture, style } from "#/spec/format.ts";

function tabs(panelProps: Fixture["props"], tabProps: Fixture["props"] = {}): Fixture {
  return {
    component: "Tabs",
    props: { defaultValue: "a" },
    children: [
      {
        component: "TabsList",
        props: { "aria-label": "Sections" },
        children: [
          { component: "TabsTab", props: { value: "a", ...tabProps }, children: "A" },
          { component: "TabsTab", props: { value: "b" }, children: "B" },
        ],
      },
      { component: "TabsPanel", props: { value: "a", ...panelProps }, children: "Panel A" },
      { component: "TabsPanel", props: { value: "b", ...panelProps }, children: "Panel B" },
    ],
  };
}

function modal(props: Fixture["props"]): Fixture {
  return {
    component: "Modal",
    props: { label: "Dialog", opened: true, ...props },
    children: "Body",
  };
}

const box: Fixture = { component: "Box", children: "Content" };

export const spec = defineSpec("decisions", [
  {
    says: 'Q171: keepMountedMode="display-none" keeps an inactive panel\'s content mounted and writes display: none on the panel',
    promise: { kind: "prop", prop: "keepMountedMode", value: "display-none" },
    check: dom(tabs({ keepMounted: true, keepMountedMode: "display-none" }), ({ parts }) => {
      const inactive = parts("root", "TabsPanel")[1];
      expect(inactive.textContent).toBe("Panel B");
      expect(inactive.style.display).toBe("none");
    }),
    status: "pending",
    until: "Tabs 9",
  },
  {
    says: 'Q171: keepMountedMode="activity" keeps an inactive panel\'s content mounted and hidden by the hidden attribute',
    promise: { kind: "prop", prop: "keepMountedMode", value: "activity" },
    check: dom(tabs({ keepMounted: true, keepMountedMode: "activity" }), ({ parts }) => {
      const inactive = parts("root", "TabsPanel")[1];
      expect(inactive.textContent).toBe("Panel B");
      expect(inactive.hidden).toBe(true);
      expect(inactive.style.display).toBe("");
    }),
    status: "holds",
  },
  {
    says: "Q172: closeOnEscape={false} keeps the Modal open on Escape",
    promise: { kind: "prop", prop: "closeOnEscape", value: false },
    check: dom(modal({ closeOnEscape: false }), async ({ root, update, user }) => {
      update({ onClose: () => update({ opened: false }) });
      await user.keyboard("{Escape}");
      expect(root.matches("[open]")).toBe(true);
    }),
    status: "pending",
    until: "Modal 2",
  },
  {
    says: "Q173: zIndex sets --mb-z-index on the Modal's root, 0 included",
    promise: { kind: "variable", variable: "--mb-z-index" },
    check: style(modal({ zIndex: 0 }), "--mb-z-index", "0"),
    ported: "Modal suite, applies zIndex={0} to both root and overlay",
    status: "pending",
    until: "Modal 8",
  },
  {
    says: 'Q175: a tab\'s left section is the tabSection part with data-position="left"',
    promise: { kind: "part", part: "tabSection" },
    check: dom(tabs({}, { leftSection: "L" }), ({ part }) => {
      const section = part("tabSection", "TabsTab");
      expect(section.getAttribute("data-position")).toBe("left");
      expect(section.textContent).toBe("L");
    }),
    status: "pending",
    until: "Tabs 11",
  },
  {
    says: "Q176: the provider writes the scheme on its root element as data-solix-color-scheme",
    promise: { kind: "attribute", attribute: "data-solix-color-scheme" },
    check: dom(
      { ...box, within: { provider: { defaultColorScheme: "dark" } } },
      ({ container }) => {
        expect(
          container.closest("[data-solix-color-scheme]")?.getAttribute("data-solix-color-scheme"),
        ).toBe("dark");
      },
    ),
    status: "pending",
    until: "SolixProvider 8",
  },
  {
    says: "Q176: the local-storage manager takes the reference's shape: get(default), set, subscribe, unsubscribe and clear",
    promise: { kind: "behaviour" },
    check: dom(box, ({ exports }) => {
      const create = exports.localStorageColorSchemeManager;
      if (typeof create !== "function") throw new Error("No localStorageColorSchemeManager.");
      const manager: unknown = create({ key: "solix-spec-manager" });
      const get = Reflect.get(Object(manager), "get");
      expect(typeof Reflect.get(Object(manager), "unsubscribe")).toBe("function");
      expect(Reflect.apply(get, manager, ["dark"])).toBe("dark");
    }),
    status: "pending",
    until: "SolixProvider 8",
  },
  {
    says: "Q177: TextInput shows its description and its error together",
    promise: { kind: "behaviour" },
    check: dom(
      {
        component: "TextInput",
        props: { description: "Helps", error: "Wrong", "aria-label": "Name" },
      },
      ({ container }) => {
        expect(container.textContent).toContain("Helps");
        expect(container.textContent).toContain("Wrong");
      },
    ),
    status: "pending",
    until: "TextInput 2",
  },
  {
    says: 'Q178: Modal takes no placement, so placement="auto" writes no data-placement',
    promise: { kind: "prop", prop: "placement", value: "auto" },
    check: dom(modal({ placement: "auto" }), ({ root }) => {
      expect(root.hasAttribute("data-placement")).toBe(false);
    }),
    status: "holds",
  },
]);
