import { createContext, useContext } from "solid-js";
import type { ContainerQueries } from "./style-props";

export type GridContextValue = {
  columns: () => number;
  grow: () => boolean;
  queries: () => ContainerQueries | undefined;
};

export const GridContext = createContext<GridContextValue | null>(null);

export function useGrid(): GridContextValue {
  const grid = useContext(GridContext);
  if (grid === null) throw new Error("GridCol must be rendered inside Grid.");
  return grid;
}
