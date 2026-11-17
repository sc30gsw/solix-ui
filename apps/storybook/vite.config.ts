import { join } from "node:path";
import { storiesProject } from "#/stories-project.ts";
import { storiesRun } from "#/tests/support/test-servers.ts";

export default storiesProject(storiesRun, join(import.meta.dirname, ".storybook"));
