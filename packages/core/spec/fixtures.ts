import type {
  Children,
  ComponentPath,
  GapItem,
  LookEntry,
  LookFixture,
  LookProperty,
  Node,
  Props,
  PropsOf,
} from "#/spec/format.ts";

export function fixture<C extends ComponentPath>(
  component: C,
  props?: PropsOf<C>,
  children?: Children,
): Node<C> {
  return {
    component,
    ...(props === undefined ? {} : { props }),
    ...(children === undefined ? {} : { children }),
  };
}

export function unbuilt<C extends ComponentPath>(
  component: C,
  props: Props,
  children?: Children,
): Node<C> {
  return { component, unbuilt: props, ...(children === undefined ? {} : { children }) };
}

export type TabsFixture = {
  readonly root?: PropsOf<"Tabs">;
  readonly firstTab?: Partial<PropsOf<"TabsTab">>;
  readonly panels?: Props;
};

export function tabs({ root = {}, firstTab = {}, panels }: TabsFixture = {}): Node<"Tabs"> {
  const panel = (value: string, text: string) =>
    panels === undefined
      ? fixture("TabsPanel", { value }, text)
      : unbuilt("TabsPanel", { value, ...panels }, text);
  return fixture("Tabs", { defaultValue: "a", ...root }, [
    fixture("TabsList", { "aria-label": "Sections" }, [
      fixture("TabsTab", { value: "a", ...firstTab }, "A"),
      fixture("TabsTab", { value: "b" }, "B"),
    ]),
    panel("a", "Panel A"),
    panel("b", "Panel B"),
  ]);
}

export function modal(unbuiltProps?: Props): Node<"Modal"> {
  const dialog = { label: "Dialog", opened: true };
  return unbuiltProps === undefined
    ? fixture("Modal", dialog, "Body")
    : unbuilt("Modal", { ...dialog, ...unbuiltProps }, "Body");
}

export function looks(
  fixture: LookFixture,
  property: LookProperty,
  value: string,
  until?: GapItem,
  placement: Pick<LookEntry, "at" | "state" | "scheme" | "media"> = {},
): LookEntry {
  return {
    fixture,
    ...placement,
    property,
    value,
    status: until === undefined ? "holds" : { until, fails: "differs" },
  };
}
