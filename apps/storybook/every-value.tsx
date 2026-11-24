import type { JSX } from "@solidjs/web";
import { colorSchemeAttribute } from "@solix/core";
import { createComponent, For, merge } from "solid-js";
import { breakpointsAlikeAt } from "#/every-breakpoint.ts";
import {
  type AlikeGroup,
  type Engine,
  judgeEveryValue,
  type Observed,
  type Scheme,
} from "#/every-value-judge.ts";
import type { ComponentStory } from "#/story-meta.ts";
import { playOfEveryValueStarted } from "#/story-run.ts";

type Args = Record<string, unknown>;
type Option = string | number | boolean;
type Context = { readonly component?: unknown };
type Render = (args: Args, context: Context) => JSX.Element;
type Component = (props: never) => unknown;
type Scalar<V> = Exclude<NonNullable<V>, object>;
type IsLiteral<V> = V extends string
  ? string extends V
    ? false
    : {} extends Record<V, true>
      ? false
      : true
  : V extends number
    ? number extends V
      ? false
      : true
    : V extends boolean
      ? true
      : false;
type EveryLiteral<V> = false extends (V extends unknown ? IsLiteral<V> : never) ? false : true;
type Intersected<V> = (V extends unknown ? (value: V) => void : never) extends (
  value: infer All,
) => void
  ? All
  : never;
type MoreThanOne<V> = [V] extends [Intersected<V>] ? false : true;
type Closed<V> = [Scalar<V>] extends [never]
  ? false
  : MoreThanOne<Scalar<V>> extends true
    ? EveryLiteral<Scalar<V>>
    : false;

export type ClosedProps<P> = {
  [Key in keyof P & string]-?: Closed<P[Key]> extends true ? Key : never;
}[keyof P & string];

type PropsOf<C> = C extends (props: infer P) => unknown ? P : never;

export type ClosedPropsOf<C> = ClosedProps<PropsOf<C>>;

type ValueOf<
  C,
  K extends keyof PropsOf<C>,
> = `${Scalar<PropsOf<C>[K]> & (string | number | boolean)}`;
type ValuesMeta = {
  readonly component: unknown;
  readonly argTypes: Readonly<
    Record<string, { readonly options?: readonly Option[]; readonly control?: unknown } | undefined>
  >;
  readonly render?: Render;
};

export type Observation = {
  readonly name: string;
  readonly of: (container: Element) => Observed;
};

export type EveryValueOptions<P, V extends string> = {
  readonly args?: Partial<P>;
  readonly within?: JSX.CSSProperties;
  readonly viewport?: number;
  readonly observe?: Observation;
  readonly alike?: readonly AlikeGroup<V>[];
};

type GivenOptions = {
  readonly args?: Args;
  readonly within?: JSX.CSSProperties;
  readonly viewport?: number;
  readonly observe?: Observation;
  readonly alike?: readonly AlikeGroup[];
};

export const keywordsReachOnlyTheCustomProperty = {
  kind: "openUntil",
  followUp: "style props apply CSS-wide keywords to the property itself, not through var()",
} as const;

export const keywordsResetAPropertyThatIsNotInherited = {
  kind: "design",
  reason:
    "initial, unset, revert and revert-layer give a property that is not inherited its initial value, as -moz-initial does where an engine reads it and where it ignores it",
} as const;

const valueMark = "data-every-value";
const viewportHeight = 900;
const systemPrefersDark = "(prefers-color-scheme: dark)";

function declarationsOf(style: CSSStyleDeclaration, pseudo = ""): string[] {
  return [...style]
    .filter((property) => !property.startsWith("--"))
    .map((property) => `${pseudo}${property}:${style.getPropertyValue(property)}`);
}

const notGenerated = new Set(["none", "normal"]);

function generatedPseudoElements(element: Element): string[] {
  const boxes = ["::before", "::after"].filter(
    (pseudo) => !notGenerated.has(getComputedStyle(element, pseudo).content),
  );
  const marker = getComputedStyle(element).display.includes("list-item") ? ["::marker"] : [];
  const placeholder = ["INPUT", "TEXTAREA"].includes(element.tagName) ? ["::placeholder"] : [];
  return [...boxes, ...marker, ...placeholder];
}

function lookOf(element: Element): string[] {
  return [
    ...declarationsOf(getComputedStyle(element)),
    ...generatedPseudoElements(element).flatMap((pseudo) =>
      declarationsOf(getComputedStyle(element, pseudo), pseudo),
    ),
  ];
}

const look: Observation = {
  name: "the computed style of every element they render",
  of: (container) => [...container.querySelectorAll("*")].map(lookOf),
};

