import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  componentPropsOf,
  type Control,
  libraryComponentProps,
  libraryEntry,
} from "#/scripts/component-props.ts";
import { repositoryRoot } from "#/scripts/repository.ts";
import { openSpecProgram } from "#/scripts/component-spec.ts";
import { openProgram, stringLiteralTypesOf, ts, virtualFile } from "#/scripts/syntax.ts";

const probe = `import type { JSX } from "@solidjs/web";

type Responsive<V> = V | { base?: V; md?: V };

type ProbeProps = {
  closed?: "start" | "end";
  suggested?: "start" | "end" | (string & {});
  scale?: "sm" | "md" | number | (string & {});
  numeric?: 1 | 2 | 3;
  flag?: boolean;
  onlyTrue?: true;
  openString?: string | 0 | Responsive<string>;
  template?: "red" | \`#\${string}\`;
  span?: Responsive<number | "auto" | "content">;
  responsiveClosed?: Responsive<"row" | "column">;
  shape?: { width: number };
  tag?: "div" | "span" | ((props: object) => JSX.Element) | (string & {});
  handler?: () => void;
};

function Probe(props: ProbeProps): JSX.Element {
  return <div>{String(props.closed)}</div>;
}

export { Probe };
`;

const select = (...options: (string | number | boolean)[]): Control => ({
  type: "select",
  options,
});

test("a prop's control is a select only for a closed union of literals or literals beside the string & {} idiom, a boolean only for both booleans, otherwise the control of the union's open part, and an object control only where no scalar control can give a value, so no control offers a value the type refuses or hides its open values", () => {
  const [props] = Object.values(componentPropsOf(virtualFile(probe, ".tsx")));
  const controls = Object.fromEntries(props.map(({ name, control }) => [name, control]));

  expect(controls).toEqual({
    closed: select("end", "start"),
    suggested: select("end", "start"),
    scale: { type: "text" },
    numeric: select(1, 2, 3),
    flag: { type: "boolean" },
    onlyTrue: select(true),
    openString: { type: "text" },
    template: { type: "text" },
    span: { type: "number" },
    responsiveClosed: select("column", "row"),
    shape: { type: "object" },
    tag: select("div", "span"),
    handler: { type: false },
  });
});

const sharedPropTypes = join(repositoryRoot, "packages/core/src/parts.ts");

const statefulProbe = `import type { JSX } from "@solidjs/web";
import { type ControlledProps, defaultsOf, type ElementProps, withDefaults } from ${JSON.stringify(sharedPropTypes)};

type StatefulProps = ElementProps<
  "div",
  { root: object },
  ControlledProps<string> & {
    /**
     * The tone it speaks in.
     * It never shouts.
     * @see nowhere
     */
    tone?: "calm" | "loud";
    loop?: boolean;
    renderTone?: (tone: string) => JSX.Element;
    label?: string;
  }
>;

const defaults = defaultsOf<StatefulProps>()({ tone: "calm", loop: true });

function Stateful(rawProps: StatefulProps): JSX.Element {
  const props = withDefaults(defaults, rawProps);
  return <div data-tone={props.tone} data-loop={String(props.loop)} />;
}

export { Stateful };
`;

test("a prop carries its doc comment as its description, and none where it has no doc comment, the literal its component's defaults object declares as its default, every value of a closed union, whether the props every element component shares declare it, and whether it is behaviour: a callback, a prop ControlledProps declares, or an own boolean or closed union of a component that has one of those", () => {
  const { program, components } = openSpecProgram(virtualFile(statefulProbe, ".tsx"));
  program.dispose();
  const [{ props }] = components;
  const own = props.filter(({ common }) => !common);
  const facts = Object.fromEntries(
    own.map(({ name, description, defaultValue, values, behaviour }) => [
      name,
      { description, defaultValue, values, behaviour },
    ]),
  );

  expect(props.filter(({ common }) => common).map(({ name }) => name)).toEqual(
    expect.arrayContaining(["classes", "styles", "unstyled", "class", "style", "m", "hiddenFrom"]),
  );
  expect(facts).toEqual({
    value: { description: expect.any(String), behaviour: true },
    defaultValue: { description: expect.any(String), behaviour: true },
    onChange: { description: expect.any(String), behaviour: true },
    tone: {
      description: "The tone it speaks in. It never shouts.",
      defaultValue: '"calm"',
      values: ["calm", "loud"],
      behaviour: true,
    },
    loop: { description: "", defaultValue: "true", values: [false, true], behaviour: true },
    renderTone: { description: "", behaviour: true },
    label: { description: "", behaviour: false },
  });
});

