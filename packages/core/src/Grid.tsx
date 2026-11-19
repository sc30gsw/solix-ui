import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { createUniqueId, Show } from "solid-js";
import { GridCol } from "#/src/GridCol.tsx";
import { GridContext } from "#/src/grid-context.ts";
import { LibraryStyle } from "#/src/library-style.tsx";
import { createParts, type ElementProps } from "#/src/parts.ts";
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
    | { type?: "media"; breakpoints?: never }
    | { type: "container"; breakpoints?: Record<Breakpoint, ContainerWidth> }
  ) & {
    classes?: { col?: JSX.ClassValue };
    styles?: { col?: JSX.CSSProperties };
    gap?: VariableProp<"grid-gap">;
    rowGap?: VariableProp<"grid-row-gap">;
    columnGap?: VariableProp<"grid-column-gap">;
    grow?: boolean;
    justify?: VariableProp<"grid-justify", JSX.CSSProperties["justify-content"]>;
    align?: VariableProp<"grid-align", JSX.CSSProperties["align-items"]>;
    columns?: number;
    overflow?: VariableProp<"grid-overflow", JSX.CSSProperties["overflow"]>;
  }
>;

export function Grid(props: GridProps) {
  const container = createQueryContainer(createUniqueId(), () => {
    if (props.type !== "container") return undefined;
    const widths = props.breakpoints;
    return breakpoints.map((name) => [name, widths?.[name] ?? containerWidthOf(name)]);
  });
  const { root, part } = createParts("Grid", styles, props, {
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
