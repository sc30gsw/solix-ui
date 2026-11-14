import { expect } from "vite-plus/test";
import type * as Library from "../src/index";
import type { DisplayPropName } from "../src/style-prop-table";
import { type ConsumerProps, renderBuilt, stylesApiPropKeys } from "./built-library";
import { elementsOf } from "./markup";

type PropsOf<Component> = Component extends (props: infer Props) => unknown ? Props : never;
type Refused<Props, Key extends PropertyKey> = Key extends keyof Props
  ? [NonNullable<Props[Key]>] extends [never]
    ? true
    : false
  : true;
type TakesDisplay<Component> = [Refused<PropsOf<Component>, DisplayPropName>] extends [false]
  ? true
  : [Refused<PropsOf<Component>, DisplayPropName>] extends [true]
    ? false
    : never;
type Polymorphic<Component> = "component" extends keyof PropsOf<Component> ? true : false;

type Fixture<Component> = {
  tag: string;
  booleanAttribute: string;
  takesDisplay: TakesDisplay<Component>;
  polymorphic: Polymorphic<Component>;
  props: ConsumerProps;
};

type ComponentName = keyof typeof Library;

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

function isComponentName(name: string): name is ComponentName {
  return Object.hasOwn(fixtures, name);
}

function stylesApiPropsOn(html: string): string[] {
  return elementsOf(html).flatMap(({ tag, attributes }) =>
    attributes
      .filter(([name]) => stylesApiPropKeys.some((key) => key.toLowerCase() === name.toLowerCase()))
      .map(([name]) => `<${tag}> ${name}`),
  );
}

export function render(name: string, props: ConsumerProps = {}): string {
  if (!isComponentName(name)) {
    throw new Error(`packages/core/tests/fixtures.ts: add a fixture for ${name}.`);
  }
  const html = renderBuilt(name, { ...fixtures[name].props, ...props });
  expect(stylesApiPropsOn(html), "classes, styles and unstyled reach no element").toEqual([]);
  return html;
}
