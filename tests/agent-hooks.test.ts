import { expect, test } from "vite-plus/test";
import { kitHookCommands, kitHookEvents, readSettings, settingsFile } from "#/scripts/agent-kit.ts";
import { guardHookCommand, guardHookEvent } from "#/scripts/agent-command-guard.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const tested = [
  { event: guardHookEvent, command: guardHookCommand },
  ...kitHookEvents.map((event) => ({ event, command: kitHookCommands[event] })),
];

function key({ event, command }: { event: string; command: string | undefined }): string {
  return JSON.stringify([event, command]);
}

test(`every hook in ${settingsFile} is the command guard's or one of the kit's, once, under the event its test runs it for`, () => {
  const hooks = Object.entries(readSettings(repositoryRoot).hooks ?? {}).flatMap(
    ([event, entries]) =>
      (entries ?? [])
        .flatMap(({ hooks: commands }) => commands ?? [])
        .map(({ command }) => ({ event, command })),
  );
  const untested = hooks
    .filter((hook) => !tested.some((known) => key(known) === key(hook)))
    .map(
      ({ event, command }) =>
        `${settingsFile}: no test runs the ${event} hook ${JSON.stringify(command)}. Build it in scripts/agent-command-guard.ts or scripts/agent-kit.ts, for the event their tests run it for, so a hook that fails open is seen.`,
    );
  const counts = tested.map(
    (known) => `${known.event}: ${hooks.filter((hook) => key(hook) === key(known)).length}`,
  );

  expect(untested).toEqual([]);
  expect(counts).toEqual(tested.map(({ event }) => `${event}: 1`));
});
