import type { JSX } from "@solidjs/web";
import { expect } from "vite-plus/test";
import type * as Library from "../src/index";
import type { DisplayPropName } from "../src/style-prop-table";
import {
  type Around,
  carriedComponents,
  type ConsumerProps,
  handledKeys,
  renderBuilt,
  renderBuiltTwice,
  renderBuiltWithin,
} from "./built-library";
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

type TakesAnything<Value> = 0 extends 1 & Value ? true : false;

type ElementValued<Props> = {
  [Key in keyof Props]-?: TakesAnything<Props[Key]> extends true
    ? never
    : JSX.Element extends Props[Key]
      ? Key
      : never;
}[keyof Props];

type Fixture<Component> = {
  tag: string;
  booleanAttribute: string;
  takesDisplay: TakesDisplay<PropsOf<Component>>;
  polymorphic: Polymorphic<Component>;
  elementProps: Record<ElementValued<PropsOf<Component>>, true>;
  props: PropsOf<Component>;
};

const childrenProp = "children";

export const fixtures: { [Name in ComponentName]: Fixture<(typeof Library)[Name]> } = {
  Box: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: true,
    elementProps: { children: true },
    props: { children: "Content" },
  },
  Button: {
    tag: "button",
    booleanAttribute: "disabled",
    takesDisplay: true,
    polymorphic: true,
    elementProps: { children: true },
    props: { children: "Label" },
  },
  Center: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: true,
    elementProps: { children: true },
    props: { children: "Content" },
  },
  Container: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { children: "Content" },
  },
  Disclosure: {
    tag: "details",
    booleanAttribute: "open",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { label: "Label", children: "Content" },
  },
  Flex: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: true,
    elementProps: { children: true },
    props: { children: "Content" },
  },
  Grid: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: {
      type: "container",
      breakpoints: { xs: "20em", sm: "30em", md: "40em", lg: "50em", xl: "60em" },
      gap: { base: "xs", md: "xl" },
      children: "Content",
    },
  },
  GridCol: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { span: { base: 12, md: 6 }, children: "Content" },
  },
  Group: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { children: "Content" },
  },
  Modal: {
    tag: "dialog",
    booleanAttribute: "hidden",
    takesDisplay: false,
    polymorphic: false,
    elementProps: { children: true },
    props: { label: "Label", opened: false, children: "Content" },
  },
  SimpleGrid: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: {
      type: "container",
      cols: { base: 1, "30em": 2 },
      spacing: { "20em": "xl" },
      children: "Content",
    },
  },
  Space: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { children: "Content" },
  },
  Stack: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { children: "Content" },
  },
  Tabs: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { children: "Content" },
  },
  TabsList: {
    tag: "div",
    booleanAttribute: "hidden",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { children: "Content" },
  },
  TabsPanel: {
    tag: "div",
    booleanAttribute: "inert",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { value: "first", children: "Content" },
  },
  TabsTab: {
    tag: "button",
    booleanAttribute: "disabled",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true, leftSection: true, rightSection: true },
    props: { value: "first", leftSection: "Left", rightSection: "Right", children: "Label" },
  },
  TextInput: {
    tag: "input",
    booleanAttribute: "disabled",
    takesDisplay: true,
    polymorphic: false,
    elementProps: {},
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

function fixturePropsOf(name: string): ConsumerProps {
  if (!isComponentName(name)) {
    throw new Error(`packages/core/tests/fixtures.ts: add a fixture for ${name}.`);
  }
  return fixtures[name].props;
}

function aroundOf(name: string): Around | undefined {
  const carrier = carriedComponents[name]?.carrier;
  return carrier === undefined ? undefined : { carrier, props: fixturePropsOf(carrier) };
}

function renderGiven(name: string, given: ConsumerProps): string {
  const around = aroundOf(name);
  return around === undefined ? renderBuilt(name, given) : renderBuiltWithin(around, name, given);
}

export function renderTwiceOnOnePage(name: string): string {
  return renderBuiltTwice(name, fixturePropsOf(name), aroundOf(name));
}

export function render(name: string, props: ConsumerProps = {}): string {
  const fixtureProps = fixturePropsOf(name);
  const html = renderGiven(name, { ...fixtureProps, ...props });
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

export function readsInOneRender(name: string, prop: string): number {
  const props = fixturePropsOf(name);
  let reads = 0;
  renderGiven(
    name,
    Object.defineProperty({ ...props }, prop, {
      enumerable: true,
      get() {
        reads += 1;
        return props[prop];
      },
    }),
  );
  return reads;
}
