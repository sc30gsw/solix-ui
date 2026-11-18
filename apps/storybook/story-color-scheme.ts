import type { SolixProviderProps } from "@solix/core";

export type StoryColorScheme = NonNullable<SolixProviderProps["forceColorScheme"]>;

declare module "vite-plus/test" {
  interface ProvidedContext {
    storyColorScheme: StoryColorScheme;
  }
  interface TaskMeta {
    colorSchemeAtTheEnd?: string;
  }
}
