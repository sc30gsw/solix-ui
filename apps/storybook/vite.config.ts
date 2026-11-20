import { join } from "node:path";
import { storiesProject } from "#/stories-project.ts";
import { storyRecordsOfThisRun } from "#/story-records-command.ts";
import { storiesServer } from "#/tests/support/test-servers.ts";

export default storiesProject(
  storiesServer,
  join(import.meta.dirname, ".storybook"),
  storyRecordsOfThisRun(),
);
