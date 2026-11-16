import { expect } from "vite-plus/test";
import type * as Library from "../src/index";
import type { DisplayPropName } from "../src/style-prop-table";
import { type ConsumerProps, handledKeys, renderBuilt, renderBuiltWithin } from "./built-library";
import { elementsOf } from "./markup";

type PropsOf<Component> = Component extends (props: infer Props) => unknown ? Props : never;

type TakesEachDisplayProp<Props> = {
  [Key in DisplayPropName]: Key extends keyof Props
    ? [NonNullable<Props[Key]>] extends [never]
      ? false
      : true
    : true;
}[DisplayPropName];

export type TakesDisplay<Props> =
  boolean extends TakesEachDisplayProp<Props> ? never : TakesEachDisplayProp<Props>;

type Polymorphic<Component> = "component" extends keyof PropsOf<Component> ? true : false;

type ComponentName = keyof typeof Library;

type Fixture<Component> = {
  within?: ComponentName;
  tag: string;
  booleanAttribute: string;
  takesDisplay: TakesDisplay<PropsOf<Component>>;
  polymorphic: Polymorphic<Component>;
  props: PropsOf<Component>;
};

const childrenProp = "children";

export const fixtures: { [Name in ComponentName]: Fixture<(typeof Library)[Name]> } = {
  Box: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: true,
    props: { children: "Content" },
  },
  Button: {
    tag: "button",
    booleanAttribute: "disabled",
    takesDisplay: true,
    polymorphic: true,
    props: { children: "Label" },
  },
  Disclosure: {
    tag: "details",
    booleanAttribute: "open",
    takesDisplay: true,
    polymorphic: false,
    props: { label: "Label", children: "Content" },
  },
  Modal: {
    tag: "dialog",
    booleanAttribute: "hidden",
    takesDisplay: false,
    polymorphic: false,
    props: { label: "Label", opened: false, children: "Content" },
  },
  Tabs: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    props: { children: "Content" },
  },
  TabsList: {
    within: "Tabs",
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    props: { children: "Content" },
  },
  TabsPanel: {
    within: "Tabs",
    tag: "div",
    booleanAttribute: "inert",
    takesDisplay: true,
    polymorphic: false,
    props: { value: "first", children: "Content" },
  },
  TabsTab: {
    within: "Tabs",
    tag: "button",
    booleanAttribute: "disabled",
    takesDisplay: true,
    polymorphic: false,
    props: { value: "first", leftSection: "Left", rightSection: "Right", children: "Label" },
  },
  TextInput: {
    tag: "input",
    booleanAttribute: "disabled",
    takesDisplay: true,
    polymorphic: false,
    props: {},
  },
};

export const components = Object.entries(fixtures);

export const polymorphicComponents = components
  .filter(([, { polymorphic }]) => polymorphic)
  .map(([name]) => name);

const handledOffEveryElement = handledKeys.filter((key) => key !== "class" && key !== "style");

function isComponentName(name: string): name is ComponentName {
  return Object.hasOwn(fixtures, name);
}

function attributesNamed(html: string, props: readonly string[]): string[] {
  return elementsOf(html).flatMap(({ tag, attributes }) =>
    attributes
      .filter(([name]) => props.some((prop) => prop.toLowerCase() === name.toLowerCase()))
      .map(([name]) => `<${tag}> ${name}`),
  );
}

export function render(name: string, props: ConsumerProps = {}): string {
  if (!isComponentName(name)) {
    throw new Error(`packages/core/tests/fixtures.ts: add a fixture for ${name}.`);
  }
  const { within, props: fixtureProps }: { within?: ComponentName; props: ConsumerProps } =
    fixtures[name];
  const given = { ...fixtureProps, ...props };
  const html =
    within === undefined
      ? renderBuilt(name, given)
      : renderBuiltWithin(within, fixtures[within].props, name, given);
  expect(
    attributesNamed(
      html,
      Object.keys(fixtureProps).filter((prop) => prop !== childrenProp),
    ),
    `${name} keeps every prop its fixture gives, but children, off its elements`,
  ).toEqual([]);
  expect(
    attributesNamed(html, handledOffEveryElement),
    "no prop that createParts handles, but class and style, reaches an element as an attribute",
  ).toEqual([]);
  return html;
}
