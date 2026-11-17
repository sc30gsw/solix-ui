export const storiesServer = { project: "stories", port: 4325, colorScheme: "light" } as const;
export const darkStoriesServer = {
  project: "stories in the dark scheme",
  port: 4332,
  colorScheme: "dark",
} as const;
export const storiesServers = [storiesServer, darkStoriesServer] as const;
export const brokenStoriesServer = {
  project: "broken stories",
  port: 4328,
  colorScheme: "light",
} as const;
export const staticStorybookPort = 4326;
export const brokenStoriesTelemetryPort = 4329;
export const interfaceTelemetryPort = 4330;
