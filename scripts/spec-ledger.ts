import { describeLook, type FunctionStatus, type LookStatus } from "#/packages/core/spec/format.ts";
import { behaviourGapItems } from "#/packages/core/spec/gaps.ts";
import { functionSpecs, lookSpecs } from "#/packages/core/spec/registry.ts";

function statusOf(status: FunctionStatus | LookStatus): string {
  if (status === "holds") return "holds";
  const fails = typeof status.fails === "string" ? status.fails : JSON.stringify(status.fails);
  return `pending until ${status.until}, fails with ${fails}`;
}

const ledger = [
  ...functionSpecs.flatMap(([section, spec]) =>
    spec.entries.map((entry) => ["function", section, entry.says, statusOf(entry.status)]),
  ),
  ...lookSpecs.flatMap(([section, spec]) =>
    spec.map((entry) => ["look", section, describeLook(entry), statusOf(entry.status)]),
  ),
  ...Object.entries(behaviourGapItems).map(([item, gap]) => [
    "behaviour",
    item,
    gap.says,
    `specified by ${gap.specifiedBy}`,
  ]),
];

process.stdout.write(ledger.map((line) => `${line.join("\t")}\n`).join(""));
