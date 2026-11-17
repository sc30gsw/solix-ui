/// <reference types="vite/client" />
import axe from "axe-core";
import { type DiagnosticCapture, OBSERVE } from "solid-js";
import type { Preview } from "storybook-solidjs-vite";
import "@solix/core/styles.css";

const wcag22LevelAOrAA = /^wcag2\d?a{1,2}$/;
const wcag22LevelAAndAA = [...new Set(axe.getRules().flatMap(({ tags }) => tags))]
  .filter((tag) => wcag22LevelAOrAA.test(tag))
  .sort();

let diagnostics: DiagnosticCapture | undefined;

const preview: Preview = {
  parameters: {
    a11y: {
      test: "error",
      options: { runOnly: { type: "tag", values: wcag22LevelAAndAA } },
    },
  },
  beforeEach: () => {
    diagnostics = OBSERVE?.diagnostics.capture();
  },
  afterEach: () => {
    const raised = (diagnostics?.stop() ?? []).map(({ code, message }) => `${code}: ${message}`);
    if (raised.length > 0) {
      throw new Error(`The story raised a Solid development diagnostic:\n${raised.join("\n")}`);
    }
  },
};

export default preview;
