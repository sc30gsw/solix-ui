import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import type { ComponentStory } from "#/story-meta.ts";

type Args = Record<string, unknown>;
type Context = { readonly component?: unknown };
type RenderOne = (args: Args, context: Context) => JSX.Element;

const propShownBy = new WeakMap<object, string>();

function renderOf(meta: object): RenderOne {
  const render: unknown = Reflect.get(meta, "render");
  if (typeof render === "function") {
    return (args, context) => Reflect.apply(render, undefined, [args, context]);
  }
  return (args, context) => {
    const Component = context.component;
    if (typeof Component !== "function") {
      throw new Error("everyValueOf renders the meta's component, and the story context has none.");
    }
    return Reflect.apply(Component, undefined, [args]);
  };
}

export function everyValueOf<M extends { readonly component: unknown; readonly argTypes: object }>(
  meta: M,
  prop: keyof M["argTypes"] & string,
): ComponentStory<M>;
export function everyValueOf(meta: { readonly argTypes: object }, prop: string): object {
  const argType: unknown = Reflect.get(meta.argTypes, prop);
  const values: unknown =
    typeof argType === "object" && argType !== null ? Reflect.get(argType, "options") : undefined;
  if (!Array.isArray(values) || values.length < 2) {
    throw new Error(
      `${prop}: argTypesOf gives it no closed set of values, so there is no every value to show.`,
    );
  }
  const renderOne = renderOf(meta);
  const story = {
    render: (args: Args, context: Context) => (
      <ul aria-label={`Every ${prop}`}>
        <For each={values}>
          {(value) => (
            <li>
              <p>{`${prop}: ${String(value)}`}</p>
              {renderOne({ ...args, [prop]: value }, context)}
            </li>
          )}
        </For>
      </ul>
    ),
  };
  propShownBy.set(story, prop);
  return story;
}

export function propShownByEveryValueOf(story: object): string | undefined {
  return propShownBy.get(story);
}
