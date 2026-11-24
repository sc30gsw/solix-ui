export type Scheme = "light" | "dark";
export type Engine = "chromium" | "firefox" | "webkit";

export type Because =
  | { readonly kind: "design"; readonly reason: string }
  | { readonly kind: "engine"; readonly engines: readonly Engine[]; readonly reason: string }
  | { readonly kind: "scheme"; readonly scheme: Scheme; readonly reason: string }
  | { readonly kind: "systemScheme"; readonly scheme: Scheme; readonly reason: string }
  | { readonly kind: "viewport"; readonly reason: string }
  | { readonly kind: "openUntil"; readonly followUp: string };

export type AlikeGroup<V extends string = string> = {
  readonly values: readonly V[];
  readonly because: Because;
};

export type Surroundings = {
  readonly engine: Engine;
  readonly scheme: Scheme;
  readonly systemScheme: Scheme;
  readonly width: number;
};

export type Observed = readonly (readonly string[])[];

export type JudgedValues = {
  readonly prop: string;
  readonly values: readonly string[];
  readonly observe: string;
  readonly observed: readonly Observed[];
  readonly viewport: number | undefined;
  readonly alike: readonly AlikeGroup[];
  readonly surroundings: Surroundings;
};

export type ProblemKind =
  | "count"
  | "viewport"
  | "viewportWithoutViewport"
  | "notAnOption"
  | "alike"
  | "noLongerNeeded";

export type Problem = { readonly kind: ProblemKind; readonly message: string };

export function describeBecause(because: Because): string {
  switch (because.kind) {
    case "design":
      return `by design, ${because.reason}`;
    case "engine":
      return `in ${because.engines.join(" and ")}, ${because.reason}`;
    case "scheme":
      return `in the ${because.scheme} scheme, ${because.reason}`;
    case "systemScheme":
      return `while the system prefers the ${because.scheme} scheme, ${because.reason}`;
    case "viewport":
      return `at the story's viewport, ${because.reason}`;
    case "openUntil":
      return `open until ${because.followUp}`;
  }
}

function inForce(because: Because, surroundings: Surroundings): boolean {
  switch (because.kind) {
    case "engine":
      return because.engines.includes(surroundings.engine);
    case "scheme":
      return because.scheme === surroundings.scheme;
    case "systemScheme":
      return because.scheme === surroundings.systemScheme;
    case "design":
    case "viewport":
    case "openUntil":
      return true;
  }
}

function pairsOf<T>(items: readonly T[]): (readonly [T, T])[] {
  return items.flatMap((item, at) => items.slice(at + 1).map((other) => [item, other] as const));
}

function joinedBy(groups: readonly AlikeGroup[]): (value: string) => string {
  const parent = new Map<string, string>();
  const root = (value: string): string => {
    const above = parent.get(value) ?? value;
    return above === value ? value : root(above);
  };
  for (const { values } of groups) {
    for (const value of values.slice(1)) parent.set(root(value), root(values[0]));
  }
  return root;
}

function named([value, other]: readonly [string, string]): string {
  return `${value} and ${other}`;
}

export function judgeEveryValue(judged: JudgedValues): readonly Problem[] {
  const { prop, values, observe, observed, viewport, alike, surroundings } = judged;
  const where = `everyValueOf(meta, "${prop}")`;
  const problems: Problem[] = [];
  if (observed.length !== values.length) {
    problems.push({
      kind: "count",
      message: `${where} renders ${observed.length} of ${values.length} values.`,
    });
  }
  if (viewport !== undefined && surroundings.width !== viewport) {
    problems.push({
      kind: "viewport",
      message: `${where} sets a viewport ${viewport}px wide, but the page is ${surroundings.width}px wide. Run the story at the viewport it sets.`,
    });
  }
  for (const group of alike) {
    if (group.because.kind === "viewport" && viewport === undefined) {
      problems.push({
        kind: "viewportWithoutViewport",
        message: `${where} declares ${group.values.join(", ")} alike at the story's viewport, but sets no viewport. Give it one with the viewport option.`,
      });
    }
    const strangers = group.values.filter((value) => !values.includes(value));
    if (strangers.length > 0) {
      problems.push({
        kind: "notAnOption",
        message: `${where} declares ${strangers.join(", ")} alike, but ${strangers.length === 1 ? "it is" : "they are"} not among the values it shows: ${values.join(", ")}.`,
      });
    }
  }
  const shown = (value: string) => JSON.stringify(observed[values.indexOf(value)]);
  const inForceGroups = alike.filter(({ because }) => inForce(because, surroundings));
  const joined = joinedBy(inForceGroups);
  const unexplained = pairsOf(values).filter(
    ([value, other]) => shown(value) === shown(other) && joined(value) !== joined(other),
  );
  if (unexplained.length > 0 && observed.length === values.length) {
    const sets = [...new Set(unexplained.map(([value]) => shown(value)))].map(
      (look) => `{${values.filter((value) => shown(value) === look).join(", ")}}`,
    );
    problems.push({
      kind: "alike",
      message: `${where}: ${sets.join(" and ")} render alike in ${observe}, and no group in force declares them alike. Give the story the args that make each value show, or declare why.`,
    });
  }
  for (const group of inForceGroups) {
    const apart = pairsOf(group.values.filter((value) => values.includes(value))).filter(
      (pair) => shown(pair[0]) !== shown(pair[1]),
    );
    if (apart.length > 0 && observed.length === values.length) {
      problems.push({
        kind: "noLongerNeeded",
        message: `${where} declares ${group.values.join(", ")} alike ${describeBecause(group.because)}, but ${apart.map(named).join("; ")} differ in ${observe}. The group is no longer needed: remove those values from it.`,
      });
    }
  }
  return problems;
}
