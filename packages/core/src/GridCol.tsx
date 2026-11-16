import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { useGrid } from "./grid-context";
import { createParts, type ElementProps } from "./parts";
import { type StyleProp, variables } from "./style-props";

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
    order?: StyleProp<number>;
    offset?: StyleProp<number>;
    align?: StyleProp<JSX.CSSProperties["align-self"]>;
  }
>;

function eachValue<V extends string | number>(
  value: StyleProp<V>,
  write: (given: V) => string | undefined,
): StyleProp<string> {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return write(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, given]) => [
      key,
      given === undefined || given === null ? given : write(given),
    ]),
  );
}

function withBase<V extends string | number>(value: StyleProp<V>, base: V): StyleProp<V> {
  if (value === undefined || value === null) return base;
  if (typeof value !== "object") return value;
  return { ...value, base: value.base ?? base };
}

function share(part: number, columns: number): string {
  return String(Math.round((part / columns) * fractionDigits) / fractionDigits);
}

export function GridCol(props: GridColProps) {
  const grid = useGrid();
  const span = () => withBase(props.span, defaultSpan);
  const basis = (given: Span) => {
    if (given === "content") return "auto";
    if (given === "auto") return "0rem";
    if (!given) return undefined;
    return `calc((100% + var(--grid-column-gap)) * ${share(given, grid.columns())} - var(--grid-column-gap))`;
  };
  const { root } = createParts(
    "GridCol",
    styles,
    props,
    () =>
      variables(
        {
          "col-align-self": props.align,
          "col-flex-basis": eachValue(span(), basis),
          "col-flex-grow": eachValue(span(), (given) => {
            if (!given) return undefined;
            return given === "auto" || grid.grow() ? "1" : "0";
          }),
          "col-max-width": eachValue(span(), (given) => {
            if (given === "auto" || grid.grow()) return "100%";
            return given === "content" ? "unset" : basis(given);
          }),
          "col-offset": eachValue(props.offset, (given) =>
            given === 0
              ? "0"
              : `calc((100% + var(--grid-column-gap)) * ${share(given, grid.columns())})`,
          ),
          "col-order": eachValue(props.order, String),
          "col-width": eachValue(span(), (given) => (given === "content" ? "auto" : undefined)),
        },
        grid.queries(),
      ),
    "align",
    "offset",
    "order",
    "span",
  );
  return <div {...root} />;
}
