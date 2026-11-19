import { readFileSync } from "node:fs";
import { refusals, refusalsOf } from "#/scripts/agent-command-guard.ts";

const standardInput = 0;

function commandOf(input: string): string | undefined {
  const event: unknown = JSON.parse(input);
  if (typeof event !== "object" || event === null) return undefined;
  const toolInput: unknown = Reflect.get(event, "tool_input");
  if (Reflect.get(event, "tool_name") !== "Bash" || typeof toolInput !== "object" || !toolInput)
    return undefined;
  const command: unknown = Reflect.get(toolInput, "command");
  return typeof command === "string" ? command : undefined;
}

const command = commandOf(readFileSync(standardInput, "utf8"));
const found = command === undefined ? [] : refusalsOf(command, Boolean(process.env.CI));
if (found.length > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: found.map((refusal) => refusals[refusal]).join(" "),
      },
    }),
  );
}
