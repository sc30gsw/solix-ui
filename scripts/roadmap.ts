import { existsSync, readFileSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { listed, repositoryRoot, rootManifest } from "#/scripts/repository.ts";

export const roadmapFile = "ROADMAP.md";
export const stepStatuses = ["not started", "in progress", "merged"] as const;

export type StepStatus = (typeof stepStatuses)[number];

export type Step = {
  name: string;
  status: StepStatus;
  components: string[];
  mergedWhen?: string;
};

export type Leaving = { component: string; replacedBy: string[] };

export type Roadmap = { steps: Step[]; leaving: Leaving[] };

export type Built = { components: readonly string[]; carriedBy: Readonly<Record<string, string>> };

export type Repository = {
  exists: (file: string) => boolean;
  runByVerify: (file: string) => boolean;
};

export type TestProject = { test?: { include?: string[]; exclude?: string[] } };

export type Line = {
  text: string;
  number: number;
  section: string;
  subsection: string | undefined;
};

const stepsSection = "v1.0";
const leavingSection = "Leaving";
const sectionHeading = /^## (.+)$/;
const subsectionHeading = /^### (.+)$/;
const numberedLine = /^(\d+)\. /;
const boldBullet = /^- \*\*/;
const stepLine = /^\d+\. \*\*([^*]+)\*\* \(([^)]+)\)(?:: (.+))?\.$/;
const leavingLine = /^- \*\*([^*]+)\*\* will leave once (.+) (?:is|are) in the built library\.$/;
const componentName = /^[A-Z][A-Za-z0-9]*$/;
const conditionLine = /^ {3}- Merged when: `([^`]+)` exists and `vp run verify` runs it\.$/;
const conditionLike = /^\s*- Merged when\b/;
const verifyRunsTheTests = "vp test";
const testConfigFile = "vite.config.ts";
const listSeparator = /, | and /;

export function linesOf(text: string): Line[] {
  let section = "";
  let subsection: string | undefined;
  return text.split("\n").flatMap((raw, index) => {
    const heading = sectionHeading.exec(raw);
    const subheading = subsectionHeading.exec(raw);
    if (heading) {
      section = heading[1];
      subsection = undefined;
      return [];
    }
    if (subheading) {
      subsection = subheading[1];
      return [];
    }
    return [{ text: raw, number: index + 1, section, subsection }];
  });
}

export function where(line: Line): string {
  return `${roadmapFile}:${line.number}`;
}

function namesIn(text: string, line: Line): string[] {
  const names = text.split(listSeparator);
  const notNames = names.filter((name) => !componentName.test(name));
  if (notNames.length > 0) {
    throw new Error(
      `${where(line)}: ${listed(notNames.map((name) => `"${name}"`))} is not a component name. Write the names as Name, Name and Name.`,
    );
  }
  return names;
}

function isStatus(text: string): text is StepStatus {
  return (stepStatuses as readonly string[]).includes(text);
}

function stepOf(line: Line, index: number): Step {
  const parts = stepLine.exec(line.text);
  if (!parts || line.subsection !== undefined) {
    throw new Error(
      `${where(line)}: write a step in the numbered list under ## ${stepsSection}, before any ###, as "1. **Name** (status): Component, Component.", or "1. **Name** (status)." when it adds no component.`,
    );
  }
  const number = Number(numberedLine.exec(line.text)?.[1]);
  if (number !== index + 1) {
    throw new Error(`${where(line)}: number the steps in order; this one is ${index + 1}.`);
  }
  const [, name, status, components] = parts;
  if (!isStatus(status)) {
    throw new Error(
      `${where(line)}: ${name} has the status "${status}". A status is one of ${listed(stepStatuses.map((known) => `"${known}"`))}.`,
    );
  }
  return { name, status, components: components === undefined ? [] : namesIn(components, line) };
}

