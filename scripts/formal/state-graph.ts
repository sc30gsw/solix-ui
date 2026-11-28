import {
  parseValue,
  tlaText,
  type TlaValue,
  ValueReader,
  type Vars,
} from "#/scripts/formal/tla-value.ts";

export type GraphState = { id: string; vars: Vars; initial: boolean };
export type GraphEdge = {
  from: string;
  to: string;
  label: string;
  action: string;
  parameters: TlaValue[];
};
export type StateGraph = { states: Map<string, GraphState>; edges: GraphEdge[] };

const nodeLine = /^(-?\d+) \[label="((?:[^"\\]|\\.)*)"(,style = filled)?/;
const edgeLine = /^(-?\d+) -> (-?\d+) \[label="((?:[^"\\]|\\.)*)"/;
const variableStart = "/\\ ";

function unescapeDot(text: string): string {
  return text.replace(/\\(.)/g, (_, escaped: string) => (escaped === "n" ? "\n" : escaped));
}

export function parseVars(text: string): Vars {
  const vars: Vars = {};
  const parts = (text.startsWith(variableStart) ? text.slice(variableStart.length) : text).split(
    `\n${variableStart}`,
  );
  for (const part of parts) {
    const [, name, value] = /^(\w+) = ([\s\S]*)$/.exec(part) ?? [];
    if (name === undefined || value === undefined) {
      throw new Error(`cannot read the TLA+ state line ${JSON.stringify(part)}.`);
    }
    vars[name] = parseValue(value);
  }
  return vars;
}

export function parseAction(label: string): { action: string; parameters: TlaValue[] } {
  const open = label.indexOf("(");
  if (open === -1) return { action: label, parameters: [] };
  const reader = new ValueReader(label.slice(open + 1));
  const parameters = reader.listUntil(")");
  reader.space();
  if (reader.at < reader.text.length) reader.fail("the end of the action expected");
  return { action: label.slice(0, open), parameters };
}

export function actionLabel(action: string, parameters: readonly TlaValue[] = []): string {
  return parameters.length === 0 ? action : `${action}(${parameters.map(tlaText).join(", ")})`;
}

export function parseStateGraph(dot: string): StateGraph {
  const states = new Map<string, GraphState>();
  const edges = new Map<string, GraphEdge>();
  for (const line of dot.split("\n")) {
    const edge = edgeLine.exec(line);
    if (edge !== null) {
      const [, from, to, escaped] = edge;
      const label = unescapeDot(escaped);
      edges.set(`${from} ${to} ${label}`, { from, to, label, ...parseAction(label) });
      continue;
    }
    const node = nodeLine.exec(line);
    if (node !== null) {
      const [, id, label, filled] = node;
      const known = states.get(id);
      states.set(id, {
        id,
        vars: known?.vars ?? parseVars(unescapeDot(label)),
        initial: known?.initial === true || filled !== undefined,
      });
    }
  }
  for (const { from, to, label } of edges.values()) {
    if (!states.has(from) || !states.has(to)) {
      throw new Error(`the state graph has a step ${label} to or from a state it does not list.`);
    }
  }
  return { states, edges: [...edges.values()] };
}

export function edgesFrom(graph: StateGraph): Map<string, GraphEdge[]> {
  const out = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
  return out;
}

export function initialStateWhere(
  graph: StateGraph,
  model: string,
  holds: (vars: Vars) => boolean,
): GraphState {
  const found = [...graph.states.values()].filter(({ initial, vars }) => initial && holds(vars));
  if (found.length !== 1) {
    throw new Error(`${model} has ${found.length} initial states that match the setup, not one.`);
  }
  return found[0];
}
