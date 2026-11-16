import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { createUniqueId, Show } from "solid-js";
import { GridCol } from "./GridCol";
import { GridContext } from "./grid-context";
import { createParts, type ElementProps } from "./parts";
import { type Breakpoint, breakpoints, variablesOf } from "./style-prop-table";
import {
  containerQueries,
  containerRules,
  type Spacing,
  type StyleProp,
  variables,
} from "./style-props";
import { tokens } from "./tokens.stylex";

const containerName = "solix-grid";
const defaultColumns = 12;

const styles = stylex.create({
  container: {
    containerName,
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
  {
    gap?: StyleProp<Spacing>;
    rowGap?: StyleProp<Spacing>;
    columnGap?: StyleProp<Spacing>;
    grow?: boolean;
    justify?: JSX.CSSProperties["justify-content"];
    align?: JSX.CSSProperties["align-items"];
    columns?: number;
    overflow?: JSX.CSSProperties["overflow"];
    type?: "media" | "container";
    breakpoints?: Record<Breakpoint, string>;
  }
>;

export function Grid(props: GridProps) {
  const scope = createUniqueId();
  const queries = () => {
    if (props.type !== "container") return undefined;
    const widths = props.breakpoints;
    return containerQueries(
      scope,
      widths === undefined ? [] : breakpoints.map((name) => [name, widths[name]]),
    );
  };
  const queried = () => (props.breakpoints === undefined ? undefined : queries());
  const { root, part } = createParts(
    "Grid",
    styles,
    props,
    () =>
      variables(
        {
          "grid-align": props.align,
          "grid-column-gap": props.columnGap,
          "grid-gap": props.gap,
          "grid-justify": props.justify,
          "grid-overflow": props.overflow,
          "grid-row-gap": props.rowGap,
        },
        queries(),
      ),
    "align",
    "breakpoints",
    "children",
    "columnGap",
    "columns",
    "gap",
    "grow",
    "justify",
    "overflow",
    "rowGap",
    "type",
  );
  const context = {
    columns: () => props.columns ?? defaultColumns,
    grow: () => props.grow ?? false,
    queries,
  };
  const grid = (
    <div {...root}>
      <GridContext value={context}>
        <div {...part("inner")}>{props.children}</div>
      </GridContext>
    </div>
  );
  return (
    <Show when={queried()} fallback={grid}>
      {(container) => (
        <div {...part("container")}>
          <style>{containerRules(container(), containerName, variablesOf("Grid"))}</style>
          {grid}
        </div>
      )}
    </Show>
  );
}

Grid.Col = GridCol;