function leavingOf(line: Line): Leaving {
  const parts = leavingLine.exec(line.text);
  if (!parts) {
    throw new Error(
      `${where(line)}: write a leaving component as "- **Name** will leave once Name and Name are in the built library."`,
    );
  }
  const leaving = namesIn(parts[1], line);
  if (leaving.length !== 1) {
    throw new Error(`${where(line)}: a leaving entry names exactly one component.`);
  }
  return { component: leaving[0], replacedBy: namesIn(parts[2], line) };
}

function isLeavingLine(line: Line): boolean {
  return line.subsection === leavingSection && line.text.startsWith("- ");
}

function isStepLine(line: Line): boolean {
  return !isLeavingLine(line) && (numberedLine.test(line.text) || boldBullet.test(line.text));
}

function placedOnce(placements: readonly { name: string; line: Line }[]): void {
  for (const [index, { name, line }] of placements.entries()) {
    const first = placements.findIndex((placement) => placement.name === name);
    if (first !== index) {
      throw new Error(
        `${where(placements[first].line)} and ${where(line)}: ${name} is placed twice. Place it once.`,
      );
    }
  }
}

function conditionOf(line: Line): string {
  const file = conditionLine.exec(line.text)?.[1];
  if (file === undefined) {
    throw new Error(
      `${where(line)}: write the condition as "   - Merged when: \`<test file>\` exists and \`vp run verify\` runs it.", indented under its step.`,
    );
  }
  return file;
}

function withConditions(v1: readonly Line[], stepLines: readonly Line[], steps: Step[]): Step[] {
  const conditionLines = v1.filter(({ text }) => conditionLike.test(text));
  const decided = steps.map((step) => ({ ...step }));
  for (const line of conditionLines) {
    const file = conditionOf(line);
    const index = stepLines.findIndex(({ number }) => number === line.number - 1);
    const step = decided[index];
    if (step === undefined) {
      throw new Error(`${where(line)}: a condition goes on the line right under its step.`);
    }
    if (step.components.length > 0) {
      throw new Error(
        `${where(line)}: ${step.name} adds components, and the build decides whether they are merged. Remove the condition.`,
      );
    }
    step.mergedWhen = file;
  }
  for (const [index, step] of decided.entries()) {
    if (step.status === "merged" && step.components.length === 0 && step.mergedWhen === undefined) {
      throw new Error(
        `${where(stepLines[index])}: ${step.name} adds no component, so give it the condition that shows it merged, on the line under it: "   - Merged when: \`<test file>\` exists and \`vp run verify\` runs it."`,
      );
    }
  }
  return decided;
}

export function parseRoadmap(text: string): Roadmap {
  const v1 = linesOf(text).filter(({ section }) => section === stepsSection);
  const stepLines = v1.filter(isStepLine);
  const leavingLines = v1.filter(isLeavingLine);
  const steps = withConditions(v1, stepLines, stepLines.map(stepOf));
  const leaving = leavingLines.map(leavingOf);
  placedOnce([
    ...steps.flatMap(({ components }, index) =>
      components.map((name) => ({ name, line: stepLines[index] })),
    ),
    ...leaving.map(({ component }, index) => ({ name: component, line: leavingLines[index] })),
  ]);
  return { steps, leaving };
}

export function readRoadmapText(): string {
  return readFileSync(join(repositoryRoot, roadmapFile), "utf8");
}

export function readRoadmap(): Roadmap {
  return parseRoadmap(readRoadmapText());
}

function carries(holder: unknown, part: unknown): boolean {
  return (
    (typeof holder === "function" || (typeof holder === "object" && holder !== null)) &&
    Object.getOwnPropertyNames(holder).some(
      (key) => Object.getOwnPropertyDescriptor(holder, key)?.value === part,
    )
  );
}

export function carriersIn(
  library: Readonly<Record<string, unknown>>,
  components: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    components.flatMap((part) => {
      const carrier = components.find(
        (name) => name !== part && carries(library[name], library[part]),
      );
      return carrier === undefined ? [] : [[part, carrier]];
    }),
  );
}

function placed({ steps, leaving }: Roadmap, component: string): boolean {
  return (
    steps.some(({ components }) => components.includes(component)) ||
    leaving.some((entry) => entry.component === component)
  );
}

