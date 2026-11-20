import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  componentPropsOf,
  type Control,
  libraryComponentProps,
} from "#/scripts/component-props.ts";
import { repositoryRoot } from "#/scripts/repository.ts";
import { virtualFile } from "#/scripts/syntax.ts";

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
import type { ElementProps } from ${JSON.stringify(sharedPropTypes)};

type StatefulProps = ElementProps<
  "div",
  { root: object },
  {
    /**
     * The tone it speaks in.
     * It never shouts.
     * @see nowhere
     */
    tone?: "calm" | "loud";
    /** The open value. */
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    loop?: boolean;
  }
>;

function Stateful(props: StatefulProps): JSX.Element {
  const tone = () => props.tone ?? "calm";
  const loop = () => props.loop ?? true;
  return <div data-tone={tone()} data-loop={String(loop())} />;
}

export { Stateful };
`;

test("a prop carries its doc comment as its description, the literal its component falls back to with ?? as its default, every value of a closed union, whether the props every element component shares declare it, and whether it is behaviour: a callback, either prop of a value and its default, or a boolean of a component that has either", () => {
  const [props] = Object.values(componentPropsOf(virtualFile(statefulProbe, ".tsx")));
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
    tone: {
      description: "The tone it speaks in. It never shouts.",
      defaultValue: '"calm"',
      values: ["calm", "loud"],
      behaviour: false,
    },
    value: { description: "The open value.", behaviour: true },
    defaultValue: { description: "", behaviour: true },
    onChange: { description: "", behaviour: true },
    loop: { description: "", defaultValue: "true", behaviour: true },
  });
});

test("every public prop of every component the library exports has a doc comment, which the controls table shows as its description", () => {
  const undescribed = Object.entries(libraryComponentProps()).flatMap(([component, props]) =>
    props
      .filter(({ description }) => description === "")
      .map(
        ({ name, declaredBy }) =>
          `${component}: the prop ${name}, declared by ${declaredBy}, has no doc comment. Write one on its declaration; the controls table shows it.`,
      ),
  );

  expect([...new Set(undescribed)]).toEqual([]);
});
