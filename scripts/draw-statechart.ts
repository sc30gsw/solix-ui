import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { type ChartView, defaultStateCap, statechartOf, viewOf } from "#/scripts/statechart.ts";

async function viewFrom(file: string | undefined): Promise<ChartView> {
  if (file === undefined) return {};
  const loaded: Record<string, unknown> = await import(pathToFileURL(resolve(file)).href);
  return viewOf(loaded, file);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    view: { type: "string" },
    out: { type: "string" },
    "max-states": { type: "string" },
  },
});
const [model] = positionals;
if (model === undefined) {
  throw new Error(
    "Usage: node scripts/draw-statechart.ts <model> [--view <file>] [--out <dir>] [--max-states <n>]",
  );
}
const cap = values["max-states"] === undefined ? defaultStateCap : Number(values["max-states"]);
const { chart, report, broken } = await statechartOf(model, await viewFrom(values.view), cap);
if (values.out !== undefined) {
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, "chart.mmd"), chart);
  writeFileSync(join(values.out, "report.md"), report);
}
console.log(report);
console.log(chart);
process.exitCode = broken.length === 0 ? 0 : 1;
