import type { Preview } from "storybook-solidjs-vite";
import {
  captureSolidDiagnostics,
  solidDevelopmentBuildLoaded,
  wcag2ATags,
} from "../../../tests/support/browser-gates.ts";
import "@solix/core/styles.css";

const accessibility = {
  test: "error",
  options: { runOnly: { type: "tag", values: wcag2ATags } },
};
const accessibilityKey = "a11y";
const manualKey = "manual";

let diagnosticsRaised: () => string[] = () => [];

function shown(value: unknown): string {
  return value === undefined ? "nothing" : JSON.stringify(value);
}

type ResolvedStory = {
  parameters: Record<string, unknown>;
  globals: Record<string, unknown>;
};

function accessibilityLeft({ parameters, globals }: ResolvedStory): string[] {
  const own: Record<string, unknown> = accessibility;
  const resolved: Record<string, unknown> = Object(parameters[accessibilityKey]);
  const changed = [...new Set([...Object.keys(own), ...Object.keys(resolved)])]
    .filter((key) => JSON.stringify(resolved[key]) !== JSON.stringify(own[key]))
    .map(
      (key) =>
        `${accessibilityKey}.${key} is ${shown(resolved[key])} where the project sets ${shown(own[key])}`,
    );
  const manual: unknown = Object(globals[accessibilityKey])[manualKey];
  const leftToAPerson =
    manual === true
      ? [`globals.${accessibilityKey}.${manualKey} is true where the project leaves it off`]
      : [];
  return [...changed, ...leftToAPerson];
}

function beforeEachStory(context: ResolvedStory): void {
  const left = accessibilityLeft(context);
  if (left.length > 0) {
    throw new Error(`The story leaves the accessibility gate:\n${left.join("\n")}`);
  }
  if (import.meta.env.DEV && !solidDevelopmentBuildLoaded()) {
    throw new Error(
      "Solid's development build is not loaded, so no story can be checked for Solid development diagnostics.",
    );
  }
  diagnosticsRaised = captureSolidDiagnostics();
}

function afterEachStory(): void {
  const raised = diagnosticsRaised();
  diagnosticsRaised = () => [];
  if (raised.length > 0) {
    throw new Error(`The story raised a Solid development diagnostic:\n${raised.join("\n")}`);
  }
}

const preview: Preview = {
  parameters: { [accessibilityKey]: accessibility },
  beforeEach: (context) => beforeEachStory(context),
  afterEach: afterEachStory,
};

export default preview;
