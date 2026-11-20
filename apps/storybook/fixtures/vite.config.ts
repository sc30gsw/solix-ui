import { join } from "node:path";
import { storiesProject } from "#/stories-project.ts";
import { brokenStoriesServer } from "#/tests/support/test-servers.ts";

export default storiesProject(brokenStoriesServer, join(import.meta.dirname, ".storybook"));
