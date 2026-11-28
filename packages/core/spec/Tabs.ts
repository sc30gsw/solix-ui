import { expect } from "vite-plus/test";
import { tabs } from "#/spec/fixtures.ts";
import type { FunctionSpec, Reference } from "#/spec/format.ts";

const reference = {
  props: ["orientation", "defaultValue", "keepMounted", "keepMountedMode"],
  parts: ["tabSection"],
  variables: [],
} as const satisfies Reference;

const tab = { of: "TabsTab", part: "root" } as const;
const panels = { of: "TabsPanel", part: "root" } as const;
const list = { of: "TabsList", part: "root" } as const;

export const spec: FunctionSpec<typeof reference> = {
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
      says: "with defaultValue=null and the first tab disabled, the first enabled tab is the list's one tab stop",
      about: "prop defaultValue",
      fixture: tabs({ root: { defaultValue: null }, firstTab: { disabled: true } }),
      assert: ({ all }) => {
        expect(
          all(tab).map((tab) => tab.tabIndex),
          "tab stops",
        ).toEqual([-1, 0]);
      },
      status: "holds",
      decision: "Q168",
    },
    {
      says: "Tab from the selected tab moves focus to its panel, which takes focus",
      about: "behaviour",
      fixture: tabs(),
      assert: async ({ at, user }) => {
        at(tab).focus();
        await user.tab();
        expect(document.activeElement, "focus after Tab").toBe(at(panels));
      },
      status: "holds",
      decision: "Q168",
    },
    {
      says: "once mounted, each tab names its panel by aria-controls",
      about: "behaviour",
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
      },
      status: "holds",
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
