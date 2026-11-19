import type { SolixComputedColorScheme } from "@solix/core";

export type StoriesServer = {
  project: string;
  colorScheme: SolixComputedColorScheme;
};

export const storiesServer = {
  project: "stories",
  colorScheme: "light",
} satisfies StoriesServer;
export const storiesServers = [
  storiesServer,
  { project: "stories in the dark scheme", colorScheme: "dark" },
] satisfies StoriesServer[];
export const brokenStoriesServer = {
  project: "broken stories",
  colorScheme: "dark",
} satisfies StoriesServer;