function engineOfThePage(): Engine {
  const agent = navigator.userAgent;
  if (agent.includes("Firefox/")) return "firefox";
  return agent.includes("Chrome/") ? "chromium" : "webkit";
}

function schemeOfThePage(): Scheme {
  return document.documentElement.getAttribute(colorSchemeAttribute) === "dark" ? "dark" : "light";
}

function viewportOf(width: number) {
  const name = `${width}px`;
  const styles = { width: name, height: `${viewportHeight}px` };
  return {
    parameter: { options: { [name]: { name, styles, type: "desktop" } } },
    global: { value: name, isRotated: false },
  };
}

const bothBooleans = [true, false];

function isBooleanControl(control: unknown): boolean {
  return isRecord(control) && control.type === "boolean";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function valuesOf(meta: ValuesMeta, prop: string): readonly Option[] {
  const argType = meta.argTypes?.[prop];
  const values =
    argType?.options ?? (isBooleanControl(argType?.control) ? bothBooleans : undefined);
  if (values === undefined || values.length < 2) {
    throw new Error(
      `everyValueOf(meta, "${prop}"): the meta's argTypes give "${prop}" no select of two or more options and no boolean control, so there are no values to show. Give it argTypesOf(component) from virtual:story-controls.`,
    );
  }
  return values;
}

function isRendered(component: unknown): component is (props: Args) => JSX.Element {
  return typeof component === "function";
}

function renderOf(meta: ValuesMeta): Render {
  if (meta.render !== undefined) return meta.render;
  const { component } = meta;
  if (!isRendered(component)) {
    throw new Error("everyValueOf: the meta has no component to render.");
  }
  return (args) => createComponent(component, args);
}

export function everyValueOf<
  M extends { readonly component: Component; readonly argTypes: object },
  K extends ClosedPropsOf<M["component"]> & keyof M["argTypes"],
>(
  meta: M,
  prop: K,
  options?: EveryValueOptions<PropsOf<M["component"]>, ValueOf<M["component"], K>>,
): ComponentStory<M>;
export function everyValueOf(meta: ValuesMeta, prop: string, options?: GivenOptions): object {
  return storyOfEveryValue(meta, prop, options);
}

function storyOfEveryValue(meta: ValuesMeta, prop: string, options: GivenOptions = {}): object {
  const label = `Every ${prop}`;
  const renderOne = renderOf(meta);
  const { args = {}, within, viewport, observe = look, alike = [] } = options;
  const set = viewport === undefined ? undefined : viewportOf(viewport);
  return {
    parameters: {
      everyValue: { prop, viewport },
      ...(set === undefined ? {} : { viewport: set.parameter }),
    },
    ...(set === undefined ? {} : { globals: { viewport: set.global } }),
    args,
    render: (given: Args, context: Context) => (
      <ul aria-label={label}>
        <For each={valuesOf(meta, prop)}>
          {(value) => (
            <li>
              <p>{`${prop}: ${String(value)}`}</p>
              <div {...{ [valueMark]: String(value) }} style={within}>
                {renderOne(merge(given, { [prop]: value }), context)}
              </div>
            </li>
          )}
        </For>
      </ul>
    ),
    play: ({ canvasElement }: { readonly canvasElement: Element }) => {
      playOfEveryValueStarted();
      const containers = [
        ...canvasElement.querySelectorAll(`ul[aria-label="${label}"] > li > [${valueMark}]`),
      ];
      const problems = judgeEveryValue({
        prop,
        values: valuesOf(meta, prop).map(String),
        observe: observe.name,
        observed: containers.map(observe.of),
        viewport,
        alike,
        surroundings: {
          engine: engineOfThePage(),
          scheme: schemeOfThePage(),
          systemScheme: matchMedia(systemPrefersDark).matches ? "dark" : "light",
          width: window.innerWidth,
        },
      });
      if (problems.length > 0) {
        throw new Error(problems.map(({ message }) => message).join("\n"));
      }
    },
  };
}

export function everyBreakpointValueAt<
  M extends { readonly component: Component; readonly argTypes: object },
  K extends ClosedPropsOf<M["component"]> & keyof M["argTypes"],
>(meta: M, prop: K, width: number): ComponentStory<M>;
export function everyBreakpointValueAt(meta: ValuesMeta, prop: string, width: number): object {
  return storyOfEveryValue(meta, prop, {
    viewport: width,
    alike: breakpointsAlikeAt(width).map((values) => ({
      values,
      because: { kind: "viewport", reason: "their breakpoints all lie on one side of its width" },
    })),
  });
}
