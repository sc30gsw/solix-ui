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
const rightToLeft = "Right to left";
export const controlled = "Controlled";
export const held = "Held";
export const generated = "Generated";
export const inAShadowRoot = "In a shadow root";

export const tabNames = {
  account: { overview: "Overview", billing: "Billing", members: "Members", security: "Security" },
  manual: { one: "One", two: "Two", three: "Three" },
  vertical: { alpha: "Alpha", beta: "Beta", gamma: "Gamma", delta: "Delta" },
  optional: { archive: "Archive", notes: "Notes", files: "Files", trash: "Trash" },
  rightToLeft: { north: "North", east: "East", south: "South", west: "West" },
  controlled: { inbox: "Inbox", drafts: "Drafts", locked: "Locked" },
  held: { kept: "Kept", asked: "Asked", styled: "Styled", classed: "Classed" },
  inAShadowRoot: { near: "Near", middle: "Middle", far: "Far" },
} as const;

const { overview, billing, members, security } = tabNames.account;
const { one, two, three } = tabNames.manual;
const { alpha, beta, gamma, delta } = tabNames.vertical;
const { archive, notes, files, trash } = tabNames.optional;
const { north, east, south, west } = tabNames.rightToLeft;

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
    initial: overview,
    tabs: [
      { name: overview, disabled: false, leftSection: "1", panel: {} },
      { name: billing, disabled: true, panel: {} },
      { name: members, disabled: false, panel: { display: "flex" } },
      { name: security, disabled: false, rightSection: "4", panel: {} },
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
    initial: two,
    tabs: enabled(one, two, three),
  },
  {
    list: vertical,
    direction: "ltr",
    orientation: "vertical",
    loop: true,
    selectsOnArrow: true,
    deselects: false,
    keepsHiddenPanels: true,
    initial: beta,
    tabs: [...enabled(alpha, beta, gamma), { name: delta, disabled: true, panel: {} }],
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
      { name: archive, disabled: true },
      { name: notes, disabled: false, panel: {} },
      { name: files, disabled: false, panel: { keepMounted: true } },
      { name: trash, disabled: true },
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
    initial: north,
    tabs: [...enabled(north), { name: east, disabled: true, panel: {} }, ...enabled(south, west)],
  },
];

export type ControlledSetup = {
  list: string;
  value: string;
  refused: string | null;
  follows: boolean;
};

const { drafts, locked } = tabNames.controlled;
const { kept } = tabNames.held;

const controlledSetups: ControlledSetup[] = [
  { list: controlled, value: drafts, refused: locked, follows: true },
  { list: held, value: kept, refused: null, follows: false },
];

export type KeyboardRow = {
  list: string;
  start: string;
  keys: string[];
  focused: string;
  selected: string;
};

export const keyboardTable: KeyboardRow[] = [
  {
    list: account,
    start: overview,
    keys: ["ArrowRight"],
    focused: members,
    selected: members,
  },
  {
    list: account,
    start: members,
    keys: ["ArrowLeft"],
    focused: overview,
    selected: overview,
  },
  {
    list: account,
    start: overview,
    keys: ["ArrowLeft"],
    focused: security,
    selected: security,
  },
  {
    list: account,
    start: security,
    keys: ["ArrowRight"],
    focused: overview,
    selected: overview,
  },
  { list: account, start: members, keys: ["Home"], focused: overview, selected: overview },
  { list: account, start: overview, keys: ["End"], focused: security, selected: security },
  { list: account, start: members, keys: ["ArrowDown"], focused: members, selected: members },
  { list: account, start: members, keys: ["ArrowUp"], focused: members, selected: members },
  {
    list: account,
    start: overview,
    keys: ["ArrowRight", "ArrowRight"],
    focused: security,
    selected: security,
  },
  { list: rightToLeft, start: north, keys: ["ArrowLeft"], focused: south, selected: south },
  { list: rightToLeft, start: south, keys: ["ArrowRight"], focused: north, selected: north },
  { list: rightToLeft, start: north, keys: ["ArrowRight"], focused: west, selected: west },
  { list: rightToLeft, start: west, keys: ["ArrowLeft"], focused: north, selected: north },
  { list: rightToLeft, start: south, keys: ["Home"], focused: north, selected: north },
  { list: rightToLeft, start: south, keys: ["End"], focused: west, selected: west },
  { list: manual, start: two, keys: ["ArrowDown"], focused: three, selected: two },
  { list: manual, start: two, keys: ["ArrowDown", "Enter"], focused: three, selected: three },
  { list: manual, start: two, keys: ["ArrowUp", "Space"], focused: one, selected: one },
  { list: manual, start: three, keys: ["ArrowDown"], focused: three, selected: three },
  { list: manual, start: one, keys: ["ArrowUp"], focused: one, selected: one },
  { list: manual, start: two, keys: ["ArrowRight"], focused: two, selected: two },
  { list: manual, start: two, keys: ["Home"], focused: one, selected: two },
  { list: manual, start: two, keys: ["End"], focused: three, selected: two },
  { list: vertical, start: beta, keys: ["ArrowUp"], focused: alpha, selected: alpha },
  { list: vertical, start: alpha, keys: ["ArrowUp"], focused: gamma, selected: gamma },
  { list: vertical, start: gamma, keys: ["ArrowDown"], focused: alpha, selected: alpha },
  { list: vertical, start: alpha, keys: ["ArrowDown"], focused: beta, selected: beta },
  { list: vertical, start: beta, keys: ["ArrowLeft"], focused: beta, selected: beta },
  { list: vertical, start: alpha, keys: ["End"], focused: gamma, selected: gamma },
  { list: optional, start: files, keys: ["Home"], focused: notes, selected: notes },
  { list: optional, start: notes, keys: ["End"], focused: files, selected: files },
  { list: optional, start: files, keys: ["ArrowRight"], focused: notes, selected: notes },
  { list: optional, start: notes, keys: ["ArrowLeft"], focused: files, selected: files },
];

export function valueOf(name: string): string {
  return name.toLowerCase();
}

export function panelOf(name: string): string {
  return `${name} panel`;
}

export type NamedTabs = { list: string; tabs: readonly { name: string }[] };

function named(names: Readonly<Record<string, string>>): { name: string }[] {
  return Object.values(names).map((name) => ({ name }));
}

export const handWrittenTabs: NamedTabs[] = [
  { list: controlled, tabs: named(tabNames.controlled) },
  { list: held, tabs: named(tabNames.held) },
  { list: inAShadowRoot, tabs: named(tabNames.inAShadowRoot) },
];

function listNamed<Setup extends NamedTabs>(lists: readonly Setup[], list: string): Setup {
  const found = lists.find((setup) => setup.list === list);
  if (!found) throw new Error(`${list}: the playground names no list of tabs so.`);
  return found;
}

export function setupOf(list: string): TabsSetup {
  return listNamed(tabsSetups, list);
}

export function tabNamesOf(list: string): string[] {
  return listNamed([...tabsSetups, ...handWrittenTabs], list).tabs.map(({ name }) => name);
}

export function controlledSetupOf(list: string): ControlledSetup {
  const found = controlledSetups.find((setup) => setup.list === list);
  if (!found) throw new Error(`${list}: the playground names no controlled list of tabs so.`);
  return found;
}
