import { $PROXY, children, createRoot, untrack } from "solid-js";
import type { NoOp, Substitute } from "../../scripts/component-props.ts";

export type RecordedValue = string | number | boolean | null;

export type Played = {
  readonly prop: string;
  readonly value?: RecordedValue;
  readonly timedOut?: string;
};

export type Mount = {
  readonly component: string;
  readonly order: number;
  readonly given: readonly string[];
  readonly values: Readonly<Record<string, readonly RecordedValue[]>>;
  readonly played: Played[];
};

export type StoryRecord = { readonly substituted: boolean; readonly mounts: readonly Mount[] };

export type Substitution = {
  readonly order: number;
  readonly component: string;
  readonly prop: string;
  readonly value?: RecordedValue;
  readonly by: unknown;
};

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    recordStory: (storyId: string, record: StoryRecord) => Promise<void>;
  }
}

export type PropsRead = Readonly<
  Record<
    string,
    {
      readonly values: readonly string[];
      readonly elements: readonly string[];
      readonly substitutes: Readonly<Record<string, Substitute>>;
    }
  >
>;

type Props = Record<string, unknown>;
type Component = (props: Props) => unknown;
type Live = {
  readonly component: string;
  readonly order: number;
  readonly props: Props;
  readonly readByIt: ReadonlyMap<string, ReadonlySet<RecordedValue>>;
  readonly returned: unknown;
};

const recording: {
  live: Live[];
  read: PropsRead;
  created: number;
  substitution: Substitution | undefined;
  substituted: boolean;
} = { live: [], read: {}, created: 0, substitution: undefined, substituted: false };

function readOf(component: string) {
  const read = recording.read[component];
  if (read === undefined) {
    throw new Error(
      `${component}: the recorder wraps this component but was given no list of its props to read.`,
    );
  }
  return read;
}

function recorded(value: unknown): RecordedValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}

function substitutes(substitution: Substitution | undefined, key: string, value: unknown) {
  return (
    substitution !== undefined &&
    key === substitution.prop &&
    value !== undefined &&
    (!("value" in substitution) || recorded(value) === substitution.value)
  );
}

function seeingWhatItReads(
  props: Props,
  readByIt: Map<string, Set<RecordedValue>>,
  substitution: Substitution | undefined,
): Props {
  return new Proxy(props, {
    has: (target, key) => key !== $PROXY && Reflect.has(target, key),
    get(target, key) {
      if (key === $PROXY) return undefined;
      const value: unknown = Reflect.get(target, key);
      if (typeof key !== "string" || value === undefined) return value;
      readByIt.set(key, (readByIt.get(key) ?? new Set()).add(recorded(value)));
      if (!substitutes(substitution, key, value)) return value;
      recording.substituted = true;
      return substitution?.by;
    },
  });
}

function recordingOf(component: string, real: Component): Component {
  function recordedComponent(props: Props) {
    const order = recording.created;
    recording.created += 1;
    const readByIt = new Map<string, Set<RecordedValue>>();
    const { substitution } = recording;
    const substituting =
      substitution?.order === order && substitution.component === component
        ? substitution
        : undefined;
    const returned = real(seeingWhatItReads(props, readByIt, substituting));
    recording.live.push({ component, order, props, readByIt, returned });
    return returned;
  }
  return Object.defineProperty(recordedComponent, "name", { value: real.name });
}

function isComponent(value: unknown): value is Component {
  return typeof value === "function";
}

function wrapperOfPart(
  wrapperOf: ReadonlyMap<Component, Component>,
  name: string,
  part: string,
  member: unknown,
): Component {
  const wrapper = isComponent(member) ? wrapperOf.get(member) : undefined;
  if (wrapper === undefined) {
    throw new Error(
      `${name}.${part}: the type checker gives ${name} this static part, but the library exports no component that is the function it holds, so no story can record it. Export the part from packages/core/src/index.ts.`,
    );
  }
  return wrapper;
}

