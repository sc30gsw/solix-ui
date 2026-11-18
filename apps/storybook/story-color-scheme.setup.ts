import { colorSchemeAttribute, type SolixComputedColorScheme } from "@solix/core";
import { afterEach, beforeEach, inject } from "vite-plus/test";

function schemeOfTheProject(): SolixComputedColorScheme {
  const scheme: SolixComputedColorScheme | undefined = inject("storyColorScheme");
  if (scheme === undefined) {
    throw new Error(
      "The stories project provides no storyColorScheme, so nothing tells which colour scheme its stories run in. Provide it in the project, as apps/storybook/stories-project.ts does.",
    );
  }
  return scheme;
}

beforeEach(() => {
  document.documentElement.setAttribute(colorSchemeAttribute, schemeOfTheProject());
});

afterEach(({ task }) => {
  const scheme = schemeOfTheProject();
  const atTheEnd = getComputedStyle(document.documentElement).colorScheme;
  task.meta.colorSchemeAtTheEnd = atTheEnd;
  if (atTheEnd !== scheme) {
    throw new Error(
      `The story leaves the colour scheme of its project: after it ran, the page's color-scheme is ${atTheEnd}, not ${scheme}. Give a provider in the story an element of its own with getRootElement, so it leaves <html> to the project.`,
    );
  }
});
