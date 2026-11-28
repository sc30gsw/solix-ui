import {
  edgesFrom,
  type GraphEdge,
  type GraphState,
  type StateGraph,
} from "#/scripts/formal/state-graph.ts";
import { keyOf, type Vars } from "#/scripts/formal/tla-value.ts";

type ObservedStep<State> = { to: State; internal: number };

export type StepTable<State> = {
  start: State;
  states: Map<string, State>;
  steps: Map<string, Map<string, ObservedStep<State>>>;
};

type Settled = { id: string; crossed: number };

function settlerOf(
  graph: StateGraph,
  out: ReadonlyMap<string, readonly GraphEdge[]>,
  internal: readonly string[],
) {
  const settled = (id: string, crossed = 0, seen: readonly string[] = []): Settled => {
    const onward = (out.get(id) ?? []).filter(({ action }) => internal.includes(action));
    if (onward.length === 0) return { id, crossed };
    if (onward.length > 1 || seen.includes(id)) {
      throw new Error(
        `the model's internal steps from ${keyOf(graph.states.get(id)?.vars)} do not settle on one state.`,
      );
    }
    return settled(onward[0].to, crossed + 1, [...seen, id]);
  };
  return settled;
}

function record<State>(
  table: Map<string, ObservedStep<State>>,
  label: string,
  from: State,
  step: ObservedStep<State>,
): void {
  const known = table.get(label);
  if (
    known !== undefined &&
    (keyOf(known.to) !== keyOf(step.to) || known.internal !== step.internal)
  ) {
    throw new Error(
      `the model takes ${label} from ${keyOf(from)} to both ${keyOf(known.to)} and ${keyOf(step.to)}, so a page cannot be compared with it.`,
    );
  }
  table.set(label, step);
}

export function stepTable<State>(
  graph: StateGraph,
  start: GraphState,
  observe: (vars: Vars) => State,
  internal: readonly string[] = [],
): StepTable<State> {
  const out = edgesFrom(graph);
  const settled = settlerOf(graph, out, internal);
  const states = new Map<string, State>();
  const steps = new Map<string, Map<string, ObservedStep<State>>>();
  const first = settled(start.id).id;
  const queue = [first];
  const visited = new Set(queue);
  for (const id of queue) {
    const state = graph.states.get(id);
    if (state === undefined) continue;
    const from = observe(state.vars);
    states.set(keyOf(from), from);
    const table = steps.get(keyOf(from)) ?? new Map<string, ObservedStep<State>>();
    steps.set(keyOf(from), table);
    for (const edge of (out.get(id) ?? []).filter(({ action }) => !internal.includes(action))) {
      const target = settled(edge.to);
      const reached = graph.states.get(target.id);
      if (reached === undefined) continue;
      record(table, edge.label, from, { to: observe(reached.vars), internal: target.crossed });
      if (!visited.has(target.id)) {
        visited.add(target.id);
        queue.push(target.id);
      }
    }
  }
  const startState = graph.states.get(first);
  if (startState === undefined) throw new Error("the model's start is not in its graph.");
  return { start: observe(startState.vars), states, steps };
}

export function pathBetween<State>(
  table: StepTable<State>,
  from: State,
  to: State,
): string[] | undefined {
  const goal = keyOf(to);
  const paths = new Map<string, string[]>([[keyOf(from), []]]);
  const queue = [keyOf(from)];
  for (const key of queue) {
    const path = paths.get(key) ?? [];
    if (key === goal) return path;
    for (const [label, step] of table.steps.get(key) ?? []) {
      const next = keyOf(step.to);
      if (!paths.has(next)) {
        paths.set(next, [...path, label]);
        queue.push(next);
      }
    }
  }
  return undefined;
}
