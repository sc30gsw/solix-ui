import * as stylex from "@stylexjs/stylex";
import { createUniqueId, Show } from "solid-js";
import { createParts, type ElementProps } from "./parts";
import { variablesOf } from "./style-prop-table";
import {
  containerQueries,
  containerRules,
  containerWidthsOf,
  type ResponsiveProp,
  type Spacing,
  variables,
} from "./style-props";
import { tokens } from "./tokens.stylex";

const containerName = "simple-grid";

const styles = stylex.create({
  container: {
    containerName,
    containerType: "inline-size",
  },
  root: {
    "--sg-auto-rows": "auto",
    "--sg-cols": "1",
    "--sg-min-col-width": "initial",
    "--sg-spacing-x": tokens["--solix-spacing-md"],
    "--sg-spacing-y": "var(--sg-spacing-x)",
    display: "grid",
    gap: "var(--sg-spacing-y) var(--sg-spacing-x)",
    gridAutoRows: "var(--sg-auto-rows)",
    gridTemplateColumns: {
      default: "repeat(var(--sg-cols), minmax(0, 1fr))",
      '[data-auto-cols="auto-fill"]': "repeat(auto-fill, minmax(var(--sg-min-col-width), 1fr))",
      '[data-auto-cols="auto-fit"]': "repeat(auto-fit, minmax(var(--sg-min-col-width), 1fr))",
    },
  },
});

export type SimpleGridProps = ElementProps<
  "div",
  typeof styles,
  {
    cols?: ResponsiveProp<number>;
    spacing?: ResponsiveProp<Spacing>;
    verticalSpacing?: ResponsiveProp<Spacing>;
    type?: "media" | "container";
    minColWidth?: string | number;
    autoFlow?: "auto-fit" | "auto-fill";
    autoRows?: string;
  }
>;

export function SimpleGrid(props: SimpleGridProps) {
  const scope = createUniqueId();
  const autoColumns = () => props.minColWidth !== undefined;
  const queries = () => {
    if (props.type !== "container") return undefined;
    const keyed = [props.cols, props.spacing, props.verticalSpacing].flatMap(containerWidthsOf);
    return containerQueries(
      scope,
      [...new Set(keyed)].map((width) => [width, width]),
    );
  };
  const { root, part } = createParts(
    "SimpleGrid",
    styles,
    props,
    () =>
      variables(
        {
          "sg-auto-rows": props.autoRows,
          "sg-cols": autoColumns() ? undefined : props.cols,
          "sg-min-col-width": props.minColWidth,
          "sg-spacing-x": props.spacing,
          "sg-spacing-y": props.verticalSpacing,
        },
        queries(),
      ),
    "autoFlow",
    "autoRows",
    "cols",
    "minColWidth",
    "spacing",
    "type",
    "verticalSpacing",
  );
  const grid = (
    <div data-auto-cols={autoColumns() ? (props.autoFlow ?? "auto-fill") : undefined} {...root} />
  );
  return (
    <Show when={queries()} fallback={grid}>
      {(queried) => (
        <div {...part("container")}>
          <style>{containerRules(queried(), containerName, variablesOf("SimpleGrid"))}</style>
          {grid}
        </div>
      )}
    </Show>
  );
}