function mergedStepProblems(steps: readonly Step[], built: Built): string[] {
  return steps
    .filter(({ status }) => status === "merged")
    .flatMap(({ name, components }) => {
      const missing = components.filter((component) => !built.components.includes(component));
      return missing.length === 0
        ? []
        : [
            `${roadmapFile}: ${name} is marked merged, but the built library does not export ${listed(missing)}. Mark it in progress, or land them.`,
          ];
    });
}

function placementProblems(roadmap: Roadmap, built: Built): string[] {
  return built.components.flatMap((component) => {
    const carrier = built.carriedBy[component];
    if (carrier !== undefined) {
      return placed(roadmap, component)
        ? [
            `${roadmapFile}: the built library carries ${component} as a static member of ${carrier}, so it goes with ${carrier}. Remove it from the roadmap.`,
          ]
        : [];
    }
    return placed(roadmap, component)
      ? []
      : [
          `${roadmapFile}: the built library exports ${component}, which no step lists. Add it to the step it belongs to, or list it as leaving.`,
        ];
  });
}

function leavingProblems({ steps, leaving }: Roadmap, built: Built): string[] {
  return leaving.flatMap(({ component, replacedBy }) => {
    const unplanned = replacedBy.filter(
      (name) => !steps.some(({ components }) => components.includes(name)),
    );
    const landed = replacedBy.every((name) => built.components.includes(name));
    const exported = built.components.includes(component);
    return [
      ...(exported
        ? []
        : [
            `${roadmapFile}: ${component} is listed as leaving, but the built library no longer exports it. Remove it from Leaving.`,
          ]),
      ...(unplanned.length === 0
        ? []
        : [
            `${roadmapFile}: ${component} is replaced by ${listed(unplanned)}, which no step lists. Add them to a step.`,
          ]),
      ...(landed && exported
        ? [
            `${roadmapFile}: ${listed(replacedBy)} ${replacedBy.length === 1 ? "is" : "are"} in the built library, so ${component} leaves now. Remove it from the library and from Leaving.`,
          ]
        : []),
    ];
  });
}

export function roadmapProblems(roadmap: Roadmap, built: Built): string[] {
  return [
    ...mergedStepProblems(roadmap.steps, built),
    ...placementProblems(roadmap, built),
    ...leavingProblems(roadmap, built),
  ];
}

export function runsTheFile(projects: readonly unknown[], file: string): boolean {
  return projects.some((project) => {
    const { include = [], exclude = [] } =
      typeof project === "object" && project !== null ? ((project as TestProject).test ?? {}) : {};
    return (
      include.some((pattern) => matchesGlob(file, pattern)) &&
      !exclude.some((pattern) => matchesGlob(file, pattern))
    );
  });
}

export async function theRepository(): Promise<Repository> {
  const runsTheTests = (rootManifest().scripts?.verify ?? "")
    .split(" && ")
    .includes(verifyRunsTheTests);
  const { default: config } = (await import(join(repositoryRoot, testConfigFile))) as {
    default: { test?: { projects?: unknown[] } };
  };
  return {
    exists: (file) => existsSync(join(repositoryRoot, file)),
    runByVerify: (file) => runsTheTests && runsTheFile(config.test?.projects ?? [], file),
  };
}

export function conditionProblems(steps: readonly Step[], repository: Repository): string[] {
  return steps.flatMap(({ name, status, mergedWhen }) => {
    if (mergedWhen === undefined) return [];
    const holds = repository.exists(mergedWhen) && repository.runByVerify(mergedWhen);
    if (status === "merged" && !holds) {
      return [
        `${roadmapFile}: ${name} is marked merged, but ${mergedWhen} ${repository.exists(mergedWhen) ? "is not a file `vp run verify` runs" : "does not exist"}. Mark it in progress, or land it.`,
      ];
    }
    return status !== "merged" && holds
      ? [
          `${roadmapFile}: ${name} is marked ${status}, but ${mergedWhen} exists and \`vp run verify\` runs it. Mark it merged.`,
        ]
      : [];
  });
}
