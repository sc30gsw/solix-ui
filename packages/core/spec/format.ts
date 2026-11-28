import type { ColorSchemeOptions } from "#/src/color-schemes.ts";
import type * as Library from "#/src/index.ts";
import type { ComponentName, GapItem } from "#/spec/gaps.ts";
import { breakpoints } from "#/spec/look/reference.ts";
import type { SharedPromise } from "#/spec/shared.ts";

export type { ComponentName, GapItem } from "#/spec/gaps.ts";

type Keys<T> = T extends unknown ? keyof T : never;

export type OneOf<T, All = T> = T extends unknown
  ? T & { readonly [K in Exclude<Keys<All>, keyof T>]?: never }
  : never;

export type ComponentPath = ComponentName | `${ComponentName}.${string}`;

export type Props = { readonly [name: string]: unknown };

export type Scheme = "light" | "dark";

export type State = "rest" | "hover" | "pressed" | "focus-visible";

export type Address = { readonly of?: ComponentPath; readonly part: string };

export type Attribute = { readonly attribute: string; readonly value: string };

type Exports = typeof Library;

type ExportAt<C extends ComponentPath> =
  C extends `${infer Name extends ComponentName}.${infer Member}`
    ? Member extends keyof Exports[Name]
      ? Exports[Name][Member]
      : undefined
    : C extends ComponentName
      ? Exports[C]
      : undefined;

export type PropsOf<C extends ComponentPath> =
  ExportAt<C> extends (props: infer Given) => unknown ? Omit<Given, "children"> : Props;

type Given<Known> = OneOf<{ readonly props?: Known } | { readonly unbuilt: Props }>;

export type Node<C extends ComponentPath> = Given<PropsOf<C>> & {
  readonly component: C;
  readonly children?: Children;
};

type AnyNode<C extends ComponentPath = ComponentPath> = C extends unknown ? Node<C> : never;

export type Children = string | readonly AnyNode[];

type ProviderProps = Omit<PropsOf<"SolixProvider">, "getRootElement">;

type SchemeKey = keyof ColorSchemeOptions | "colorSchemeManager";

type SchemeFree<P> = P & { readonly [K in SchemeKey]?: never };

export type Fixture<C extends ComponentPath = ComponentPath> = AnyNode<C> & {
  readonly provider?: Given<ProviderProps>;
};

export type LookFixture<C extends ComponentPath = ComponentPath> = AnyNode<C> & {
  readonly provider?: OneOf<
    { readonly props?: SchemeFree<ProviderProps> } | { readonly unbuilt: SchemeFree<Props> }
  >;
};

export type Reference = {
  readonly props: readonly string[];
  readonly parts: readonly string[];
  readonly variables: readonly `--${string}`[];
  readonly exports: readonly string[];
};

export type About<R extends Reference> =
  | `prop ${R["props"][number]}`
  | `part ${R["parts"][number]}`
  | `variable ${R["variables"][number]}`
  | `export ${R["exports"][number]}`
  | `shared ${SharedPromise}`
  | "every part";

export type Pinned = `${string}: ${string}`;

export type Missing = OneOf<{ readonly export: ComponentPath } | Address | Attribute>;

export type Pending<F> = { readonly until: GapItem; readonly fails: F };

export type FunctionStatus = "holds" | Pending<Pinned | Missing>;

export type LookStatus = "holds" | Pending<"differs" | Missing>;

export type Rendered = {
  readonly root: HTMLElement;
  readonly container: HTMLElement;
  readonly exports: Readonly<Record<string, unknown>>;
  readonly at: (address: Address) => HTMLElement;
  readonly all: (address: Address) => readonly HTMLElement[];
  readonly parts: (of?: ComponentPath) => readonly string[];
  readonly classOf: (address: Address) => string;
  readonly update: (props: Props) => void;
  readonly axe: () => Promise<readonly string[]>;
};

export type FunctionEntry<R extends Reference = Reference> = {
  readonly says: string;
  readonly about: About<R>;
  readonly fixture: Fixture;
  readonly assert: (rendered: Rendered) => void | Promise<void>;
  readonly status: FunctionStatus;
  readonly decision?: `Q${number}`;
};

export type FunctionSpec<R extends Reference = Reference> = {
  readonly reference: R;
  readonly entries: readonly FunctionEntry<R>[];
};

