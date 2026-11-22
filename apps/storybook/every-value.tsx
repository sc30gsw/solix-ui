import type { JSX } from "@solidjs/web";
import { colorSchemeAttribute, type SolixComputedColorScheme } from "@solix/core";
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

const lookedAt = [undefined, "::before", "::after", "::placeholder", "::marker"];

function lookOf(element: Element): string {
  return lookedAt
    .map((pseudo) => {
      const style = getComputedStyle(element, pseudo);
      return [...style].map((property) => `${property}:${style.getPropertyValue(property)}`);
    })
    .join("|");
}

function renderedOf(item: Element): Element[] {
  return [...item.children].slice(1);
}

function renderedLooks(item: Element): string {
  return renderedOf(item)
    .flatMap((rendered) => [rendered, ...rendered.querySelectorAll("*")])
    .map(lookOf)
    .join("||");
}

type Scheme = SolixComputedColorScheme;
type AlikeGroups<V> = readonly (readonly V[])[];

export type AlikeValues<V extends string> = {
  readonly rendersAs?: Partial<Record<V, V>>;
  readonly inScheme?: Partial<Record<Scheme, AlikeGroups<V>>>;
  readonly atWidth?: { readonly width: number; readonly alike: AlikeGroups<V> };
  readonly byEffect?: { readonly effect: string; readonly of: (rendered: Element) => string };
  readonly knownOpen?: { readonly followUp: string; readonly alike: AlikeGroups<V> };
};

type Declared = { readonly kind: string; readonly pairs: readonly (readonly [string, string])[] };

const viewportHeight = 900;

function pairsIn(groups: AlikeGroups<string>): [string, string][] {
  return groups.flatMap((group) =>
    group.flatMap((value, at) =>
      group.slice(at + 1).map((other): [string, string] => [value, other]),
    ),
  );
}

function groupsRenderedAs(rendersAs: Readonly<Record<string, string | undefined>>): string[][] {
  const finalOf = (value: string, seen: readonly string[] = []): string => {
    const as = rendersAs[value];
    return as === undefined || seen.includes(as) ? value : finalOf(as, [...seen, value]);
  };
  const groups = Map.groupBy(
    [...new Set(Object.entries(rendersAs).flatMap(([value, as]) => [value, as ?? value]))],
    (value) => finalOf(value),
  );
  return [...groups.values()];
}

export const cssWideKeywords = {
  initial: "inherit",
  revert: "inherit",
  "revert-layer": "inherit",
  unset: "inherit",
} as const;

function schemeOf(element: Element): Scheme {
  const scheme = element.closest(`[${colorSchemeAttribute}]`)?.getAttribute(colorSchemeAttribute);
  if (scheme === "dark" || scheme === "light") return scheme;
  if (scheme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function declaredAlike(
  alike: AlikeValues<string>,
  scheme: Scheme,
  knownOpen: string,
): readonly Declared[] {
  return [
    {
      kind: "rendersAs",
      pairs: pairsIn(groupsRenderedAs(alike.rendersAs ?? {})),
    },
    { kind: `inScheme.${scheme}`, pairs: pairsIn(alike.inScheme?.[scheme] ?? []) },
    { kind: `atWidth ${alike.atWidth?.width}px`, pairs: pairsIn(alike.atWidth?.alike ?? []) },
    { kind: knownOpen, pairs: pairsIn(alike.knownOpen?.alike ?? []) },
  ].filter(({ pairs }) => pairs.length > 0);
}

function viewportOf(width: number): object {
  const name = `${width}px`;
  return {
    parameters: {
      viewport: {
        options: {
          [name]: { name, styles: { width: name, height: `${viewportHeight}px` }, type: "desktop" },
        },
      },
    },
    globals: { viewport: { value: name, isRotated: false } },
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
  alike?: AlikeValues<ValueOf<M["component"], K>>,
): ComponentStory<M>;
export function everyValueOf(
  meta: ValuesMeta,
  prop: string,
  args: Args = {},
  alike: AlikeValues<string> = {},
): object {
  const label = `Every ${prop}`;
  const renderOne = renderOf(meta);
  const knownOpen = `knownOpen, until ${alike.knownOpen?.followUp}`;
  return {
    ...(alike.atWidth === undefined ? {} : viewportOf(alike.atWidth.width)),
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
      const width = alike.atWidth?.width;
      if (width !== undefined && window.innerWidth !== width) {
        throw new Error(
          `everyValueOf(meta, "${prop}") declares the values alike at ${width}px, but the page is ${window.innerWidth}px wide. Run the story at the viewport it sets.`,
        );
      }
      const values = valuesOf(meta, prop).map(String);
      const items = [...canvasElement.querySelectorAll(`ul[aria-label="${label}"] > li`)];
      const looks = items.map(renderedLooks);
      const effect = alike.byEffect;
      const effects = items.map((item) =>
        effect === undefined ? "" : renderedOf(item).map(effect.of).join("|"),
      );
      const at = (value: string) => values.indexOf(value);
      const declared = declaredAlike(alike, schemeOf(canvasElement), knownOpen);
      const isDeclared = (value: string, other: string) =>
        declared.some(({ pairs }) =>
          pairs.some(([a, b]) => (a === value && b === other) || (a === other && b === value)),
        );
      const pairs = values.flatMap((value, index) =>
        values.slice(index + 1).map((other) => [value, other] as const),
      );
      const named = ([value, other]: readonly [string, string]) => `${value} and ${other}`;
      const alikeInLook = (value: string, other: string) => looks[at(value)] === looks[at(other)];
      const tellsApart = (value: string, other: string) =>
        effect === undefined
          ? !alikeInLook(value, other)
          : effects[at(value)] !== effects[at(other)];
      const undeclared = pairs.filter(
        ([value, other]) => !tellsApart(value, other) && !isDeclared(value, other),
      );
      const unneeded = declared.flatMap(({ kind, pairs: given }) =>
        given
          .filter(([value, other]) => !alikeInLook(value, other))
          .map((pair) => `${kind}: ${named(pair)}`),
      );
      const shownApart =
        effect === undefined
          ? []
          : pairs
              .filter(([value, other]) => !alikeInLook(value, other))
              .map((pair) => `byEffect: ${named(pair)}`);
      const problems = [
        items.length === values.length
          ? []
          : [`it renders ${items.length} of ${values.length} values`],
        undeclared.length === 0
          ? []
          : [
              `${undeclared.map(named).join("; ")} render alike in every computed style${effect === undefined ? "" : ` and in ${effect.effect}`}, and no exception declares them alike. Give the story, as its third argument, the args that make each value show`,
            ],
        [...unneeded, ...shownApart].length === 0
          ? []
          : [
              `the exceptions declare ${[...unneeded, ...shownApart].join("; ")} alike, but they render differently. Remove them from the exception`,
            ],
      ].flat();
      if (problems.length > 0) {
        throw new Error(`everyValueOf(meta, "${prop}"): ${problems.join("; and ")}.`);
      }
    },
  };
}
