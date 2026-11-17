import { join } from "node:path";
import { storiesProject } from "#/stories-project.ts";
import { brokenStoriesRun } from "#/tests/support/test-servers.ts";

export default storiesProject(brokenStoriesRun, join(import.meta.dirname, ".storybook"));
