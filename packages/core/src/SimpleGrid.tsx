import * as stylex from "@stylexjs/stylex";
import { createUniqueId, Show } from "solid-js";
import { createParts, type ElementProps } from "#/src/parts.ts";
import {
  type ContainerVariableProp,
  containerKeysOf,
  createQueryContainer,
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

export type SimpleGridProps = ElementProps<
  "div",
  typeof styles,
  (
    | {
        type?: "media";
        cols?: VariableProp<"sg-cols", number>;
        spacing?: VariableProp<"sg-spacing-x">;
        verticalSpacing?: VariableProp<"sg-spacing-y">;
      }
    | {
        type: "container";
        cols?: ContainerVariableProp<"sg-cols", number>;
        spacing?: ContainerVariableProp<"sg-spacing-x">;
        verticalSpacing?: ContainerVariableProp<"sg-spacing-y">;
      }
  ) & {
    minColWidth?: VariableProp<"sg-min-col-width">;
    autoFlow?: "auto-fit" | "auto-fill";
    autoRows?: VariableProp<"sg-auto-rows">;
  }
>;

export function SimpleGrid(props: SimpleGridProps) {
  const container = createQueryContainer(createUniqueId(), () => {
    if (props.type !== "container") return undefined;
    const keyed = new Map([
      ...containerKeysOf(props.cols),
      ...containerKeysOf(props.spacing),
      ...containerKeysOf(props.verticalSpacing),
    ]);
    return [...keyed.entries()];
  });
  const autoColumns = () => props.minColWidth !== undefined;
  const { root, part } = createParts(
    "SimpleGrid",
    styles,
    props,
    {
      variables: {
        "sg-auto-rows": "autoRows",
        "sg-cols": (given) => (given.minColWidth === undefined ? given.cols : undefined),
        "sg-min-col-width": "minColWidth",
        "sg-spacing-x": "spacing",
        "sg-spacing-y": "verticalSpacing",
      },
      queries: container,
    },
    "autoFlow",
    "cols",
    "type",
  );
  const grid = (
    <div data-auto-cols={autoColumns() ? (props.autoFlow ?? "auto-fill") : undefined} {...root} />
  );
  return (
    <Show when={container.queries()} fallback={grid}>
      <Show when={container.rules()}>{(rules) => <style data-solix-rules>{rules()}</style>}</Show>
      <div {...part("container")}>{grid}</div>
    </Show>
  );
}
