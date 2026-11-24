import { parseConfig } from "tla-ts";
import {
  checkCompiled,
  compileModel,
  type ModelRun,
  type RunOptions,
} from "#/scripts/formal/run.ts";
import {
  actionLabel,
  type GraphEdge,
  parseAction,
  type StateGraph,
} from "#/scripts/formal/state-graph.ts";
import { tlaText, type TlaValue, type Vars } from "#/scripts/formal/tla-value.ts";
import type { RuleBreak } from "#/scripts/formal/trace.ts";

export type ChartView = {
  title?: string;
  keep?: (vars: Vars) => boolean;
  state?: (vars: Vars) => string;
  step?: (action: string, parameters: TlaValue[], from: Vars, to: Vars) => string | null;
};

export const chartViewKeys = [
  "title",
  "keep",
  "state",
  "step",
] as const satisfies readonly (keyof ChartView)[];

export function viewOf(loaded: Readonly<Record<string, unknown>>, where: string): ChartView {
  const named: readonly string[] = chartViewKeys;
  const unknown = Object.keys(loaded).filter((key) => !named.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `${where} exports ${unknown.join(", ")}, which a chart view does not take. A view exports only ${chartViewKeys.join(", ")}.`,
    );
  }
  const { title, keep, state, step } = loaded;
  const wrong = [
    ...(title === undefined || typeof title === "string" ? [] : ["title, which is not a string"]),
    ...Object.entries({ keep, state, step }).flatMap(([key, value]) =>
      value === undefined || typeof value === "function" ? [] : [`${key}, which is not a function`],
    ),
  ];
  if (wrong.length > 0) throw new Error(`${where} exports ${wrong.join(" and ")}.`);
  return loaded as ChartView;
}

export type Statechart = {
  chart: string;
  report: string;
  broken: RuleBreak[];
};

export const defaultStateCap = 30;

const breaksClass = "classDef breaks fill:#fde8e8,stroke:#c81e1e,stroke-width:2.5px,color:#9b1c1c";
const pathClass = "classDef bugPath stroke:#c81e1e,stroke-dasharray:4 3";

function plainState(vars: Vars): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name} = ${tlaText(value)}`)
    .join(", ");
}

function inChart(text: string): string {
  return text.replaceAll(/[:;#]/g, " ").replaceAll(/\s+/g, " ").trim();
}

function labelsOf(view: ChartView) {
  const state = view.state ?? plainState;
  const step = (label: string, from: Vars, to: Vars) => {
    const { action, parameters } = parseAction(label);
    return view.step === undefined
      ? actionLabel(action, parameters)
      : view.step(action, parameters, from, to);
  };
  return { state, step };
}

export function chartOf(
  graph: StateGraph,
  view: ChartView,
  broken: readonly RuleBreak[],
  cap: number = defaultStateCap,
): { chart: string; states: number; arrows: number; hidden: string[] } {
  const { state, step } = labelsOf(view);
  const keep = view.keep ?? (() => true);
  const out = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
  const starts = [...graph.states.values()].filter(({ initial, vars }) => initial && keep(vars));
  const reached = new Set(starts.map(({ id }) => id));
  const queue = [...reached];
  for (const id of queue) {
    for (const { to } of out.get(id) ?? []) {
      const target = graph.states.get(to);
      if (target !== undefined && keep(target.vars) && !reached.has(to)) {
        reached.add(to);
        queue.push(to);
      }
    }
  }
  const labelOf = new Map<string, string>();
  for (const id of reached) {
    const vars = graph.states.get(id)?.vars;
    if (vars !== undefined) labelOf.set(id, inChart(state(vars)));
  }
  const labels = [...new Set(labelOf.values())];
  if (labels.length > cap) {
    throw new Error(
      `The chart would draw ${labels.length} states, more than its cap of ${cap}. Give a view whose state() merges states that act the same or whose keep() draws fewer, or raise --max-states.`,
    );
  }
  const name = (label: string | undefined) => {
    const index = labels.indexOf(label ?? "");
    return index === -1 ? undefined : `s${index}`;
  };
  const arrows = new Map<string, Set<string>>();
  const hidden = new Set<string>();
  for (const edge of graph.edges) {
    if (!reached.has(edge.from) || !reached.has(edge.to)) continue;
    const from = labelOf.get(edge.from);
    const to = labelOf.get(edge.to);
    if (from === to) continue;
    const text = step(
      edge.label,
      graph.states.get(edge.from)?.vars ?? {},
      graph.states.get(edge.to)?.vars ?? {},
    );
    if (text === null) {
      hidden.add(edge.action);
      continue;
    }
    const key = `${name(from)} --> ${name(to)}`;
    arrows.set(key, (arrows.get(key) ?? new Set()).add(inChart(text)));
  }
  const marked = (classOf: (trace: RuleBreak["trace"]) => Vars[]) =>
    new Set(
      broken.flatMap(({ trace }) =>
        classOf(trace)
          .filter((vars) => keep(vars))
          .flatMap((vars) => name(inChart(state(vars))) ?? []),
      ),
    );
  const breaking = marked((trace) => trace.slice(-1).map(({ vars }) => vars));
  const onAPath = marked((trace) => trace.slice(0, -1).map(({ vars }) => vars));
  const lines = [
    ...(view.title === undefined ? [] : ["---", `title: ${inChart(view.title)}`, "---"]),
    "stateDiagram-v2",
    "  direction LR",
    ...labels.map((label, index) => `  s${index}: ${label}`),
    ...[...new Set(starts.flatMap(({ id }) => name(labelOf.get(id)) ?? []))].map(
      (start) => `  [*] --> ${start}`,
    ),
    ...[...arrows].map(([key, texts]) => `  ${key}: ${[...texts].sort().join(" or ")}`),
    ...(breaking.size === 0
      ? []
      : [`  ${breaksClass}`, ...[...breaking].map((each) => `  class ${each} breaks`)]),
    ...(onAPath.size === 0
      ? []
      : [
          `  ${pathClass}`,
          ...[...onAPath]
            .filter((each) => !breaking.has(each))
            .map((each) => `  class ${each} bugPath`),
        ]),
  ];
  return {
    chart: `${lines.join("\n")}\n`,
    states: labels.length,
    arrows: arrows.size,
    hidden: [...hidden].sort(),
  };
}

function pathReport(broken: RuleBreak, view: ChartView): string[] {
  const { state, step } = labelsOf(view);
  const steps = broken.trace.length - 1;
  return [
    `## ${broken.rule} breaks`,
    "",
    broken.kind === "assumption"
      ? "It is an assumption, which tla-ts checks before the search, so it breaks in no state."
      : `The ${broken.kind} breaks on ${broken.kind === "temporal property" ? "this behaviour" : "the shortest path"}, of ${steps} step${steps === 1 ? "" : "s"}:`,
    "",
    ...broken.trace.map(({ action, vars }, index) => {
      const before = broken.trace[index - 1]?.vars ?? {};
      const said = action === "" ? undefined : (step(action, before, vars) ?? action);
      return `${index}. ${said === undefined ? "" : `${said}: `}${inChart(state(vars))}`;
    }),
    ...(broken.kind !== "temporal property"
      ? []
      : [
          broken.loopsBackTo === undefined || broken.loopsBackTo >= broken.trace.length - 1
            ? `${broken.trace.length}. nothing more happens, ever`
            : `${broken.trace.length}. back to ${broken.loopsBackTo}, and round again for ever`,
        ]),
    "",
  ];
}

