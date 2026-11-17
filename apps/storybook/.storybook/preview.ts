import axe from "axe-core";
import { type DiagnosticCapture, OBSERVE } from "solid-js";
import type { Preview } from "storybook-solidjs-vite";
import "@solix/core/styles.css";

const wcag2LevelAOrAA = /^wcag2\d?a{1,2}$/;

export const wcag2LevelAAndAATags = [...new Set(axe.getRules().flatMap(({ tags }) => tags))]
  .filter((tag) => wcag2LevelAOrAA.test(tag))
  .sort();

let diagnostics: DiagnosticCapture | undefined;

function startCapturingDiagnostics(): void {
  if (import.meta.env.DEV && OBSERVE === undefined) {
    throw new Error(
      "Solid's development build is not loaded, so no story can be checked for Solid development diagnostics.",
    );
  }
  diagnostics = OBSERVE?.diagnostics.capture();
}

function failOnDiagnostics(): void {
  const raised = (diagnostics?.stop() ?? []).map(({ code, message }) => `${code}: ${message}`);
  diagnostics = undefined;
  if (raised.length > 0) {
    throw new Error(`The story raised a Solid development diagnostic:\n${raised.join("\n")}`);
  }
}

const preview: Preview = {
  parameters: {
    a11y: {
      test: "error",
      options: { runOnly: { type: "tag", values: wcag2LevelAAndAATags } },
    },
  },
  beforeEach: startCapturingDiagnostics,
  afterEach: failOnDiagnostics,
};

export default preview;
