import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { createUniqueId, Show } from "solid-js";
import { GridCol } from "#/src/GridCol.tsx";
import { GridContext } from "#/src/grid-context.ts";
import { LibraryStyle } from "#/src/library-style.tsx";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { gridVariables } from "#/src/Grid.variables.ts";
import { type Breakpoint, breakpoints } from "#/src/style-prop-table.ts";
import {
  type ContainerWidth,
  containerWidthOf,
  createQueryContainer,
  type VariableProp,
} from "#/src/style-props.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const defaultColumns = 12;

const styles = stylex.create({
  container: {
    containerType: "inline-size",
  },
  root: {
    "--grid-align": "stretch",
    "--grid-column-gap": "var(--grid-gap)",
    "--grid-gap": tokens["--solix-spacing-md"],
    "--grid-justify": "flex-start",
    "--grid-overflow": "visible",
    "--grid-row-gap": "var(--grid-gap)",
    overflow: "var(--grid-overflow)",
  },
  inner: {
    alignItems: "var(--grid-align)",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--grid-row-gap) var(--grid-column-gap)",
    justifyContent: "var(--grid-justify)",
  },
});

export type GridProps = ElementProps<
  "div",
  typeof styles,
  (
    | {
        /** `media` keys responsive values by the viewport's width; `container` keys them by the grid's own width, through container queries. */
        type?: "media";
        breakpoints?: never;
      }
    | {
        type: "container";
        /** The container width each breakpoint stands for, with `type` `container`. */
        breakpoints?: Record<Breakpoint, ContainerWidth>;
      }
  ) & {
    /** Classes for each part by name, `col` for every column. */
    classes?: { col?: JSX.ClassValue };
    /** Inline styles for each part by name, `col` for every column. */
    styles?: { col?: JSX.CSSProperties };
    /** The gap between columns and between rows: a key of the `spacing` scale, a number of pixels or any CSS length. */
    gap?: VariableProp<typeof gridVariables, "grid-gap">;
    /** The gap between rows, over `gap`: a key of the `spacing` scale, a number of pixels or any CSS length. */
    rowGap?: VariableProp<typeof gridVariables, "grid-row-gap">;
    /** The gap between columns, over `gap`: a key of the `spacing` scale, a number of pixels or any CSS length. */
    columnGap?: VariableProp<typeof gridVariables, "grid-column-gap">;
    /** Lets the columns of a row that is not full grow to fill it. */
    grow?: boolean;
    /** How columns spread along a row, as CSS `justify-content`. */
    justify?: VariableProp<
      typeof gridVariables,
      "grid-justify",
      JSX.CSSProperties["justify-content"]
    >;
    /** How columns line up across a row, as CSS `align-items`. */
    align?: VariableProp<typeof gridVariables, "grid-align", JSX.CSSProperties["align-items"]>;
    /** The number of columns a row holds, which `span` and `offset` count in. */
    columns?: number;
    /** What the grid does with columns that overflow it, as CSS `overflow`. */
    overflow?: VariableProp<typeof gridVariables, "grid-overflow", JSX.CSSProperties["overflow"]>;
  }
>;

export function Grid(props: GridProps) {
  const container = createQueryContainer(createUniqueId(), () => {
    if (props.type !== "container") return undefined;
    const widths = props.breakpoints;
    return breakpoints.map((name) => [name, widths?.[name] ?? containerWidthOf(name)]);
  });
  const { root, part } = createParts(gridVariables, styles, props, {
    variables: {
      "grid-align": "align",
      "grid-column-gap": "columnGap",
      "grid-gap": "gap",
      "grid-justify": "justify",
      "grid-overflow": "overflow",
      "grid-row-gap": "rowGap",
    },
    queries: container,
    keep: ["breakpoints", "children", "classes", "columns", "grow", "styles", "type"],
  });
  const context = {
    columns: () => props.columns ?? defaultColumns,
    grow: () => props.grow ?? false,
    container,
    col: { class: () => props.classes?.col, style: () => props.styles?.col },
  };
  const grid = (
    <div {...root}>
      <GridContext value={context}>
        <div {...part("inner")}>{props.children}</div>
      </GridContext>
    </div>
  );
  return (
    <Show when={container.queries()?.widths.length} fallback={grid}>
      <Show when={container.rules()}>{(rules) => <LibraryStyle of="grid" css={rules()} />}</Show>
      <div {...part("container")}>{grid}</div>
    </Show>
  );
}

Grid.Col = GridCol;
