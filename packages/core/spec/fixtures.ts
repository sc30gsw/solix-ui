import type { ComponentPath, Fixture, Props, Within } from "#/spec/format.ts";

export function fixture(
  component: ComponentPath,
  props?: Props,
  children?: Fixture["children"],
  within?: Within,
): Fixture {
  return {
    component,
    ...(props === undefined ? {} : { props }),
    ...(children === undefined ? {} : { children }),
    ...(within === undefined ? {} : { within }),
  };
}

export type TabsFixture = {
  readonly root?: Props;
  readonly firstTab?: Props;
  readonly panels?: Props;
};

export function tabs({ root = {}, firstTab = {}, panels = {} }: TabsFixture = {}): Fixture {
  return fixture("Tabs", { defaultValue: "a", ...root }, [
    fixture("TabsList", { "aria-label": "Sections" }, [
      fixture("TabsTab", { value: "a", ...firstTab }, "A"),
      fixture("TabsTab", { value: "b" }, "B"),
    ]),
    fixture("TabsPanel", { value: "a", ...panels }, "Panel A"),
    fixture("TabsPanel", { value: "b", ...panels }, "Panel B"),
  ]);
}

export function modal(props: Props = {}): Fixture {
  return fixture("Modal", { label: "Dialog", opened: true, ...props }, "Body");
}
