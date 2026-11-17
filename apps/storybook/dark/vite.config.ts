import { join } from "node:path";
import { storiesProject } from "#/stories-project.ts";
import { darkStoriesServer } from "#/tests/support/test-servers.ts";

export default storiesProject(darkStoriesServer, join(import.meta.dirname, "../.storybook"));
