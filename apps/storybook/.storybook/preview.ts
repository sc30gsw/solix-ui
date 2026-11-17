import type { Preview } from "storybook-solidjs-vite";
import {
  captureSolidDiagnostics,
  solidDevelopmentBuildLoaded,
  wcag2ATags,
} from "../../../tests/support/browser-gates.ts";
import { selectorsTheAccessibilityAddonLeavesUnscanned } from "#/accessibility-scan.ts";
import "@solix/core/styles.css";

const accessibility = {
  test: "error",
  options: { runOnly: { type: "tag", values: wcag2ATags } },
};
const accessibilityKey = "a11y";
const globalSwitchesThatSkipTheScan = [[accessibilityKey, "manual"], ["ghostStories"]] as const;

type ResolvedStory = {
  parameters: Record<string, unknown>;
  globals: Record<string, unknown>;
  canvasElement: Element;
};

let diagnosticsRaised: () => string[] = () => [];

function shown(value: unknown): string {
  return value === undefined ? "nothing" : JSON.stringify(value);
}

function switchedOn(globals: Record<string, unknown>, path: readonly string[]): boolean {
  return path.reduce<unknown>((value, key) => Object(value)[key], globals) === true;
}

function accessibilityLeft({ parameters, globals }: ResolvedStory): string[] {
  const own: Record<string, unknown> = accessibility;
  const resolved: Record<string, unknown> = Object(parameters[accessibilityKey]);
  const changed = [...new Set([...Object.keys(own), ...Object.keys(resolved)])]
    .filter((key) => JSON.stringify(resolved[key]) !== JSON.stringify(own[key]))
    .map(
      (key) =>
        `${accessibilityKey}.${key} is ${shown(resolved[key])} where the project sets ${shown(own[key])}`,
    );
  const switched = globalSwitchesThatSkipTheScan
    .filter((path) => switchedOn(globals, path))
    .map((path) => `globals.${path.join(".")} is true where the project leaves it off`);
  return [...changed, ...switched];
}

function unscannedIn({ canvasElement }: ResolvedStory): string[] {
  return selectorsTheAccessibilityAddonLeavesUnscanned
    .filter((selector) => canvasElement.querySelector(selector) !== null)
    .map(
      (selector) =>
        `the canvas holds ${selector}, which the accessibility addon leaves out of its scan`,
    );
}

function refuseAnyLeft(when: string, left: readonly string[]): void {
  if (left.length > 0) {
    throw new Error(
      `The story leaves the accessibility gate ${when}:\n${left.map((line) => `${when}, ${line}`).join("\n")}`,
    );
  }
}

function beforeEachStory(context: ResolvedStory): void {
  refuseAnyLeft("before it ran", accessibilityLeft(context));
  context.parameters[accessibilityKey] = structuredClone(context.parameters[accessibilityKey]);
  if (import.meta.env.DEV && !solidDevelopmentBuildLoaded()) {
    throw new Error(
      "Solid's development build is not loaded, so no story can be checked for Solid development diagnostics.",
    );
  }
  diagnosticsRaised = captureSolidDiagnostics();
}

function afterEachStory(context: ResolvedStory): void {
  const raised = diagnosticsRaised();
  diagnosticsRaised = () => [];
  refuseAnyLeft("while it ran", [...accessibilityLeft(context), ...unscannedIn(context)]);
  if (raised.length > 0) {
    throw new Error(`The story raised a Solid development diagnostic:\n${raised.join("\n")}`);
  }
}

const preview: Preview = {
  parameters: { [accessibilityKey]: accessibility },
  beforeEach: (context) => beforeEachStory(context),
  afterEach: (context) => afterEachStory(context),
};

export default preview;
