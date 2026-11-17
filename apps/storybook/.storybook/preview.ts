/// <reference types="vite/client" />
import type { Preview } from "./solid";
import axe from "axe-core";
import { render } from "@solidjs/web";
import { createComponent, type DiagnosticCapture, OBSERVE } from "solid-js";
import "@solix/core/styles.css";

const wcag22LevelAOrAA = /^wcag2\d?a{1,2}$/;
const wcag22LevelAAndAA = [...new Set(axe.getRules().flatMap(({ tags }) => tags))]
  .filter((tag) => wcag22LevelAOrAA.test(tag))
  .sort();

let diagnostics: DiagnosticCapture | undefined;
let unmount: (() => void) | undefined;

const preview: Preview = {
  parameters: {
    a11y: {
      test: "error",
      options: { runOnly: { type: "tag", values: wcag22LevelAAndAA } },
    },
  },
  render: (args, { component }) => (component ? createComponent(component, args) : undefined),
  decorators: [
    (story) => {
      unmount?.();
      const host = document.createElement("div");
      host.style.display = "contents";
      unmount = render(story, host);
      return host;
    },
  ],
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
