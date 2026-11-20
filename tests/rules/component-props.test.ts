import { expect, test } from "vite-plus/test";
import { componentPropsOf, type Control } from "#/scripts/component-props.ts";
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
