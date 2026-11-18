import semver from "semver";
import {
  isStable,
  newestFirst,
  publishedIn,
  type RegistryDocument,
  type ReleasePolicy,
} from "#/scripts/newest-releases.ts";
import { listed } from "#/scripts/repository.ts";
import { type Line, linesOf, readRoadmapText, roadmapFile, where } from "#/scripts/roadmap.ts";

export type Requirement = { name: string; range: string };

export type Revisit = { name: string; reason: string; condition: Requirement[] };

export type RequirementState =
  | { requirement: Requirement; status: "met"; version: string }
  | { requirement: Requirement; status: "too young"; version: string; eligibleAt: string }
  | { requirement: Requirement; status: "not published"; newest: string | undefined }
  | { requirement: Requirement; status: "unknown"; why: string };

export type RevisitEvaluation = {
  revisit: Revisit;
  met: boolean;
  requirements: RequirementState[];
};

export type RevisitReport = { evaluations: RevisitEvaluation[]; problems: string[] };

const revisitsSection = "Revisits";
const reasonLine = /^- Why not now: (.*)$/;
const conditionLine = /^- Condition:(.*)$/;
const conditionText =
  /^ a stable release old enough to install under the repository's `minimumReleaseAge` exists for (.+)\.$/;
const requirementText = /^`((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)@([^`]+)`$/;
const listSeparator = /, | and /;

function requirementsIn(text: string, line: Line, revisit: string): Requirement[] {
  const parts = conditionText.exec(text);
  const requirements = parts?.[1].split(listSeparator).map((spec) => requirementText.exec(spec));
  if (!requirements || requirements.some((found) => !found || !semver.validRange(found[2]))) {
    throw new Error(
      `${where(line)}: write the condition of ${revisit} as "- Condition: a stable release old enough to install under the repository's \`minimumReleaseAge\` exists for \`<package>@<range>\` and \`<package>@<range>\`."`,
    );
  }
  return requirements.flatMap((found) => (found ? [{ name: found[1], range: found[2] }] : []));
}

function isInARevisit(line: Line): boolean {
  return line.section === revisitsSection && line.subsection !== undefined;
}

export function parseRevisits(text: string): Revisit[] {
  const lines = linesOf(text);
  const stray = lines.find((line) => conditionLine.test(line.text) && !isInARevisit(line));
  if (stray) {
    throw new Error(
      `${where(stray)}: a condition belongs to one revisit. Write it under the revisit's ### heading in ## ${revisitsSection}.`,
    );
  }
  const own = lines.filter(isInARevisit);
  const names = [...new Set(own.flatMap(({ subsection }) => subsection ?? []))];
  return names.map((name) => {
    const body = own.filter(({ subsection }) => subsection === name);
    const conditions = body.filter(({ text: line }) => conditionLine.test(line));
    if (conditions.length > 1) {
      throw new Error(
        `${listed(conditions.map(where))}: ${name} has ${conditions.length} condition lines. Write one.`,
      );
    }
    const reason = body.flatMap(({ text: line }) => reasonLine.exec(line)?.[1] ?? []).join(" ");
    const condition = conditions.flatMap((line) =>
      requirementsIn(conditionLine.exec(line.text)?.[1] ?? "", line, name),
    );
    return { name, reason: reason.trim(), condition };
  });
}

export function readRevisits(): Revisit[] {
  return parseRevisits(readRoadmapText());
}

export function revisitsWithoutReasonOrCondition(revisits: readonly Revisit[]): string[] {
  return revisits
    .filter(({ reason, condition }) => reason === "" || condition.length === 0)
    .map(
      ({ name }) =>
        `${roadmapFile}: give the revisit ${name} a "- Why not now:" reason and a "- Condition:" the weekly check can evaluate.`,
    );
}

function stateOf(
  requirement: Requirement,
  document: RegistryDocument | undefined,
  policy: ReleasePolicy,
  now: number,
): RequirementState {
  const published = publishedIn(requirement.name, document, policy);
  if (!Array.isArray(published)) return { requirement, status: "unknown", why: published.why };
  const inRange = newestFirst(
    published.filter(
      (release) => isStable(release) && semver.satisfies(release.version, requirement.range),
    ),
  );
  const eligible = inRange.find(({ eligibleAt }) => eligibleAt <= now);
  if (eligible) return { requirement, status: "met", version: eligible.version };
  const soonest = inRange.toSorted((left, right) => left.eligibleAt - right.eligibleAt).at(0);
  return soonest
    ? {
        requirement,
        status: "too young",
        version: soonest.version,
        eligibleAt: new Date(soonest.eligibleAt).toISOString(),
      }
    : { requirement, status: "not published", newest: newestFirst(published).at(0)?.version };
}

function metBy(requirements: readonly RequirementState[]): string {
  return requirements
    .flatMap((state) =>
      state.status === "met" ? [`${state.requirement.name}@${state.version}`] : [],
    )
    .join(", ");
}

export function evaluateRevisits(input: {
  revisits: readonly Revisit[];
  documents: Readonly<Record<string, RegistryDocument>>;
  policy: ReleasePolicy;
  now: number;
}): RevisitReport {
  const evaluations = input.revisits.map((revisit): RevisitEvaluation => {
    const requirements = revisit.condition.map((requirement) =>
      stateOf(requirement, input.documents[requirement.name], input.policy, input.now),
    );
    return {
      revisit,
      met: requirements.length > 0 && requirements.every(({ status }) => status === "met"),
      requirements,
    };
  });
  const problems = [
    ...evaluations.flatMap(({ revisit, met, requirements }) => [
      ...(met
        ? [
            `${revisit.name}: its condition in ${roadmapFile} is met by ${metBy(requirements)}. Decide on the revisit: take it up, or give it a new condition.`,
          ]
        : []),
      ...requirements.flatMap((state) =>
        state.status === "unknown" ? [`${revisit.name}: ${state.why}`] : [],
      ),
    ]),
    ...revisitsWithoutReasonOrCondition(input.revisits),
  ];
  return { evaluations, problems };
}

function described(state: RequirementState): string {
  if (state.status === "met") return `met by ${state.version}`;
  if (state.status === "too young") {
    return `${state.version} is published, old enough to install from ${state.eligibleAt}`;
  }
  if (state.status === "unknown") return `unknown: ${state.why}`;
  return `no stable release in range; the newest is ${state.newest ?? "none"}`;
}

export function revisitTable(evaluations: readonly RevisitEvaluation[]): string {
  const rows = evaluations.flatMap(({ revisit, requirements }) =>
    requirements.map(
      (state) =>
        `| ${revisit.name} | ${state.requirement.name}@${state.requirement.range} | ${described(state)} |`,
    ),
  );
  return ["| Revisit | Requirement | Status |", "| --- | --- | --- |", ...rows].join("\n");
}