const docComment = /^\s*\/\*\*/;

test("each public prop of every component the library exports has at most one documented declaration, so its description is one comment and not several run together", () => {
  const { program, components } = openSpecProgram();
  try {
    const twice = components.flatMap(({ name, props }) =>
      props.flatMap(({ name: prop, declarations }) => {
        const documented = new Set(
          declarations.filter((declaration) => docComment.test(declaration.getFullText())),
        ).size;
        return documented > 1
          ? [
              `${name}: the prop ${prop} is documented on ${documented} declarations, so its description runs their comments together. Document it on one declaration, the type that gives it.`,
            ]
          : [];
      }),
    );

    expect(components.length).toBeGreaterThan(0);
    expect(twice).toEqual([]);
  } finally {
    program.dispose();
  }
});

const sharedDefaultsProbe = `import type { JSX } from "@solidjs/web";
import { defaultsOf, withDefaults } from ${JSON.stringify(sharedPropTypes)};

type Shared = {
  /** The tone. */
  tone?: "calm" | "loud";
};

type PlainProps = Shared;

const calm = defaultsOf<Shared>()({ tone: "calm" });
const loud = defaultsOf<Shared>()({ tone: "loud" });

function toneOf(given: Shared): string {
  const props = withDefaults(loud, given);
  return props.tone;
}

function Calm(rawProps: PlainProps): JSX.Element {
  const props = withDefaults(calm, rawProps);
  return <div data-tone={props.tone} />;
}

function Loud(props: PlainProps): JSX.Element {
  return <div data-tone={toneOf(props)} />;
}

function Plain(props: PlainProps): JSX.Element {
  return <div data-tone={props.tone} />;
}

export { Calm, Loud, Plain };
`;

test("a declared default belongs to the component that gives its defaults object to withDefaults with its own props, itself or through a function it passes its props to, so components that share a prop's declaration keep their own defaults and one that reads none has none", () => {
  const defaults = Object.fromEntries(
    Object.entries(componentPropsOf(virtualFile(sharedDefaultsProbe, ".tsx"))).map(
      ([component, props]) => [component, props.find(({ name }) => name === "tone")?.defaultValue],
    ),
  );

  expect(defaults).toEqual({ Calm: '"calm"', Loud: '"loud"', Plain: undefined });
});

test("the defaults the controls show are exactly these, each read from the Defaults type a component's withDefaults call takes, the colour variant of Button, ColorSchemeScript, whose script text reads the props through its own options type, and Group, which is on unless set to false, among them", () => {
  const shown = Object.fromEntries(
    Object.entries(libraryComponentProps()).flatMap(([component, props]) => {
      const defaults = props.flatMap(({ name, defaultValue }) =>
        defaultValue === undefined ? [] : [[name, defaultValue]],
      );
      return defaults.length === 0 ? [] : [[component, Object.fromEntries(defaults)]];
    }),
  );

  expect(shown).toEqual({
    Box: { component: '"div"' },
    Button: { component: '"button"', variant: '"filled"' },
    Center: { component: '"div"' },
    ColorSchemeScript: {
      defaultColorScheme: '"light"',
      localStorageKey: '"solix-color-scheme-value"',
    },
    Container: { size: '"md"', strategy: '"block"' },
    Flex: { component: '"div"' },
    Grid: { columns: "12", grow: "false" },
    Group: { preventGrowOverflow: "true" },
    SimpleGrid: { autoFlow: '"auto-fill"' },
    SolixProvider: {
      cssVariablesSelector: '":root"',
      defaultColorScheme: '"light"',
      withCssVariables: "true",
    },
    Tabs: {
      activateTabWithKeyboard: "true",
      allowTabDeactivation: "false",
      keepMounted: "true",
      loop: "true",
    },
  });
});

