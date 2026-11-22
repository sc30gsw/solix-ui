import * as stylex from "@stylexjs/stylex";
import { createUniqueId, Show } from "solid-js";
import { LibraryStyle } from "#/src/library-style.tsx";
import { createParts, defaultsOf, type ElementProps, withDefaults } from "#/src/parts.ts";
import { simpleGridVariables } from "#/src/SimpleGrid.variables.ts";
import {
  containerKeysOf,
  createQueryContainer,
  type GridType,
  type GridTypeProps,
  type GridTypeVariableProp,
  type VariableProp,
} from "#/src/style-props.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const styles = stylex.create({
  container: {
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

type SimpleGridColumnProps<Type extends GridType> = {
  /** Ignored when `minColWidth` is given. */
  cols?: GridTypeVariableProp<Type, typeof simpleGridVariables, "sg-cols", number>;
  /** The gap between columns, and between rows unless `verticalSpacing` is given. */
  spacing?: GridTypeVariableProp<Type, typeof simpleGridVariables, "sg-spacing-x">;
  verticalSpacing?: GridTypeVariableProp<Type, typeof simpleGridVariables, "sg-spacing-y">;
};

export type SimpleGridProps = ElementProps<
  "div",
  typeof styles,
  GridTypeProps<SimpleGridColumnProps<"media">, SimpleGridColumnProps<"container">> & {
    /** When given, the grid fits as many columns as its width allows, by `autoFlow`. */
    minColWidth?: VariableProp<typeof simpleGridVariables, "sg-min-col-width">;
    /** It takes effect only with `minColWidth`. */
    autoFlow?: "auto-fit" | "auto-fill";
    autoRows?: VariableProp<typeof simpleGridVariables, "sg-auto-rows">;
  }
>;

const defaults = defaultsOf<SimpleGridProps>()({ autoFlow: "auto-fill" });

export function SimpleGrid(rawProps: SimpleGridProps) {
  const props = withDefaults(defaults, rawProps);
  const hasMinColWidth = ({ minColWidth }: SimpleGridProps) =>
    minColWidth !== undefined && minColWidth !== null;
  const container = createQueryContainer(createUniqueId(), () => {
    if (props.type !== "container") return undefined;
    const keyed = new Map([
      ...containerKeysOf(props.cols),
      ...containerKeysOf(props.spacing),
      ...containerKeysOf(props.verticalSpacing),
    ]);
    return [...keyed.entries()];
  });
  const autoColumns = () => hasMinColWidth(props);
  const { root, part } = createParts(simpleGridVariables, styles, props, {
    variables: {
      "sg-auto-rows": "autoRows",
      "sg-cols": (given) => (hasMinColWidth(given) ? undefined : given.cols),
      "sg-min-col-width": "minColWidth",
      "sg-spacing-x": "spacing",
      "sg-spacing-y": "verticalSpacing",
    },
    queries: container,
    keep: ["autoFlow", "cols", "type"],
  });
  const grid = <div data-auto-cols={autoColumns() ? props.autoFlow : undefined} {...root} />;
  return (
    <Show when={container.queries()} fallback={grid}>
      <Show when={container.rules()}>
        {(rules) => <LibraryStyle of="simple-grid" css={rules()} />}
      </Show>
      <div {...part("container")}>{grid}</div>
    </Show>
  );
}
