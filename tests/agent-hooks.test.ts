import { expect, test } from "vite-plus/test";
import { kitHookCommands, readSettings, settingsFile } from "#/scripts/agent-kit.ts";
import { guardHookCommand } from "#/scripts/agent-command-guard.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

test(`every hook in ${settingsFile} is the command guard's or one of the kit's, which their tests run as it gives them`, () => {
  const tested = new Set([guardHookCommand, ...Object.values(kitHookCommands)]);
  const untested = Object.entries(readSettings(repositoryRoot).hooks ?? {}).flatMap(
    ([event, entries]) =>
      (entries ?? [])
        .flatMap(({ hooks }) => hooks ?? [])
        .filter(({ command }) => command === undefined || !tested.has(command))
        .map(
          ({ command }) =>
            `${settingsFile}: no test runs the ${event} hook ${JSON.stringify(command)}. Build it in scripts/agent-command-guard.ts or scripts/agent-kit.ts, whose tests run each hook as ${settingsFile} gives it, from a package directory and under a node that cannot run it, so a hook that fails open is seen.`,
        ),
  );

  expect(untested).toEqual([]);
});
