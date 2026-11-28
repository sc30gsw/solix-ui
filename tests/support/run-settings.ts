import { inject } from "vite-plus/test";
import type { RunSettings } from "#/tests/support/global-setup.ts";
import { configuredProjectNames } from "#/vite.config.ts";

export function allProjectSettings(cannotTell: string): Record<string, RunSettings> {
  const settings = inject("runSettingsOfEachProject");
  const projects = Object.keys(settings);
  const missing = configuredProjectNames().filter((project) => !projects.includes(project));
  if (missing.length > 0) {
    throw new Error(
      `The run is filtered: it holds only the projects ${projects.join(", ")}, and no ${missing.join(" or ")} project, so it cannot tell ${cannotTell}. Run it without --project.`,
    );
  }
  return settings;
}
