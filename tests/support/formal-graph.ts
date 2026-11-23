import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";

export type TlaValue = number | string | boolean | null | undefined | TlaValue[] | TlaRecord;
export type TlaRecord = { [field: string]: TlaValue };
export type Vars = Record<string, TlaValue>;

export type GraphState = { id: string; vars: Vars; initial: boolean };
export type GraphEdge = {
  from: string;
  to: string;
  label: string;
  action: string;
  parameters: TlaValue[];
};
export type StateGraph = { states: Map<string, GraphState>; edges: GraphEdge[] };

export type ModelRun = {
  model: string;
  status: number | null;
  output: string;
  graph: StateGraph | undefined;
  spec: string;
  config: string;
  milliseconds: number;
};

const cli = join(repositoryRoot, "node_modules", "tla-ts", "dist", "cli.js");
const scratchRoot = join(repositoryRoot, "node_modules", ".cache", "solix-formal");
const nodeLine = /^(-?\d+) \[label="((?:[^"\\]|\\.)*)"(,style = filled)?/;
const edgeLine = /^(-?\d+) -> (-?\d+) \[label="((?:[^"\\]|\\.)*)"/;
const variableStart = "/\\ ";

class ValueReader {
  readonly text: string;
  at = 0;

  constructor(text: string) {
    this.text = text;
  }

  fail(what: string): never {
    throw new Error(
      `cannot read the TLA+ value ${JSON.stringify(this.text)}: ${what} at ${this.at}.`,
    );
  }

  space(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at])) this.at += 1;
  }

  takes(token: string): boolean {
    this.space();
    if (!this.text.startsWith(token, this.at)) return false;
    this.at += token.length;
    return true;
  }

  expect(token: string): void {
    if (!this.takes(token)) this.fail(`${token} expected`);
  }

  listUntil(end: string): TlaValue[] {
    const values: TlaValue[] = [];
    if (this.takes(end)) return values;
    do values.push(this.value());
    while (this.takes(","));
    this.expect(end);
    return values;
  }

  record(): TlaRecord {
    const fields: TlaRecord = {};
    do {
      this.space();
      const name = /^\w+/.exec(this.text.slice(this.at))?.[0];
      if (name === undefined) this.fail("a field name expected");
      this.at += name.length;
      this.expect("|->");
      fields[name] = this.value();
    } while (this.takes(","));
    this.expect("]");
    return fields;
  }

  string(): string {
    let read = "";
    while (this.at < this.text.length && this.text[this.at] !== '"') {
      if (this.text[this.at] === "\\") {
        const escaped = this.text[this.at + 1];
        read += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        this.at += 2;
      } else {
        read += this.text[this.at];
        this.at += 1;
      }
    }
    this.expect('"');
    return read;
  }

  value(): TlaValue {
    if (this.takes("<<")) return this.listUntil(">>");
    if (this.takes("{")) return this.listUntil("}");
    if (this.takes("[")) return this.record();
    if (this.takes('"')) return this.string();
    this.space();
    const word = /^-?\d+|^\w+/.exec(this.text.slice(this.at))?.[0];
    if (word === undefined) this.fail("a value expected");
    this.at += word.length;
    if (/^-?\d+$/.test(word)) return Number(word);
    if (word === "TRUE") return true;
    if (word === "FALSE") return false;
    if (word === "Null") return null;
    if (word === "Undefined") return undefined;
    return word;
  }

  whole(): TlaValue {
    const value = this.value();
    this.space();
    if (this.at < this.text.length) this.fail("the end expected");
    return value;
  }
}

export function parseValue(text: string): TlaValue {
  return new ValueReader(text).whole();
}

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
  if (parameters.length === 0) return action;
  return `${action}(${parameters.map(formatValue).join(", ")})`;
}

export function formatValue(value: TlaValue): string {
  if (value === null) return "Null";
  if (value === undefined) return "Undefined";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `{${value.map(formatValue).join(", ")}}`;
  return `[${Object.entries(value)
    .map(([name, field]) => `${name} |-> ${formatValue(field)}`)
    .join(", ")}]`;
}

