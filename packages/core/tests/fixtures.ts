import type * as Library from "../src/index";
import type { ConsumerProps } from "./built-library";

type PropsOf<Component> = Component extends (props: infer Props) => unknown ? Props : never;
type TakesDisplay<Component> = "display" extends keyof PropsOf<Component>
  ? [NonNullable<PropsOf<Component>["display"]>] extends [never]
    ? false
    : true
  : false;
type Polymorphic<Component> = "component" extends keyof PropsOf<Component> ? true : false;

type Fixture<Component> = {
  tag: string;
  booleanAttribute: string;
  takesDisplay: TakesDisplay<Component>;
  polymorphic: Polymorphic<Component>;
  props: ConsumerProps;
};

export const fixtures: { [Name in keyof typeof Library]: Fixture<(typeof Library)[Name]> } = {
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

export const polymorphicComponents = Object.entries(fixtures)
  .filter(([, { polymorphic }]) => polymorphic)
  .map(([name]) => name);
