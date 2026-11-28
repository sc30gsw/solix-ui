import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { type CheckResult, check, parseConfig } from "tla-ts";
import { repositoryRoot } from "#/scripts/repository.ts";
import { parseStateGraph, type StateGraph } from "#/scripts/formal/state-graph.ts";
import { brokenRuleOf, type RuleBreak } from "#/scripts/formal/trace.ts";

type CompiledModel = { model: string; module: string; spec: string; config: string };

export type ModelRun = CompiledModel & {
  result: CheckResult;
  broken: RuleBreak | undefined;
  graph: StateGraph | undefined;
  milliseconds: number;
};

export type RunOptions = { dump?: boolean; without?: readonly string[]; source?: string };

const cli = join(repositoryRoot, "node_modules", "tla-ts", "dist", "cli.js");
const scratchRoot = join(repositoryRoot, "node_modules", ".cache", "solix-formal");
const moduleHeader = /^-{4,}\s*MODULE\s+(\w+)\s*-{4,}/m;

export function compileModel(model: string, source?: string): CompiledModel {
  mkdirSync(scratchRoot, { recursive: true });
  const scratch = mkdtempSync(join(scratchRoot, "compile-"));
  try {
    const copy = join(scratch, basename(model));
    const noCheck = join(scratch, "compile-only.cfg");
    writeFileSync(copy, source ?? readFileSync(join(repositoryRoot, model), "utf8"));
    writeFileSync(noCheck, "");
    const run = spawnSync(process.execPath, [cli, "-noGenerateSpecTE", "-config", noCheck, copy], {
      cwd: scratch,
      encoding: "utf8",
    });
    const output = `${run.stdout}${run.stderr}`.replaceAll(scratch, "<scratch>");
    const written = readdirSync(scratch).find((file) => file.endsWith(".tla"));
    const spec = written === undefined ? undefined : join(scratch, written);
    if (spec === undefined) throw new Error(`tla-ts could not compile ${model}:\n${output}`);
    const text = readFileSync(spec, "utf8");
    const module = moduleHeader.exec(text)?.[1];
    if (module === undefined)
      throw new Error(`${model}: tla-ts wrote a spec with no MODULE header.`);
    return {
      model,
      module,
      spec: text,
      config: readFileSync(spec.replace(/\.tla$/, ".cfg"), "utf8"),
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export async function checkCompiled(
  compiled: CompiledModel,
  options: Omit<RunOptions, "source"> = {},
): Promise<ModelRun> {
  const without = options.without ?? [];
  const config = parseConfig(compiled.config);
  config.invariants = config.invariants.filter((rule) => !without.includes(rule));
  config.properties = config.properties.filter((rule) => !without.includes(rule));
  const dumped: string[] = [];
  const started = performance.now();
  const result = await check({
    source: compiled.spec,
    config,
    ...(options.dump === true
      ? {
          dump: { path: "graph.dot", dot: true, actionLabels: true },
          writeFile: (_path: string, content: string | Uint8Array) => {
            dumped.push(typeof content === "string" ? content : new TextDecoder().decode(content));
          },
        }
      : {}),
  });
  return {
    ...compiled,
    result,
    broken: brokenRuleOf(result, compiled.spec),
    graph:
      options.dump === true && result.status === "success"
        ? parseStateGraph(dumped.join(""))
        : undefined,
    milliseconds: Math.round(performance.now() - started),
  };
}

export async function runModel(model: string, options: RunOptions = {}): Promise<ModelRun> {
  return checkCompiled(compileModel(model, options.source), options);
}

export async function checkedGraph(model: string): Promise<StateGraph> {
  const run = await runModel(model, { dump: true });
  if (run.graph !== undefined && run.graph.states.size === 0) {
    throw new Error(`tla-ts passed ${model} but dumped no state graph to replay.`);
  }
  if (run.graph === undefined) {
    throw new Error(
      `tla-ts did not pass ${model}, so it has no state graph to replay: ${run.result.status}${run.broken === undefined ? "" : `, ${run.broken.kind} ${run.broken.rule}`}${run.result.failure === undefined ? "" : `, ${run.result.failure.message}`}.`,
    );
  }
  return run.graph;
}
