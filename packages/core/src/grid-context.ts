import { createContext, useContext } from "solid-js";
import type { CarriedStyling } from "#/src/parts.ts";
import type { QueryContainer } from "#/src/query-container.ts";

export type GridContextValue = {
  columns: () => number;
  grow: () => boolean;
  container: QueryContainer;
  col: CarriedStyling;
};

export const GridContext = createContext<GridContextValue | null>(null);

export function useGrid(): GridContextValue {
  const grid = useContext(GridContext);
  if (grid === null) throw new Error("GridCol must be rendered inside Grid.");
  return grid;
}
