import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
import { useGrid } from "#/src/grid-context.ts";
import { LibraryStyle } from "#/src/library-style.tsx";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { gridColVariables } from "#/src/GridCol.variables.ts";
import { variableProperty } from "#/src/style-prop-table.ts";
import { eachValue, type StyleProp, type VariableProp, withBase } from "#/src/style-props.ts";

const styles = stylex.create({
  root: {
    "--col-align-self": "initial",
    "--col-flex-basis": "initial",
    "--col-flex-grow": "0",
    "--col-max-width": "initial",
    "--col-offset": "0rem",
    "--col-order": "initial",
    "--col-width": "initial",
    alignSelf: "var(--col-align-self)",
    flexBasis: "var(--col-flex-basis)",
    flexGrow: "var(--col-flex-grow)",
    flexShrink: 0,
    marginInlineStart: "var(--col-offset)",
    maxWidth: "var(--col-max-width)",
    order: "var(--col-order)",
    width: "var(--col-width)",
  },
});

type Span = number | "auto" | "content";

const defaultSpan = 12;
const fractionDigits = 1e6;

export type GridColProps = ElementProps<
  "div",
  typeof styles,
  {
    /** `auto` takes the space the others leave, and `content` its content's width; under a `Grid` with `grow`, every column grows to fill the row. */
    span?: StyleProp<Span>;
    order?: VariableProp<typeof gridColVariables, "col-order", number>;
    offset?: StyleProp<number>;
    align?: VariableProp<
      typeof gridColVariables,
      "col-align-self",
      JSX.CSSProperties["align-self"]
    >;
  }
>;

function share(part: number, columns: number): string {
  return String(Math.round((part / columns) * fractionDigits) / fractionDigits);
}

export function GridCol(props: GridColProps) {
  const grid = useGrid();
  const own = grid.container.member();
  const gap = `var(${variableProperty("grid-column-gap")})`;
  const span = (given: GridColProps) => withBase<Span>(given.span, defaultSpan);
  const basis = (given: Span) => {
    if (given === "content") return "auto";
    if (given === "auto") return "0rem";
    if (!given) return undefined;
    return `calc((100% + ${gap}) * ${share(given, grid.columns())} - ${gap})`;
  };
  const { root } = createParts(gridColVariables, styles, props, {
    variables: {
      "col-align-self": "align",
      "col-flex-basis": (given) => eachValue<Span>(span(given), basis),
      "col-flex-grow": (given) =>
        eachValue<Span>(span(given), (each) => {
          if (!each) return undefined;
          return each === "auto" || grid.grow() ? "1" : "0";
        }),
      "col-max-width": (given) =>
        eachValue<Span>(span(given), (each) => {
          if (each === "auto" || grid.grow()) return "100%";
          return each === "content" ? "unset" : basis(each);
        }),
      "col-offset": (given) =>
        eachValue<number>(given.offset, (each) =>
          each === 0 ? "0" : `calc((100% + ${gap}) * ${share(each, grid.columns())})`,
        ),
      "col-order": "order",
      "col-width": (given) =>
        eachValue<Span>(span(given), (each) => (each === "content" ? "auto" : undefined)),
    },
    queries: own,
    carried: grid.col,
    keep: ["offset", "span"],
  });
  return (
    <>
      <Show when={own.rules()}>{(rules) => <LibraryStyle of="grid-col" css={rules()} />}</Show>
      <div {...root} />
    </>
  );
}
