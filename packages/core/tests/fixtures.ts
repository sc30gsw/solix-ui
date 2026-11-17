import type { JSX } from "@solidjs/web";
import { expect } from "vite-plus/test";
import type * as Library from "#/src/index.ts";
import type { DisplayPropName } from "#/src/style-prop-table.ts";
import {
  carriedComponents,
  type ConsumerProps,
  handledKeys,
  renderBuilt,
  renderBuiltWithin,
} from "#/tests/built-library.ts";
import { elementsOf } from "#/tests/markup.ts";

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
  Disclosure: {
    tag: "details",
    booleanAttribute: "open",
    takesDisplay: true,
    polymorphic: false,
    elementProps: { children: true },
    props: { label: "Label", children: "Content" },
  },
  Modal: {
    tag: "dialog",
    booleanAttribute: "hidden",
    takesDisplay: false,
    polymorphic: false,
    elementProps: { children: true },
    props: { label: "Label", opened: false, children: "Content" },
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

function fixtureOf(name: string): { props: ConsumerProps } {
  if (!isComponentName(name)) {
    throw new Error(`packages/core/tests/fixtures.ts: add a fixture for ${name}.`);
  }
  return fixtures[name];
}

function renderGiven(name: string, given: ConsumerProps): string {
  const carrier = carriedComponents[name]?.carrier;
  return carrier === undefined
    ? renderBuilt(name, given)
    : renderBuiltWithin(carrier, fixtureOf(carrier).props, name, given);
}

export function render(name: string, props: ConsumerProps = {}): string {
  const { props: fixtureProps } = fixtureOf(name);
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
  const { props } = fixtureOf(name);
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