const everyValue = join(repositoryRoot, "apps/storybook/every-value.tsx");

test("everyValueOf takes exactly the public props whose spec holds every value: for every exported component, ClosedPropsOf names, among its public props, those that carry values, booleans among them", () => {
  const { program: specProgram, components } = openSpecProgram();
  specProgram.dispose();
  const closedOf = (name: string) => `Closed${name}`;
  const probe = virtualFile(
    [
      `import type { ClosedPropsOf } from ${JSON.stringify(everyValue)};`,
      `import type * as library from ${JSON.stringify(libraryEntry)};`,
      ...components.map(
        ({ name }) => `export type ${closedOf(name)} = ClosedPropsOf<typeof library.${name}>;`,
      ),
      "",
    ].join("\n"),
    ".ts",
  );
  const program = openProgram([probe]);
  try {
    const aliases = new Map(
      (program.sourceFile(probe)?.statements ?? []).flatMap((statement) =>
        ts.isTypeAliasDeclaration(statement) ? [[statement.name.text, statement.name]] : [],
      ),
    );
    const disagreements = components.flatMap(({ name, props }) => {
      const alias = aliasesOrThrow(aliases, closedOf(name));
      const publicProps = new Set(props.map((prop) => prop.name));
      const typed = stringLiteralTypesOf(program.checker, alias)
        .filter((prop) => publicProps.has(prop))
        .toSorted();
      const spec = props
        .filter(({ values }) => values !== undefined)
        .map((prop) => prop.name)
        .toSorted();
      return typed.join() === spec.join()
        ? []
        : [
            `${name}: ClosedPropsOf names ${typed.join(", ") || "nothing"}, but the spec holds every value of ${spec.join(", ") || "nothing"}. Make the type in apps/storybook/every-value.tsx and the values in scripts/syntax/props.ts tell closed unions alike.`,
          ];
    });

    expect(components.length).toBeGreaterThan(0);
    expect(disagreements).toEqual([]);
  } finally {
    program.dispose();
  }
});

function aliasesOrThrow(aliases: ReadonlyMap<string, ts.Node>, name: string): ts.Node {
  const alias = aliases.get(name);
  if (!alias) throw new Error(`${name}: the probe declares no such alias.`);
  return alias;
}

const inheritingProbe = `import type { JSX } from "@solidjs/web";
import type { ControlledProps, ElementProps, OpenedProps } from ${JSON.stringify(sharedPropTypes)};

type ToneProps = { tone?: "calm" | "loud" };

function Part(props: ElementProps<"div", { root: object }, { size?: "sm" | "lg" }>): JSX.Element {
  return <div data-size={props.size} />;
}

function Owner(props: ElementProps<"div", { root: object }, ControlledProps<string> & ToneProps>): JSX.Element {
  return <div data-tone={props.tone} />;
}

Owner.Part = Part;

function Sharer(props: ElementProps<"div", { root: object }, ToneProps & { width?: "narrow" | "wide" }>): JSX.Element {
  return <div data-tone={props.tone} data-width={props.width} />;
}

function Dialog(props: ElementProps<"div", { root: object }, OpenedProps & { size?: "sm" | "lg" }>): JSX.Element {
  return <div data-open={String(props.opened)} data-size={props.size} />;
}

export { Dialog, Owner, Part, Sharer };
`;

test("a component is stateful when a prop drives its state, a callback or one that ControlledProps or OpenedProps declares, or when it is a static part of a stateful component; its own closed props are behaviour, and so is any prop whose declaration is behaviour on another component", () => {
  const { program, components } = openSpecProgram(virtualFile(inheritingProbe, ".tsx"));
  program.dispose();
  const behaviour = Object.fromEntries(
    components.map(({ name, props }) => [
      name,
      props.filter((prop) => !prop.common && prop.behaviour).map((prop) => prop.name),
    ]),
  );

  expect(behaviour).toEqual({
    Dialog: ["opened", "size"],
    Owner: ["value", "defaultValue", "onChange", "tone"],
    Part: ["size"],
    Sharer: ["tone"],
  });
});
