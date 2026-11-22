import type * as Library from "#/src/index.ts";

type LibraryExports = typeof Library;

export type ComponentName = {
  [Name in keyof LibraryExports]: Name extends Capitalize<Name>
    ? LibraryExports[Name] extends (...args: never[]) => unknown
      ? Name
      : never
    : never;
}[keyof LibraryExports];

export type ComponentPath = ComponentName | `${ComponentName}.${string}`;

export type GapSection =
  | "foundations"
  | "Box"
  | "Button"
  | "Tabs"
  | "Modal"
  | "TextInput"
  | "Disclosure"
  | "ColorSchemeScript"
  | "SolixProvider";

export type GapItem = `${GapSection} ${number}` | `step ${number}`;

export type Literal = string | number | boolean | null;

export type Props = Readonly<Record<string, unknown>>;

export type Scheme = "light" | "dark";

export type Within = { readonly provider: Props } | { readonly fieldset: "disabled" };

export type Fixture = {
  readonly component: ComponentPath;
  readonly props?: Props;
  readonly children?: string | readonly Fixture[];
  readonly within?: Within;
};

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
  readonly part: (name: string, component?: string) => HTMLElement;
  readonly parts: (name: string, component?: string) => HTMLElement[];
  readonly update: (props: Props) => void;
  readonly axe: () => Promise<string[]>;
  readonly user: SpecUser;
};

export type State = "rest" | "hover" | "pressed" | "focus-visible" | "reduced-motion";

export type DomCheck = {
  readonly by: "dom";
  readonly fixture: Fixture;
  readonly assert: (rendered: Rendered) => void | Promise<void>;
};

export type StyleCheck = {
  readonly by: "style";
  readonly fixture: Fixture;
  readonly part?: string;
  readonly of?: string;
  readonly state?: State;
  readonly scheme?: Scheme;
  readonly width?: number;
  readonly property: string;
  readonly value: string | null;
};

export type StoryCheck = {
  readonly by: "story";
  readonly stories: ComponentName;
  readonly story: string;
};

export type Check = DomCheck | StyleCheck | StoryCheck;

export type Promised =
  | { readonly kind: "prop"; readonly prop: string; readonly value?: Literal }
  | { readonly kind: "part"; readonly part: string }
  | { readonly kind: "attribute"; readonly attribute: string }
  | { readonly kind: "variable"; readonly variable: `--${string}` }
  | { readonly kind: "behaviour" }
  | { readonly kind: "default"; readonly prop: string; readonly value: Literal }
  | { readonly kind: "look"; readonly property: string };

export type Status =
  | { readonly status: "holds" }
  | { readonly status: "pending"; readonly until: GapItem };

export type SpecEntry<C extends Check = Check> = Status & {
  readonly says: string;
  readonly promise: Promised;
  readonly check: C;
  readonly ported?: string;
};

export type Spec<C extends Check = Check> = {
  readonly name: string;
  readonly entries: readonly SpecEntry<C>[];
};

export type LookSpec = Spec<StyleCheck>;

export function defineSpec(name: string, entries: readonly SpecEntry[]): Spec {
  return { name, entries };
}

export function defineLook(name: string, entries: readonly SpecEntry<StyleCheck>[]): LookSpec {
  return { name, entries };
}

export const nowHolds = "now holds: mark it holds";

export async function held(entry: SpecEntry, run: () => void | Promise<void>): Promise<void> {
  const outcome = await Promise.resolve()
    .then(run)
    .then(
      () => ({ passed: true as const }),
      (error: unknown) => ({ passed: false as const, error }),
    );
  if (entry.status === "holds") {
    if (!outcome.passed) throw outcome.error;
    return;
  }
  if (outcome.passed) {
    throw new Error(
      `${nowHolds}. "${entry.says}" is pending until ${entry.until}, and its check passes.`,
    );
  }
}

export function checksBy<By extends Check["by"]>(
  spec: Spec,
  by: By,
): SpecEntry<Extract<Check, { by: By }>>[] {
  return spec.entries.filter((entry): entry is SpecEntry<Extract<Check, { by: By }>> =>
    isBy(entry.check, by),
  );
}

function isBy<By extends Check["by"]>(check: Check, by: By): check is Extract<Check, { by: By }> {
  return check.by === by;
}

export type StyleOptions = Partial<Pick<StyleCheck, "part" | "of" | "state" | "scheme" | "width">>;

export function dom(fixture: Fixture, assert: DomCheck["assert"]): DomCheck {
  return { by: "dom", fixture, assert };
}

export function style(
  fixture: Fixture,
  property: string,
  value: string | null,
  options: StyleOptions = {},
): StyleCheck {
  return { by: "style", fixture, property, value, ...options };
}

export function story(stories: ComponentName, name: string): StoryCheck {
  return { by: "story", stories, story: name };
}
