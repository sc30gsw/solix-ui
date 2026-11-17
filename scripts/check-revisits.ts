import { pnpmSettings } from "./pnpm-settings.ts";
import { registryDocuments, releasePolicy } from "./release-sources.ts";
import { evaluateRevisits, readRevisits, revisitTable } from "./revisits.ts";

const revisits = readRevisits();
const { evaluations, problems } = evaluateRevisits({
  revisits,
  documents: await registryDocuments(
    revisits.flatMap(({ condition }) => condition.map(({ name }) => name)),
  ),
  policy: releasePolicy(pnpmSettings()),
  now: Date.now(),
});

console.log(revisitTable(evaluations));
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
}
