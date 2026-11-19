import type { SolixComputedColorScheme } from "@solix/core";

export type StoriesServer = {
  project: string;
  port: number;
  colorScheme: SolixComputedColorScheme;
};

export const storiesServer = {
  project: "stories",
  port: 4325,
  colorScheme: "light",
} satisfies StoriesServer;
export const storiesServers = [
  storiesServer,
  { project: "stories in the dark scheme", port: 4332, colorScheme: "dark" },
] satisfies StoriesServer[];
export const brokenStoriesServer = {
  project: "broken stories",
  port: 4328,
  colorScheme: "dark",
} satisfies StoriesServer;
export const staticStorybookPort = 4326;
export const brokenStoriesTelemetryPort = 4329;
export const interfaceTelemetryPort = 4330;