export function instrumented(
  library: Readonly<Record<string, unknown>>,
  read: PropsRead,
  staticParts: Readonly<Record<string, readonly string[]>>,
): Record<string, Component> {
  recording.read = read;
  const wrapperOf = new Map<Component, Component>();
  const wrappers: Record<string, Component> = {};
  for (const name of Object.keys(read)) {
    const real = library[name];
    if (!isComponent(real)) {
      throw new Error(
        `${name}: @solix/core exports no function by this name, so no story can record it. The list comes from scripts/component-props.ts; read it again.`,
      );
    }
    const wrapper = wrapperOf.get(real) ?? recordingOf(name, real);
    wrapperOf.set(real, wrapper);
    wrappers[name] = wrapper;
  }
  for (const [name, parts] of Object.entries(staticParts)) {
    const real = library[name];
    const wrapper = wrappers[name];
    if (!isComponent(real) || wrapper === undefined) {
      throw new Error(
        `${name}: the type checker gives this component static parts, but the recorder wraps no component by this name.`,
      );
    }
    for (const part of parts) {
      Object.assign(wrapper, {
        [part]: wrapperOfPart(wrapperOf, name, part, Reflect.get(real, part)),
      });
    }
  }
  return wrappers;
}

export function startRecording(substitution?: Substitution): void {
  recording.live = [];
  recording.created = 0;
  recording.substitution = substitution;
  recording.substituted = false;
}

export function substitutionTookPlace(): boolean {
  return recording.substituted;
}

function nodesOf(returned: unknown): unknown[] {
  return createRoot((dispose) => {
    const resolved = children(() => returned as never).toArray();
    dispose();
    return resolved;
  });
}

function shownIn(canvas: Element, { returned }: Live): boolean {
  return nodesOf(returned).some(
    (node) => node instanceof Node && node.isConnected && canvas.contains(node),
  );
}

function atTheEnd(props: Props, name: string): unknown {
  return untrack(() => props[name]);
}

function givenOf({ component, props, readByIt }: Live): string[] {
  const { elements } = readOf(component);
  return Object.keys(props).filter(
    (name) =>
      readByIt.has(name) || (!elements.includes(name) && atTheEnd(props, name) !== undefined),
  );
}

function valuesOf({ component, props, readByIt }: Live): Record<string, RecordedValue[]> {
  return Object.fromEntries(
    readOf(component).values.flatMap((name) => {
      const atEnd = atTheEnd(props, name);
      const values = new Set(readByIt.get(name));
      if (atEnd !== undefined) values.add(recorded(atEnd));
      return values.size === 0 ? [] : [[name, [...values]]];
    }),
  );
}

export function takeRecord(canvas: Element): Mount[] {
  const mounts = recording.live
    .filter((live) => shownIn(canvas, live))
    .map((live) => ({
      component: live.component,
      order: live.order,
      given: givenOf(live),
      values: valuesOf(live),
      played: [],
    }));
  recording.live = [];
  return mounts;
}

function noOpFrom(noOp: NoOp): unknown {
  if ("members" in noOp) {
    return Object.fromEntries(
      Object.entries(noOp.members).map(([name, member]) => [name, noOpFrom(member)]),
    );
  }
  const returned = noOp.returns === "nothing" ? undefined : noOpFrom(noOp.returns);
  return () => returned;
}

function another(values: readonly RecordedValue[], value: RecordedValue): RecordedValue {
  const at = values.indexOf(value);
  return values[(at + 1) % values.length] ?? null;
}

export function substitutionsOf({ component, order, given, values }: Mount): Substitution[] {
  const { substitutes } = readOf(component);
  return given.flatMap((prop): Substitution[] => {
    const substitute = substitutes[prop];
    if (substitute === undefined) return [];
    if (substitute.kind === "null") return [{ order, component, prop, by: null }];
    if (substitute.kind === "no-op") {
      return [{ order, component, prop, by: noOpFrom(substitute.noOp) }];
    }
    return (values[prop] ?? [])
      .filter((value) => substitute.values.includes(value as never))
      .map((value) => ({ order, component, prop, value, by: another(substitute.values, value) }));
  });
}
