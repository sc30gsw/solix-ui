import { type CheckResult, formatValue, type Violation } from "tla-ts";
import { parseVars } from "#/scripts/formal/state-graph.ts";
import type { Vars } from "#/scripts/formal/tla-value.ts";

export type TraceStep = { action: string; vars: Vars };

export type RuleBreak = {
  rule: string;
  kind: "invariant" | "action property" | "temporal property" | "deadlock" | "assumption";
  trace: TraceStep[];
  loopsBackTo: number | undefined;
};

const kinds: Partial<Record<CheckResult["status"], RuleBreak["kind"]>> = {
  "invariant-violation": "invariant",
  "property-violation": "action property",
  "liveness-violation": "temporal property",
  deadlock: "deadlock",
  "assumption-violation": "assumption",
};

function stepsOf(violation: Violation | undefined): TraceStep[] {
  return (violation?.trace ?? []).map(({ label, state }) => ({
    action: label === undefined ? "" : label.replace(/ line \d+, col \d+ .*$/, ""),
    vars: parseVars(
      Object.entries(state)
        .map(([name, value]) => `/\\ ${name} = ${formatValue(value)}`)
        .join("\n"),
    ),
  }));
}

function isActionProperty(spec: string, rule: string): boolean {
  return new RegExp(`^${rule} ==\\s*\\[\\]\\[`, "m").test(spec);
}

export function brokenRuleOf(result: CheckResult, spec: string): RuleBreak | undefined {
  const named = kinds[result.status];
  if (named === undefined) return undefined;
  const rule = named === "deadlock" ? "deadlock" : (result.violation?.name ?? named);
  const kind =
    named === "temporal property" && isActionProperty(spec, rule) ? "action property" : named;
  return {
    rule,
    kind,
    trace: stepsOf(result.violation),
    loopsBackTo: result.violation?.loopStart,
  };
}
