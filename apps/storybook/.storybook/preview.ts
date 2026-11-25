import type { AfterEach, BeforeEach } from "storybook/internal/types";
import type { Preview, SolidRenderer } from "storybook-solidjs-vite";
import { isRecord, wcag2AAndAATags } from "../../../tests/support/browser-gates.ts";
import {
  openSolidDiagnosticsGate,
  type SolidDiagnosticsGate,
  solidDevelopmentBuildLoaded,
} from "../../../tests/support/solid-diagnostics.ts";
import { colorContrastRule } from "../../../tests/support/contrast-exceptions.ts";
import {
  globalSwitchesThatSkipTheAccessibilityScan,
  selectorsTheAccessibilityAddonLeavesUnscanned,
} from "#/accessibility-scan.ts";
import { playReturned, storyMounted, storyStarted } from "#/story-run.ts";
import "@solix/core/styles.css";
import "#/.storybook/preview.css";

const projectAccessibility: Record<string, unknown> = {
  test: "error",
  options: { runOnly: { type: "tag", values: wcag2AAndAATags } },
  config: { rules: [colorContrastRule] },
};
const accessibilityKey = "a11y";

type StoryState = {
  parameters: Record<string, unknown>;
  globals: Record<string, unknown>;
  canvasElement: Element;
};

const diagnostics: { gate?: SolidDiagnosticsGate } = {};

function shown(value: unknown): string {
  return value === undefined ? "nothing" : JSON.stringify(value);
}

function valueAt(record: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), record);
}

function waysOutOfTheGate({ parameters, globals }: StoryState): string[] {
  const resolved = parameters[accessibilityKey];
  const story: Record<string, unknown> = isRecord(resolved) ? resolved : {};
  const changed = [...new Set([...Object.keys(projectAccessibility), ...Object.keys(story)])]
    .filter((key) => JSON.stringify(story[key]) !== JSON.stringify(projectAccessibility[key]))
    .map(
      (key) =>
        `${accessibilityKey}.${key} is ${shown(story[key])} where the project sets ${shown(projectAccessibility[key])}`,
    );
  const switched = globalSwitchesThatSkipTheAccessibilityScan
    .filter((path) => valueAt(globals, path) === true)
    .map((path) => `globals.${path.join(".")} is true where the project leaves it off`);
  return [...changed, ...switched];
}

function unscannedIn({ canvasElement }: StoryState): string[] {
  return selectorsTheAccessibilityAddonLeavesUnscanned
    .filter((selector) => canvasElement.querySelector(selector) !== null)
    .map(
      (selector) =>
        `the canvas holds ${selector}, which the accessibility addon leaves out of its scan`,
    );
}

function refuseAnyWayOut(when: string, waysOut: readonly string[]): void {
  if (waysOut.length > 0) {
    throw new Error(`The story leaves the accessibility gate ${when}:\n${waysOut.join("\n")}`);
  }
}

function giveTheStoryItsOwnAccessibilityParameters({ parameters }: StoryState): void {
  parameters[accessibilityKey] = structuredClone(parameters[accessibilityKey]);
}

const beforeEachStory: BeforeEach<SolidRenderer> = (context) => {
  storyStarted();
  refuseAnyWayOut("before it ran", waysOutOfTheGate(context));
  giveTheStoryItsOwnAccessibilityParameters(context);
  if (import.meta.env.DEV && !solidDevelopmentBuildLoaded()) {
    throw new Error(
      "Solid's development build is not loaded, so no story can be checked for Solid development diagnostics.",
    );
  }
  diagnostics.gate?.finish();
  diagnostics.gate = openSolidDiagnosticsGate();
  const mount = context.mount;
  context.mount = async (...rendered) => {
    const canvas = await mount(...rendered);
    storyMounted(context.canvasElement);
    return canvas;
  };
};

const afterEachStory: AfterEach<SolidRenderer> = (context) => {
  playReturned();
  const raised = diagnostics.gate?.finishDescribed() ?? [];
  diagnostics.gate = undefined;
  if (context.reporting.reports.length > 0) {
    throw new Error(
      `The preview's afterEach tells a failed play from a failed gate, so it must run first after the play function, but ${context.reporting.reports.map(({ type }) => type).join(", ")} reported before it. A story or a meta that writes afterEach, or an addon whose afterEach the preview's no longer comes before, ran first.`,
    );
  }
  refuseAnyWayOut("while it ran", [...waysOutOfTheGate(context), ...unscannedIn(context)]);
  if (raised.length > 0) {
    throw new Error(`The story raised a Solid development diagnostic:\n${raised.join("\n")}`);
  }
};

const preview: Preview = {
  parameters: { [accessibilityKey]: projectAccessibility },
  beforeEach: beforeEachStory,
  afterEach: afterEachStory,
};

export default preview;
