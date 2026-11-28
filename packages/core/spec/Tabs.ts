import { expect } from "vite-plus/test";
import { tabs } from "#/spec/fixtures.ts";
import type { FunctionSpec, Reference } from "#/spec/format.ts";

const reference = {
  props: ["orientation", "keepMounted", "keepMountedMode"],
  parts: ["tabSection"],
  variables: [],
  exports: ["TabsTab", "TabsPanel"],
} as const satisfies Reference;

const tab = { of: "TabsTab", part: "root" } as const;
const panels = { of: "TabsPanel", part: "root" } as const;
const list = { of: "TabsList", part: "root" } as const;

export const tabsSpec: FunctionSpec<typeof reference> = {
  reference,
  entries: [
    {
      says: "a horizontal tab list carries no aria-orientation, horizontal being the default",
      about: "prop orientation",
      fixture: tabs(),
      assert: ({ at }) => {
        expect(at(list).hasAttribute("aria-orientation"), "aria-orientation").toBe(false);
      },
      status: "holds",
      decision: "Q168",
    },
    {
      says: 'orientation="vertical" puts aria-orientation="vertical" on the tab list',
      about: "prop orientation",
      fixture: tabs({ root: { orientation: "vertical" } }),
      assert: ({ at }) => {
        expect(at(list).getAttribute("aria-orientation"), "aria-orientation").toBe("vertical");
      },
      status: "holds",
      decision: "Q168",
    },
    {
      says: "the selected tab's panel takes focus: it is in the tab order, with tabindex 0",
      about: "export TabsPanel",
      fixture: tabs(),
      assert: ({ at }) => {
        expect(at(panels).tabIndex, "the selected panel's tabindex").toBe(0);
      },
      status: "holds",
      decision: "Q168",
    },
    {
      says: "once mounted, each tab names its panel by aria-controls",
      about: "export TabsTab",
      fixture: tabs(),
      assert: ({ all }) => {
        expect(
          all(tab).map((tab) => tab.getAttribute("aria-controls")),
          "aria-controls",
        ).toEqual(all(panels).map((panel) => panel.id));
      },
      status: "holds",
      decision: "Q168",
    },
    {
      says: 'keepMounted with keepMountedMode="display-none" keeps an inactive panel\'s content and writes display: none on it',
      about: "prop keepMountedMode",
      fixture: tabs({ panels: { keepMounted: true, keepMountedMode: "display-none" } }),
      assert: ({ all }) => {
        const inactive = all(panels)[1];
        expect(inactive.textContent, "the inactive panel").toBe("Panel B");
        expect(inactive.style.display, "the inactive panel's display").toBe("none");
      },
      status: { until: "Tabs 9", fails: "the inactive panel's display: expected '' to be 'none'" },
      decision: "Q171",
    },
    {
      says: 'keepMounted with keepMountedMode="activity" keeps an inactive panel\'s content, hidden by the hidden attribute',
      about: "prop keepMounted",
      fixture: tabs({ panels: { keepMounted: true, keepMountedMode: "activity" } }),
      assert: ({ all }) => {
        const inactive = all(panels)[1];
        expect(inactive.textContent, "the inactive panel").toBe("Panel B");
        expect(inactive.hidden, "the inactive panel is hidden").toBe(true);
        expect(inactive.style.display, "the inactive panel's display").toBe("");
        expect(inactive.hasAttribute("keepMountedMode"), "keepMountedMode on the panel").toBe(
          false,
        );
      },
      status: { until: "Tabs 9", fails: "keepMountedMode on the panel: expected true to be false" },
      decision: "Q171",
    },
    {
      says: 'a tab\'s leftSection is the tabSection part with data-position="left"',
      about: "part tabSection",
      fixture: tabs({ firstTab: { leftSection: "L" } }),
      assert: ({ at }) => {
        const section = at({ of: "TabsTab", part: "tabSection" });
        expect(section.getAttribute("data-position"), "data-position").toBe("left");
        expect(section.textContent, "the section").toBe("L");
      },
      status: { until: "Tabs 11", fails: { of: "TabsTab", part: "tabSection" } },
      decision: "Q175",
    },
  ],
};