export function textOf(value: TlaValue): string {
  return typeof value === "string" ? value : formatValue(value);
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

export type RunOptions = { dump?: boolean; without?: readonly string[]; source?: string };

export type TraceStep = { action: string; vars: Vars };

export type RuleBreak = { rule: string; kind: string; trace: TraceStep[] };

const ruleLines = /^(INVARIANTS?|PROPERTY|PROPERTIES)\b(.*)$/;

export function rulesOf(config: string): string[] {
  return config
    .split("\n")
    .flatMap((line) => ruleLines.exec(line)?.[2]?.trim().split(/\s+/) ?? [])
    .filter((rule) => rule !== "");
}

function configWithout(config: string, rules: readonly string[]): string {
  return config
    .split("\n")
    .flatMap((line) => {
      const [, keyword, names] = ruleLines.exec(line) ?? [];
      if (keyword === undefined || names === undefined) return [line];
      const kept = names
        .trim()
        .split(/\s+/)
        .filter((rule) => rule !== "" && !rules.includes(rule));
      return kept.length === 0 ? [] : [`${keyword} ${kept.join(" ")}`];
    })
    .join("\n");
}

const brokenRule =
  /^Error: (Invariant|Action property|Temporal property) (\w+) (?:is|was) violated\.$/m;
const traceState = /^State (\d+): (.*)$/;

export function brokenRuleOf(output: string): RuleBreak | undefined {
  const lines = output.split("\n");
  const named = brokenRule.exec(output);
  const deadlock = output.includes("Error: Deadlock reached.");
  const assumption = /^Error: Assumption .* is false\.$/m.exec(output);
  if (named === null && !deadlock && assumption === null) return undefined;
  if (assumption !== null) return { rule: assumption[0], kind: "assumption", trace: [] };
  const trace: TraceStep[] = [];
  for (const [at, line] of lines.entries()) {
    const state = traceState.exec(line);
    if (state === null) continue;
    const [, , what] = state;
    const body: string[] = [];
    for (
      let next = at + 1;
      what.startsWith("<") && next < lines.length && lines[next].trim() !== "";
      next += 1
    )
      body.push(lines[next]);
    const action = /^<(.*?)(?: line \d+, col \d+ .*)?>$/.exec(what)?.[1] ?? what;
    trace.push({
      action: action === "Initial predicate" ? "" : action,
      vars: body.length === 0 ? {} : parseVars(body.join("\n")),
    });
  }
  return named === null
    ? { rule: "deadlock", kind: "deadlock", trace }
    : { rule: named[2], kind: named[1].toLowerCase(), trace };
}

function tlaTs(scratch: string, args: readonly string[]) {
  return spawnSync(process.execPath, [cli, "-noGenerateSpecTE", ...args], {
    cwd: scratch,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

export function runSource(name: string, source: string, options: RunOptions = {}): ModelRun {
  mkdirSync(scratchRoot, { recursive: true });
  const scratch = mkdtempSync(join(scratchRoot, "run-"));
  try {
    const copy = join(scratch, basename(name));
    const dot = join(scratch, "graph.dot");
    const dump = options.dump === true ? ["-dump", "dot,actionlabels", dot] : [];
    const without = options.without ?? [];
    writeFileSync(copy, source);
    const started = performance.now();
    let run = tlaTs(scratch, without.length === 0 ? [...dump, copy] : [copy]);
    const tla = readdirSync(scratch).find((file) => file.endsWith(".tla"));
    const generated = tla === undefined ? undefined : join(scratch, tla);
    const configFile = generated?.replace(/\.tla$/, ".cfg");
    const config =
      configFile !== undefined && existsSync(configFile) ? readFileSync(configFile, "utf8") : "";
    if (without.length > 0 && generated !== undefined && configFile !== undefined) {
      const narrowed = join(scratch, "without.cfg");
      writeFileSync(narrowed, configWithout(config, without));
      run = tlaTs(scratch, ["-config", narrowed, ...dump, generated]);
    }
    const milliseconds = Math.round(performance.now() - started);
    const output = `${run.stdout}${run.stderr}`.replaceAll(scratch, "<scratch>");
    const graph =
      options.dump === true && run.status === 0 && existsSync(dot)
        ? parseStateGraph(readFileSync(dot, "utf8"))
        : undefined;
    const spec = generated === undefined ? "" : readFileSync(generated, "utf8");
    return { model: name, status: run.status, output, graph, spec, config, milliseconds };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function runModel(model: string, options: RunOptions = {}): ModelRun {
  return runSource(
    model,
    options.source ?? readFileSync(join(repositoryRoot, model), "utf8"),
    options,
  );
}

export function checkedGraph(model: string): StateGraph {
  const run = runModel(model, { dump: true });
  if (run.status !== 0 || run.graph === undefined) {
    throw new Error(
      `tla-ts did not pass ${model}, so it has no state graph to replay:\n${run.output}`,
    );
  }
  return run.graph;
}

export type ObservedStep<State> = { label: string; edge: GraphEdge; to: State };

export type StepTable<State> = {
  start: string;
  states: Map<string, State>;
  steps: Map<string, Map<string, ObservedStep<State>>>;
};

export function keyOf(value: unknown): string {
  return JSON.stringify(value);
}

export function initialStateWhere(graph: StateGraph, holds: (vars: Vars) => boolean): GraphState {
  const found = [...graph.states.values()].filter(({ initial, vars }) => initial && holds(vars));
  if (found.length !== 1) {
    throw new Error(`the model has ${found.length} initial states that match the setup, not one.`);
  }
  return found[0];
}

export function stepTable<State>(
  graph: StateGraph,
  start: GraphState,
  observe: (vars: Vars) => State,
  internal: readonly string[] = [],
): StepTable<State> {
  const out = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
  const settled = (id: string, seen: readonly string[] = []): string => {
    const onward = (out.get(id) ?? []).filter(({ action }) => internal.includes(action));
    if (onward.length === 0) return id;
    if (onward.length > 1 || seen.includes(id)) {
      throw new Error(
        `the model's internal steps from ${keyOf(graph.states.get(id)?.vars)} do not settle on one state.`,
      );
    }
    return settled(onward[0].to, [...seen, id]);
  };
  const startKey = keyOf(observe(start.vars));
  const states = new Map<string, State>([[startKey, observe(start.vars)]]);
  const steps = new Map<string, Map<string, ObservedStep<State>>>();
  const queue = [settled(start.id)];
  const visited = new Set(queue);
  for (const id of queue) {
    const state = graph.states.get(id);
    if (state === undefined) continue;
    const from = keyOf(observe(state.vars));
    states.set(from, observe(state.vars));
    const table = steps.get(from) ?? new Map<string, ObservedStep<State>>();
    steps.set(from, table);
    for (const edge of (out.get(id) ?? []).filter(({ action }) => !internal.includes(action))) {
      const target = settled(edge.to);
      const reached = graph.states.get(target);
      if (reached === undefined) continue;
      const to = observe(reached.vars);
      const known = table.get(edge.label);
      if (known !== undefined && keyOf(known.to) !== keyOf(to)) {
        throw new Error(
          `the model takes ${edge.label} from ${from} to both ${keyOf(known.to)} and ${keyOf(to)}, so a page cannot be compared with it.`,
        );
      }
      table.set(edge.label, { label: edge.label, edge, to });
      if (!visited.has(target)) {
        visited.add(target);
        queue.push(target);
      }
    }
  }
  return { start: startKey, states, steps };
}

export function afterStep<State>(table: StepTable<State>, from: State, label: string): State {
  return table.steps.get(keyOf(from))?.get(label)?.to ?? from;
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

export function reachableStates<State>(table: StepTable<State>): State[] {
  return [...table.states.values()];
}
