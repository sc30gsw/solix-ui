import type { ComponentName, GapItem } from "#/spec/gaps.ts";

export type { ComponentName, GapItem } from "#/spec/gaps.ts";

export type ComponentPath = ComponentName | `${ComponentName}.${string}`;

export type Reference = {
  readonly props: readonly string[];
  readonly parts: readonly string[];
  readonly variables: readonly `--${string}`[];
};

export type Literal = string | number | boolean | null;

export type Props = Readonly<Record<string, unknown>>;

export type Scheme = "light" | "dark";

export type Within = { readonly provider: Props };

export type Fixture = {
  readonly component: ComponentPath;
  readonly props?: Props;
  readonly children?: string | readonly Fixture[];
  readonly within?: Within;
};

export type Address = { readonly of?: ComponentPath; readonly part: string };

export type SpecUser = {
  readonly click: (element: Element) => Promise<void>;
  readonly hover: (element: Element) => Promise<void>;
  readonly tab: () => Promise<void>;
  readonly keyboard: (text: string) => Promise<void>;
};

export type Rendered = {
  readonly root: HTMLElement;
  readonly container: HTMLElement;
  readonly exports: Readonly<Record<string, unknown>>;
  readonly at: (address: Address) => HTMLElement;
  readonly all: (address: Address) => HTMLElement[];
  readonly update: (props: Props) => void;
  readonly axe: () => Promise<string[]>;
  readonly user: SpecUser;
};

export type State = "rest" | "hover" | "pressed" | "focus-visible";

export type Media = { readonly reducedMotion?: true; readonly width?: number };

export type Comparison = "colour" | "text";

export type DomCheck = {
  readonly by: "dom";
  readonly fixture: Fixture;
  readonly assert: (rendered: Rendered) => void | Promise<void>;
};

export type StyleCheck = {
  readonly by: "style";
  readonly fixture: Fixture;
  readonly at?: Address;
  readonly state?: State;
  readonly scheme?: Scheme;
  readonly media?: Media;
  readonly given?: Readonly<Record<string, string>>;
  readonly property: string;
  readonly value: string;
};

export type Check = DomCheck | StyleCheck;

export type Promised<R extends Reference> =
  | { readonly kind: "prop"; readonly prop: R["props"][number]; readonly value?: Literal }
  | { readonly kind: "default"; readonly prop: R["props"][number]; readonly value: Literal }
  | { readonly kind: "part"; readonly part: R["parts"][number] }
  | { readonly kind: "parts" }
  | { readonly kind: "variable"; readonly variable: R["variables"][number] }
  | { readonly kind: "attribute"; readonly attribute: string }
  | { readonly kind: "shared"; readonly promise: string }
  | { readonly kind: "behaviour" }
  | { readonly kind: "look"; readonly property: string };

export type Status =
  | { readonly status: "holds" }
  | { readonly status: "pending"; readonly until: GapItem; readonly failsWith: string };

export type SpecEntry<R extends Reference = Reference, C extends Check = Check> = Status & {
  readonly says: string;
  readonly promise: Promised<R>;
  readonly check: C;
  readonly decision?: `Q${number}`;
};

export type Spec<R extends Reference = Reference> = {
  readonly reference: R;
  readonly entries: readonly SpecEntry<R>[];
};

export type LookEntry = SpecEntry<Reference, StyleCheck>;

export type LookSpec = {
  readonly entries: readonly SpecEntry<Reference, StyleCheck>[];
};

export function defineReference<const R extends Reference>(reference: R): R {
  return reference;
}

export function defineSpec<R extends Reference>(
  reference: R,
  entries: readonly SpecEntry<R>[],
): Spec<R> {
  return { reference, entries };
}

export function defineLook(entries: readonly SpecEntry<Reference, StyleCheck>[]): LookSpec {
  return { entries };
}

export class SpecError extends Error {
  override name = "SpecError";
}

export const nowHolds = "now holds: mark it holds";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function held(entry: SpecEntry, run: () => void | Promise<void>): Promise<void> {
  const outcome = await Promise.resolve()
    .then(run)
    .then(
      () => ({ passed: true as const }),
      (error: unknown) => ({ passed: false as const, error }),
    );
  if (!outcome.passed && outcome.error instanceof SpecError) throw outcome.error;
  if (entry.status === "holds") {
    if (!outcome.passed) throw outcome.error;
    return;
  }
  if (outcome.passed) {
    throw new Error(
      `${nowHolds}. "${entry.says}" is pending until ${entry.until}, and its check passes.`,
    );
  }
  if (!messageOf(outcome.error).includes(entry.failsWith)) {
    throw new Error(
      `"${entry.says}" is pending until ${entry.until} and fails, but not with "${entry.failsWith}": ${messageOf(outcome.error)}`,
      { cause: outcome.error },
    );
  }
}

export function dom(fixture: Fixture, assert: DomCheck["assert"]): DomCheck {
  return { by: "dom", fixture, assert };
}

export type StyleOptions = Omit<StyleCheck, "by" | "fixture" | "property" | "value">;

export function style(
  fixture: Fixture,
  property: string,
  value: string,
  options: StyleOptions = {},
): StyleCheck {
  return { by: "style", fixture, property, value, ...options };
}

export function differs(check: Pick<StyleCheck, "property" | "value">): string {
  return `${check.property}: expected ${check.value}`;
}

const describedTypes = new Set(["string", "number", "boolean"]);

function described(fixture: Fixture): string {
  const props = Object.entries(fixture.props ?? {})
    .filter(([, value]) => describedTypes.has(typeof value))
    .map(([name, value]) => `${name}=${String(value)}`);
  const within = Object.keys(fixture.within ?? {}).map((wrapper) => `in a ${wrapper}`);
  return [fixture.component, ...props, ...within].join(" ");
}

export type LookOptions = { readonly until?: GapItem; readonly failsWith?: string };

export function lookEntry(
  check: StyleCheck,
  options: LookOptions = {},
): SpecEntry<Reference, StyleCheck> {
  const where = [
    described(check.fixture),
    check.at === undefined ? "" : `${check.at.of ?? ""} ${check.at.part}`.trim(),
    check.state ?? "rest",
    check.scheme ?? "light",
    check.media?.width === undefined ? "" : `${check.media.width}px wide`,
    check.media?.reducedMotion === undefined ? "" : "reduced motion",
  ].filter((part) => part !== "");
  const says = `${where.join(", ")}: ${check.property} is ${check.value}`;
  const promise = { kind: "look", property: check.property } as const;
  return options.until === undefined
    ? { says, promise, check, status: "holds" }
    : {
        says,
        promise,
        check,
        status: "pending",
        until: options.until,
        failsWith: options.failsWith ?? differs(check),
      };
}
