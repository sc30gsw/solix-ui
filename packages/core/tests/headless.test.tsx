import { join } from "node:path";
import { createComponent, type JSX, renderToString } from "@solidjs/web";
import type { CompiledStyles } from "@stylexjs/stylex";
import fc from "fast-check";
import { expect, expectTypeOf, test } from "vite-plus/test";
import type * as Headless from "#/src/headless.ts";
import type * as Parts from "#/src/parts.ts";
import { dist } from "#/tests/built-library.ts";
import { classesOf, declarationsIn, elementsOf, valuesOf } from "#/tests/markup.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

const { bindSlot, createBehaviour, tabs } = (await import(
  join(dist, "headless.js")
)) as typeof Headless;
const { createParts } = (await import(join(dist, "parts.js"))) as typeof Parts;

const generatedRuns = 300;
const events = ["onClick", "onKeyDown", "onFocus"] as const;
const sources = ["consumer", "component", "behaviour"] as const;

type Source = (typeof sources)[number];
type EventName = (typeof events)[number];
type Handled = { defaultPrevented: boolean; preventDefault: () => void };
type Drawn = {
  id: string | undefined;
  hasRef: boolean;
  handlers: Partial<Record<EventName, { prevents: boolean; bound: boolean }>>;
  attributes: Record<string, string>;
  class: string | undefined;
  style: Record<string, string> | string | undefined;
};

const word = fc.stringMatching(/^[a-z]{1,6}$/);
const declarationsDrawn = fc.dictionary(fc.constantFrom("color", "margin", "--gap"), word, {
  maxKeys: 3,
});
const drawn: fc.Arbitrary<Drawn> = fc.record({
  id: fc.option(word, { nil: undefined }),
  hasRef: fc.boolean(),
  handlers: fc.dictionary(
    fc.constantFrom(...events),
    fc.record({ prevents: fc.boolean(), bound: fc.boolean() }),
  ),
  attributes: fc.dictionary(fc.constantFrom("title", "role", "data-state", "tabindex"), word),
  class: fc.option(word, { nil: undefined }),
  style: fc.option(
    fc.oneof(
      declarationsDrawn,
      declarationsDrawn.map((style) =>
        Object.entries(style)
          .map(([property, value]) => `${property}:${value};`)
          .join(""),
      ),
    ),
    { nil: undefined },
  ),
});

