import type { SolixComputedColorScheme } from "@solix/core";

declare module "vite-plus/test" {
  interface ProvidedContext {
    storyColorScheme: SolixComputedColorScheme;
  }
  interface TaskMeta {
    colorSchemeAtTheEnd?: string;
  }
}
