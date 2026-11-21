import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
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

const generatedIdentities = new Set([
  "id",
  "for",
  "aria-controls",
  "aria-labelledby",
  "aria-describedby",
]);

function lookOf(element: Element): string {
  const attributes = [...element.attributes]
    .filter(({ name }) => !generatedIdentities.has(name))
    .map(({ name, value }) => `${name}=${value}`)
    .toSorted();
  const style = getComputedStyle(element);
  const computed = [...style].map((property) => `${property}:${style.getPropertyValue(property)}`);
  const script = element instanceof HTMLScriptElement ? [element.text] : [];
  return [element.tagName, ...attributes, ...script, ...computed].join(";");
}

function renderedLooks(item: Element): string {
  return [...item.children]
    .slice(1)
    .flatMap((rendered) => [rendered, ...rendered.querySelectorAll("*")])
    .map(lookOf)
    .join("|");
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
  return (
    meta.render ??
    ((args, { component }) => {
      if (!isRendered(component))
        throw new Error("everyValueOf: the story context has no component.");
      return component(args);
    })
  );
}

export function everyValueOf<
  M extends { readonly component: Component; readonly argTypes: object },
  K extends ClosedPropsOf<M["component"]> & keyof M["argTypes"],
>(
  meta: M,
  prop: K,
  args?: Partial<PropsOf<M["component"]>>,
  rendersAs?: Partial<Record<ValueOf<M["component"], K>, ValueOf<M["component"], K>>>,
): ComponentStory<M>;
export function everyValueOf(
  meta: ValuesMeta,
  prop: string,
  args: Args = {},
  rendersAs: Readonly<Record<string, string | undefined>> = {},
): object {
  const label = `Every ${prop}`;
  const renderOne = renderOf(meta);
  return {
    args,
    render: (given: Args, context: Context) => (
      <ul aria-label={label}>
        <For each={valuesOf(meta, prop)}>
          {(value) => (
            <li>
              <p>{`${prop}: ${String(value)}`}</p>
              {renderOne({ ...given, [prop]: value }, context)}
            </li>
          )}
        </For>
      </ul>
    ),
    play: ({ canvasElement }: { readonly canvasElement: Element }) => {
      playOfEveryValueStarted();
      const values = valuesOf(meta, prop);
      const items = [...canvasElement.querySelectorAll(`ul[aria-label="${label}"] > li`)];
      const looks = items.map(renderedLooks);
      const lookOfValue = (value: Option) => looks[values.indexOf(value)];
      const alike = values.flatMap((value, at) =>
        values
          .slice(at + 1)
          .filter((other) => looks[at] === lookOfValue(other))
          .filter((other) => rendersAs[String(value)] !== String(other))
          .filter((other) => rendersAs[String(other)] !== String(value))
          .map((other) => `${String(value)} and ${String(other)}`),
      );
      const unlike = Object.entries(rendersAs)
        .filter(
          ([value, as]) =>
            as !== undefined &&
            looks[values.map(String).indexOf(value)] !== looks[values.map(String).indexOf(as)],
        )
        .map(([value, as]) => `${value} as ${as}`);
      if (items.length !== values.length || alike.length > 0 || unlike.length > 0) {
        throw new Error(
          `everyValueOf(meta, "${prop}") renders ${items.length} of ${values.length} values; alike in every attribute and computed style: ${alike.join("; ") || "none"}; not rendered as given: ${unlike.join("; ") || "none"}. Give the story, as its third argument, the args that make each value show.`,
        );
      }
    },
  };
}