function event(): Handled {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function propsOf(source: Source, given: Drawn, calls: string[]): Record<string, unknown> {
  const handlers = Object.entries(given.handlers).map(([name, { prevents, bound }]) => {
    const handle = (handled: Handled) => {
      calls.push(`${source} ${name}`);
      if (prevents) handled.preventDefault();
    };
    return [name, bound ? [(_: unknown, handled: Handled) => handle(handled), source] : handle];
  });
  return {
    ...given.attributes,
    ...Object.fromEntries(handlers),
    ...(given.id === undefined ? {} : { id: given.id }),
    ...(given.hasRef ? { ref: () => calls.push(`${source} ref`) } : {}),
    ...(given.class === undefined ? {} : { class: given.class }),
    ...(given.style === undefined
      ? {}
      : { style: source === "behaviour" ? declared(given.style) : given.style }),
  };
}

function declared(style: unknown): Record<string, string> {
  return typeof style === "string"
    ? Object.fromEntries(declarationsIn(style))
    : { ...(style as Record<string, string> | undefined) };
}

test("bindSlot gives the behaviour only attributes, the consumer's over the component's, and merges what it returns in one order: each event reaches the consumer's handler, then the component's, then the behaviour's, until one prevents its default; refs run in that order; the id is the first of them given; the class is ours alone; a declaration of the behaviour's style gives way to ours", async (context) => {
  await assertProperty(
    context,
    fc.property(drawn, drawn, drawn, (consumer, component, behaviour) => {
      const calls: string[] = [];
      const given = { consumer, component, behaviour };
      const [ours, own, theirs] = sources.map((source) => propsOf(source, given[source], calls));
      const seen: Record<string, unknown>[] = [];
      const bound = bindSlot(ours, own, (attributes) => {
        seen.push({ ...attributes });
        return theirs;
      });

      expect(seen).toEqual([
        {
          ...component.attributes,
          ...consumer.attributes,
          id: consumer.id ?? component.id,
        },
      ]);
      for (const name of events) {
        calls.length = 0;
        const handled = event();
        const expected: string[] = [];
        for (const source of sources) {
          const handler = given[source].handlers[name];
          if (handler === undefined) continue;
          expected.push(`${source} ${name}`);
          if (handler.prevents) break;
        }
        (bound[name] as ((handled: Handled) => void) | undefined)?.(handled);
        expect(calls, name).toEqual(expected);
      }
      calls.length = 0;
      for (const ref of bound.ref as (() => void)[]) ref();
      expect(calls).toEqual(
        sources.filter((source) => given[source].hasRef).map((source) => `${source} ref`),
      );
      expect(bound.id).toBe(consumer.id ?? component.id ?? behaviour.id);
      expect(bound.class).toBe(consumer.class);
      expect(declared(bound.style)).toEqual({
        ...declared(behaviour.style),
        ...declared(consumer.style),
      });
      for (const [name, value] of Object.entries(behaviour.attributes)) {
        expect(bound[name], `the behaviour's ${name}`).toBe(value);
      }
    }),
    { numRuns: generatedRuns },
  );
});

function compiledAs(name: string): CompiledStyles {
  return { $$css: true, display: `probe-${name}` } as unknown as CompiledStyles;
}

test("bindSlot binds props that carry a symbol key, as Solid's own props proxies do", () => {
  const marker = Symbol("marker");
  const bound = bindSlot({ [marker]: "ours", title: "t" }, {}, (attributes) => ({
    ...attributes,
    role: "tab",
  }));

  expect({ ...bound }).toMatchObject({ title: "t", role: "tab" });
});

const compiled = {
  root: compiledAs("root"),
  list: compiledAs("list"),
  tab: compiledAs("tab"),
  panel: compiledAs("panel"),
};

type ProbeProps = {
  class?: string;
  style?: Record<string, string>;
  id?: string;
  tabId?: string;
  disabled: boolean;
  preventsClick: boolean;
  onChange: (value: string | null) => void;
  calls: string[];
  capture: (tab: Record<string, unknown>) => void;
};

function Probe(props: ProbeProps) {
  const behaviour = createBehaviour(tabs, () => ({
    value: null,
    onValueChange: (value: string | null) => props.onChange(value),
  }));
  const { root, part } = behaviour.bind(
    createParts("Probe", compiled, props, {
      keep: ["tabId", "disabled", "preventsClick", "onChange", "calls", "capture"],
    }),
    {
      root: { slot: "root" },
      list: { slot: "list" },
      tab: {
        slot: "tab",
        props: () => ({ value: "one", disabled: props.disabled }),
        own: {
          id: props.tabId,
          onClick: (handled: Handled) => {
            props.calls.push("component");
            if (props.preventsClick) handled.preventDefault();
          },
        },
      },
      panel: { slot: "panel", props: () => ({ value: "one", keepMounted: true }) },
    },
  );
  props.capture(part("tab"));
  return (
    <div {...root}>
      <div {...part("list")}>
        <button {...part("tab")} />
      </div>
      <div {...part("panel")} />
    </div>
  );
}

test("bound to the SDK's tabs slots, each part keeps exactly our classes and our style, takes the SDK's role, takes our id where we give one and the SDK's where we do not, with the panel labelled by whichever the tab has, and a click reaches the component's handler and then selects through the SDK unless the component prevented its default or the tab is disabled", async (context) => {
  await assertProperty(
    context,
    fc.property(
      fc.record({
        class: fc.option(word, { nil: undefined }),
        id: fc.option(word, { nil: undefined }),
        tabId: fc.option(word, { nil: undefined }),
        disabled: fc.boolean(),
        preventsClick: fc.boolean(),
      }),
      (given) => {
        const calls: string[] = [];
        let tab: Record<string, unknown> = {};
        const html = renderToString(() =>
          createComponent(Probe, {
            ...given,
            style: { color: "red" },
            calls,
            onChange: (value) => calls.push(`selected ${value}`),
            capture: (captured) => (tab = captured),
          }),
        );
        const [root, list, button, panel] = elementsOf(html);
        const rendered = { root, list, tab: button, panel };

        for (const [name, element] of Object.entries(rendered)) {
          expect(classesOf(element), `the classes of ${name}`).toEqual([
            `probe-${name}`,
            `solix-Probe-${name}`,
            ...(name === "root" && given.class !== undefined ? [given.class] : []),
          ]);
          expect(valuesOf(element, "style"), `the style of ${name}`).toEqual(
            name === "root" ? ["color:red"] : [],
          );
        }
        expect(valuesOf(root, "id")).toEqual(given.id === undefined ? [] : [given.id]);
        expect(valuesOf(list, "role")).toEqual(["tablist"]);
        expect(valuesOf(button, "role")).toEqual(["tab"]);
        expect(valuesOf(panel, "role")).toEqual(["tabpanel"]);
        expect(valuesOf(button, "id")).toEqual([
          given.tabId ?? expect.stringMatching(/^ui-sdk-.+-tab-one$/),
        ]);
        expect(valuesOf(panel, "aria-labelledby")).toEqual(valuesOf(button, "id"));

        (tab.onClick as (handled: Handled) => void)(event());
        expect(calls).toEqual(
          given.preventsClick || given.disabled ? ["component"] : ["component", "selected one"],
        );
      },
    ),
    { numRuns: generatedRuns },
  );
});

type Bind = Headless.Behaviour<typeof tabs>["bind"];
type ProbeParts = { root: object; part: (name: "list" | "tab" | "panel") => object };
type Binds<Slots> = Bind extends (parts: ProbeParts, slots: Slots) => unknown ? true : false;

type BindsARootOf<Root> = Bind extends (
  parts: { root: Root; part: (name: never) => object },
  slots: { root: { slot: "list" } },
) => unknown
  ? true
  : false;

test("bind refuses, in its type, parts whose root still takes children, and takes parts whose root has none or declares them never", () => {
  expectTypeOf<BindsARootOf<{ id?: string }>>().toEqualTypeOf<true>();
  expectTypeOf<BindsARootOf<{ id?: string; children?: never }>>().toEqualTypeOf<true>();
  expectTypeOf<BindsARootOf<{ id?: string; children?: JSX.Element }>>().toEqualTypeOf<false>();
  expectTypeOf<BindsARootOf<{ children: string }>>().toEqualTypeOf<false>();
});

test("bind takes, in its type, a slot for the root and for each part the styles name, with the props that slot needs, and refuses a part the styles do not name, a slot the behaviour does not have, and a slot given without the props it needs", () => {
  expectTypeOf<Binds<{ root: { slot: "root" } }>>().toEqualTypeOf<true>();
  expectTypeOf<Binds<{ list: { slot: "list" } }>>().toEqualTypeOf<true>();
  expectTypeOf<
    Binds<{ tab: { slot: "tab"; props: () => { value: string } } }>
  >().toEqualTypeOf<true>();
  expectTypeOf<Binds<{ lst: { slot: "list" } }>>().toEqualTypeOf<false>();
  expectTypeOf<Binds<{ root: { slot: "root" }; lst: { slot: "list" } }>>().toEqualTypeOf<false>();
  expectTypeOf<Binds<{ list: { slot: "nonsense" } }>>().toEqualTypeOf<false>();
  expectTypeOf<Binds<{ tab: { slot: "tab" } }>>().toEqualTypeOf<false>();
});

test("bind refuses, in its type, a component's own props that carry a class or a style, which the bound part would drop", () => {
  expectTypeOf<Binds<{ list: { slot: "list"; own: { title: string } } }>>().toEqualTypeOf<true>();
  expectTypeOf<Binds<{ list: { slot: "list"; own: { class: string } } }>>().toEqualTypeOf<false>();
  expectTypeOf<
    Binds<{ list: { slot: "list"; own: { style: { color: string } } } }>
  >().toEqualTypeOf<false>();
  expectTypeOf<Binds<{ list: { slot: "list"; own: { style: string } } }>>().toEqualTypeOf<false>();
});
