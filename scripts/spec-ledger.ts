import type { SpecEntry } from "#/packages/core/spec/format.ts";
import { functionSpecs, lookSpecs } from "#/packages/core/spec/registry.ts";

function statusOf(entry: SpecEntry): string {
  return entry.status === "holds"
    ? "holds"
    : `pending until ${entry.until}, fails with ${entry.failsWith}`;
}

const ledger = [
  ...functionSpecs.flatMap(([section, spec]) =>
    spec.entries.map((entry) => ["function", section, entry.says, statusOf(entry)]),
  ),
  ...lookSpecs.flatMap(([section, spec]) =>
    spec.entries.map((entry) => ["look", section, entry.says, statusOf(entry)]),
  ),
];

process.stdout.write(ledger.map((line) => `${line.join("\t")}\n`).join(""));
