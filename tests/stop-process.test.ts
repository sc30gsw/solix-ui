import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";
import { descendants, parse, ts } from "../scripts/syntax";
import { repositoryRoot } from "./support/workspace";

const stopProcess = pathToFileURL(join(repositoryRoot, "scripts/stop-process.mjs")).href;
const moreThanAPipeHolds = 500_000;
const lastLine = "the check failed. No evidence was recorded.\n";
const evidenceScript = ".agents/skills/verify-playground/scripts/evidence.mjs";

test("stopWith delivers its whole message to a reader that is slow to read, then exits with 1", async () => {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { stopWith } from ${JSON.stringify(stopProcess)}; stopWith("x".repeat(${moreThanAPipeHolds}) + ${JSON.stringify(lastLine)});`,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const exited = once(child, "exit");
  const started = once(child, "spawn");
  await started;
  const received: Buffer[] = [];
  for await (const chunk of child.stderr) received.push(chunk);
  const [status] = await exited;
  const message = Buffer.concat(received).toString();

  expect(message.length).toBe(moreThanAPipeHolds + lastLine.length);
  expect(message.endsWith(lastLine)).toBe(true);
  expect(status).toBe(1);
});

test("the evidence script stops through stopWith, and writes to stderr and exits nowhere itself", () => {
  const ownStops = descendants(parse(join(repositoryRoot, evidenceScript)))
    .filter(
      (node) =>
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "process" &&
        ["exit", "stderr"].includes(node.name.text),
    )
    .map((node) => node.getText());

  expect(ownStops).toEqual([]);
});