export const lookProperties = {
  "background-color": "colour",
  "background-image": "text",
  "border-end-end-radius": "text",
  "border-top-color": "colour",
  "border-top-left-radius": "text",
  color: "colour",
  cursor: "text",
  "font-size": "text",
  "font-weight": "text",
  height: "text",
  "justify-content": "text",
  opacity: "text",
  "outline-color": "colour",
  "outline-offset": "text",
  "outline-style": "text",
  "outline-width": "text",
  "padding-inline-start": "text",
  "pointer-events": "text",
  transform: "text",
  "transition-duration": "text",
  "transition-property": "text",
} as const satisfies Readonly<Record<string, "colour" | "text">>;

export type LookProperty = keyof typeof lookProperties;

export type Breakpoint = keyof typeof breakpoints;

export type LookEntry = {
  readonly fixture: LookFixture;
  readonly at?: Address;
  readonly requires?: Attribute;
  readonly state?: State;
  readonly scheme?: Scheme;
  readonly media?: { readonly width?: Breakpoint; readonly reducedMotion?: true };
  readonly property: LookProperty;
  readonly value: string;
  readonly status: LookStatus;
};

export type LookSpec = readonly LookEntry[];

export class SpecError extends Error {
  override name = "SpecError";
}

export class MissingError extends Error {
  override name = "MissingError";
  readonly missing: Missing;

  constructor(missing: Missing, message: string) {
    super(message);
    this.missing = missing;
  }
}

export class LookDiffers extends Error {
  override name = "LookDiffers";
}

export const nowHolds = "now holds: mark it holds";

export function givenProps(given: { readonly props?: Props; readonly unbuilt?: Props }): Props {
  return given.props ?? given.unbuilt ?? {};
}

function shownValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return typeof value === "object" ? JSON.stringify(value) : undefined;
}

function described(fixture: LookFixture): string {
  const props = Object.entries(givenProps(fixture)).flatMap(([name, value]) => {
    const shown = shownValue(value);
    return shown === undefined ? [] : [`${name}=${shown}`];
  });
  const within = fixture.provider === undefined ? [] : ["in a provider"];
  return [fixture.component, ...props, ...within].join(" ");
}

export function describeLook(entry: LookEntry): string {
  const width = entry.media?.width;
  const where = [
    described(entry.fixture),
    entry.at === undefined ? "" : `${entry.at.of ?? ""} ${entry.at.part}`.trim(),
    entry.state ?? "rest",
    entry.scheme ?? "light",
    width === undefined ? "" : `${breakpoints[width]}px wide`,
    entry.media?.reducedMotion === undefined ? "" : "reduced motion",
  ].filter((part) => part !== "");
  return `${where.join(", ")}: ${entry.property} is ${entry.value}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function labelOf(pin: Pinned): string {
  return pin.slice(0, pin.indexOf(": "));
}

function sameMissing(one: Missing, other: Missing): boolean {
  return (
    one.export === other.export &&
    one.of === other.of &&
    one.part === other.part &&
    one.attribute === other.attribute &&
    one.value === other.value
  );
}

function shown(fails: Pinned | Missing | "differs"): string {
  if (typeof fails === "string") return fails;
  if (fails.export !== undefined) return `the built library exports no ${fails.export}`;
  if (fails.part !== undefined) return `${fails.of ?? "it"} renders no ${fails.part} part`;
  return `${fails.attribute}="${fails.value}" is not on the root`;
}

function failsAsPinned(fails: Pinned | Missing | "differs", error: unknown): boolean {
  if (fails === "differs") return error instanceof LookDiffers;
  if (typeof fails === "string") {
    return (
      error instanceof Error && error.name === "AssertionError" && error.message.startsWith(fails)
    );
  }
  return error instanceof MissingError && sameMissing(error.missing, fails);
}

export async function held(
  says: string,
  status: FunctionStatus | LookStatus,
  run: () => void | Promise<void>,
): Promise<void> {
  if (status !== "holds" && typeof status.fails === "string" && status.fails !== "differs") {
    if (labelOf(status.fails).trim() === "") {
      throw new SpecError(`"${says}" pins "${status.fails}", whose label before ": " is blank.`);
    }
  }
  const outcome = await Promise.resolve()
    .then(run)
    .then(
      () => ({ passed: true as const }),
      (error: unknown) => ({ passed: false as const, error }),
    );
  if (!outcome.passed && outcome.error instanceof SpecError) throw outcome.error;
  if (status === "holds") {
    if (!outcome.passed) throw outcome.error;
    return;
  }
  if (outcome.passed) {
    throw new Error(
      `${nowHolds}. "${says}" is pending until ${status.until}, and its check passes.`,
    );
  }
  if (!failsAsPinned(status.fails, outcome.error)) {
    throw new Error(
      `"${says}" is pending until ${status.until} and fails, but not with "${shown(status.fails)}": ${messageOf(outcome.error)}`,
      { cause: outcome.error },
    );
  }
}
