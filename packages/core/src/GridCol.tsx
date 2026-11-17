import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
import { useGrid } from "./grid-context";
import { createParts, type ElementProps } from "./parts";
import { variableProperty } from "./style-prop-table";
import { eachValue, type StyleProp, type VariableProp, withBase } from "./style-props";

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
    span?: StyleProp<Span>;
    order?: VariableProp<"col-order", number>;
    offset?: StyleProp<number>;
    align?: VariableProp<"col-align-self", JSX.CSSProperties["align-self"]>;
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
  const { root } = createParts(
    "GridCol",
    styles,
    props,
    {
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
    },
    "offset",
    "span",
  );
  return (
    <>
      <Show when={own.rules()}>{(rules) => <style data-solix-rules>{rules()}</style>}</Show>
      <div {...root} />
    </>
  );
}
