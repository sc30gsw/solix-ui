export type TabSetup = {
  name: string;
  disabled: boolean;
  leftSection?: string;
  rightSection?: string;
  panel?: { display?: "flex"; keepMounted?: true };
};

export type TabsSetup = {
  list: string;
  id?: string;
  direction: "ltr" | "rtl";
  orientation: "horizontal" | "vertical";
  loop: boolean;
  selectsOnArrow: boolean;
  deselects: boolean;
  keepsHiddenPanels: boolean;
  initial: string | null;
  tabs: TabSetup[];
};

export const displayedByTheApp = { style: "display:grid", class: "shown-as-grid" };

export const account = "Account";
export const manual = "Manual vertical";
export const vertical = "Vertical";
export const optional = "Optional";
export const rightToLeft = "Right to left";
export const controlled = "Controlled";
export const held = "Held";
export const generated = "Generated";
export const inAShadowRoot = "In a shadow root";

function enabled(...names: string[]): TabSetup[] {
  return names.map((name) => ({ name, disabled: false, panel: {} }));
}

export const tabsSetups: TabsSetup[] = [
  {
    list: account,
    id: "account",
    direction: "ltr",
    orientation: "horizontal",
    loop: true,
    selectsOnArrow: true,
    deselects: false,
    keepsHiddenPanels: true,
    initial: "Overview",
    tabs: [
      { name: "Overview", disabled: false, leftSection: "1", panel: {} },
      { name: "Billing", disabled: true, panel: {} },
      { name: "Members", disabled: false, panel: { display: "flex" } },
      { name: "Settings", disabled: false, rightSection: "4", panel: {} },
    ],
  },
  {
    list: manual,
    direction: "ltr",
    orientation: "vertical",
    loop: false,
    selectsOnArrow: false,
    deselects: false,
    keepsHiddenPanels: true,
    initial: "Two",
    tabs: enabled("One", "Two", "Three"),
  },
  {
    list: vertical,
    direction: "ltr",
    orientation: "vertical",
    loop: true,
    selectsOnArrow: true,
    deselects: false,
    keepsHiddenPanels: true,
    initial: "Beta",
    tabs: [...enabled("Alpha", "Beta", "Gamma"), { name: "Delta", disabled: true, panel: {} }],
  },
  {
    list: optional,
    direction: "ltr",
    orientation: "horizontal",
    loop: true,
    selectsOnArrow: true,
    deselects: true,
    keepsHiddenPanels: false,
    initial: null,
    tabs: [
      { name: "Archive", disabled: true },
      { name: "Notes", disabled: false, panel: {} },
      { name: "Files", disabled: false, panel: { keepMounted: true } },
      { name: "Trash", disabled: true },
    ],
  },
  {
    list: rightToLeft,
    direction: "rtl",
    orientation: "horizontal",
    loop: true,
    selectsOnArrow: true,
    deselects: false,
    keepsHiddenPanels: true,
    initial: "North",
    tabs: [
      ...enabled("North"),
      { name: "East", disabled: true, panel: {} },
      ...enabled("South", "West"),
    ],
  },
];

export function valueOf(name: string): string {
  return name.toLowerCase();
}

export function panelOf(name: string): string {
  return `${name} panel`;
}

export type NamedTabs = { list: string; tabs: readonly { name: string }[] };

function named(...names: string[]): { name: string }[] {
  return names.map((name) => ({ name }));
}

export const handWrittenTabs: NamedTabs[] = [
  { list: controlled, tabs: named("Inbox", "Drafts", "Locked") },
  { list: held, tabs: named("Kept", "Asked", "Styled", "Classed") },
  { list: inAShadowRoot, tabs: named("Near", "Middle", "Far") },
];

export function tabNamesOf(list: string): string[] {
  const found = [...tabsSetups, ...handWrittenTabs].find((setup) => setup.list === list);
  if (!found) throw new Error(`${list}: the playground names no list of tabs so.`);
  return found.tabs.map(({ name }) => name);
}
