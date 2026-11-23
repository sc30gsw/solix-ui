import { expect } from "vite-plus/test";
import { tabs } from "#/spec/fixtures.ts";
import { defineReference, defineSpec, dom } from "#/spec/format.ts";

const reference = defineReference({
  props: ["orientation", "defaultValue", "keepMounted", "keepMountedMode"],
  parts: ["tabSection"],
  variables: [],
});

const tab = { of: "TabsTab", part: "root" } as const;
const panels = { of: "TabsPanel", part: "root" } as const;
const list = { of: "TabsList", part: "root" } as const;

export const spec = defineSpec(reference, [
  {
    says: "a horizontal tab list carries no aria-orientation, horizontal being the default",
    promise: { kind: "default", prop: "orientation", value: "horizontal" },
    check: dom(tabs(), ({ at }) => {
      expect(at(list).hasAttribute("aria-orientation"), "aria-orientation").toBe(false);
    }),
    status: "holds",
    decision: "Q168",
  },
  {
    says: 'orientation="vertical" puts aria-orientation="vertical" on the tab list',
    promise: { kind: "prop", prop: "orientation", value: "vertical" },
    check: dom(tabs({ root: { orientation: "vertical" } }), ({ at }) => {
      expect(at(list).getAttribute("aria-orientation"), "aria-orientation").toBe("vertical");
    }),
    status: "holds",
    decision: "Q168",
  },
  {
    says: "with defaultValue=null and the first tab disabled, the first enabled tab is the list's one tab stop",
    promise: { kind: "prop", prop: "defaultValue", value: null },
    check: dom(tabs({ root: { defaultValue: null }, firstTab: { disabled: true } }), ({ all }) => {
      expect(
        all(tab).map((tab) => tab.tabIndex),
        "tab stops",
      ).toEqual([-1, 0]);
    }),
    status: "holds",
    decision: "Q168",
  },
  {
    says: "Tab from the selected tab moves focus to its panel, which takes focus",
    promise: { kind: "behaviour" },
    check: dom(tabs(), async ({ at, user }) => {
      at(tab).focus();
      await user.tab();
      expect(document.activeElement, "focus after Tab").toBe(at(panels));
    }),
    status: "holds",
    decision: "Q168",
  },
  {
    says: "once mounted, each tab names its panel by aria-controls",
    promise: { kind: "attribute", attribute: "aria-controls" },
    check: dom(tabs(), ({ all }) => {
      expect(
        all(tab).map((tab) => tab.getAttribute("aria-controls")),
        "aria-controls",
      ).toEqual(all(panels).map((panel) => panel.id));
    }),
    status: "holds",
    decision: "Q168",
  },
  {
    says: 'keepMounted with keepMountedMode="display-none" keeps an inactive panel\'s content and writes display: none on it',
    promise: { kind: "prop", prop: "keepMountedMode", value: "display-none" },
    check: dom(
      tabs({ panels: { keepMounted: true, keepMountedMode: "display-none" } }),
      ({ all }) => {
        const inactive = all(panels)[1];
        expect(inactive.textContent, "the inactive panel").toBe("Panel B");
        expect(inactive.style.display, "the inactive panel's display").toBe("none");
      },
    ),
    status: "pending",
    until: "Tabs 9",
    failsWith: "the inactive panel's display: expected '' to be 'none'",
    decision: "Q171",
  },
  {
    says: 'keepMounted with keepMountedMode="activity" keeps an inactive panel\'s content, hidden by the hidden attribute',
    promise: { kind: "prop", prop: "keepMounted", value: true },
    check: dom(tabs({ panels: { keepMounted: true, keepMountedMode: "activity" } }), ({ all }) => {
      const inactive = all(panels)[1];
      expect(inactive.textContent, "the inactive panel").toBe("Panel B");
      expect(inactive.hidden, "the inactive panel is hidden").toBe(true);
      expect(inactive.style.display, "the inactive panel's display").toBe("");
    }),
    status: "holds",
    decision: "Q171",
  },
  {
    says: 'a tab\'s leftSection is the tabSection part with data-position="left"',
    promise: { kind: "part", part: "tabSection" },
    check: dom(tabs({ firstTab: { leftSection: "L" } }), ({ at }) => {
      const section = at({ of: "TabsTab", part: "tabSection" });
      expect(section.getAttribute("data-position"), "data-position").toBe("left");
      expect(section.textContent, "the section").toBe("L");
    }),
    status: "pending",
    until: "Tabs 11",
    failsWith: "TabsTab: it renders no tabSection part",
    decision: "Q175",
  },
]);