export function withBroken(
  model: string,
  broken: readonly RuleBreak[],
  found: RuleBreak,
): RuleBreak[] {
  if (broken.some(({ rule }) => rule === found.rule)) {
    throw new Error(
      `${model}: tla-ts reports ${found.rule} broken again after it was left out of the check, so the rules cannot be told apart.`,
    );
  }
  return [...broken, found];
}

export async function checkEveryRule(
  model: string,
  options: RunOptions = {},
): Promise<{ runs: ModelRun[]; broken: RuleBreak[]; rules: string[] }> {
  const compiled = compileModel(model, options.source);
  const config = parseConfig(compiled.config);
  const rules = [...config.invariants, ...config.properties];
  const runs: ModelRun[] = [];
  const broken: RuleBreak[] = [];
  for (;;) {
    const run = await checkCompiled(compiled, {
      dump: true,
      without: broken.map(({ rule }) => rule),
    });
    runs.push(run);
    const found = run.broken;
    if (found === undefined) {
      if (run.result.status !== "success") {
        throw new Error(
          `tla-ts could not check ${model}: ${run.result.status}${run.result.failure === undefined ? "" : `, ${run.result.failure.message}`}.`,
        );
      }
      return { runs, broken, rules };
    }
    broken.push(...withBroken(model, broken, found).slice(broken.length));
    if (found.kind === "assumption" || found.kind === "deadlock") return { runs, broken, rules };
  }
}

export async function statechartOf(
  model: string,
  view: ChartView = {},
  cap: number = defaultStateCap,
  options: RunOptions = {},
): Promise<Statechart> {
  const { runs, broken, rules } = await checkEveryRule(model, options);
  const last = runs.at(-1);
  const holding = rules.filter((rule) => !broken.some((each) => each.rule === rule));
  const graph = last?.graph;
  const drawn = graph === undefined ? undefined : chartOf(graph, view, broken, cap);
  const report = [
    `# ${view.title ?? model}`,
    "",
    graph === undefined
      ? "tla-ts stopped before it searched every state, so there is no chart."
      : `tla-ts reached ${graph.states.size} distinct states and ${graph.edges.length} steps in ${runs.map(({ milliseconds }) => milliseconds).reduce((sum, each) => sum + each, 0)} ms. The chart draws ${drawn?.states} states and ${drawn?.arrows} arrows.`,
    ...(drawn === undefined || drawn.hidden.length === 0
      ? []
      : [`The chart hides the steps ${drawn.hidden.join(", ")}.`]),
    "",
    ...broken.flatMap((each) => pathReport(each, view)),
    "## Rules that hold",
    "",
    holding.length === 0 ? "None." : holding.join(", "),
    "",
  ].join("\n");
  return { chart: drawn?.chart ?? "", report, broken };
}
