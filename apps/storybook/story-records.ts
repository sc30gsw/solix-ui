import { children, untrack } from "solid-js";
import { expect } from "storybook/test";

export type RecordedValue = string | number | boolean | null;

export type Mount = {
  readonly component: string;
  readonly props: Readonly<Record<string, RecordedValue>>;
  readonly played: boolean;
};

export type StoryRecord = { readonly mounts: readonly Mount[] };

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    recordStory: (storyId: string, record: StoryRecord) => Promise<void>;
  }
}

export type ValuesRead = Readonly<Record<string, readonly string[]>>;

type Props = Record<string, unknown>;
type Component = (props: Props) => unknown;
type Live = {
  readonly component: string;
  readonly props: Props;
  readonly nodes: () => unknown[];
  readonly assertionsAtMount: number;
};

const given = "[given]";
const recording: { live: Live[]; valuesRead: ValuesRead } = { live: [], valuesRead: {} };

function assertionsSoFar(): number {
  return expect.getState().assertionCalls;
}

function recorded(value: unknown): RecordedValue | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}

function valueOf(props: Props, name: string): RecordedValue | undefined {
  try {
    return recorded(untrack(() => props[name]));
  } catch {
    return undefined;
  }
}

function givenUnread(props: Props, name: string): RecordedValue | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(props, name);
  return descriptor && "value" in descriptor && descriptor.value === undefined ? undefined : given;
}

function propsOf(props: Props, read: ReadonlySet<string>): Record<string, RecordedValue> {
  return Object.fromEntries(
    Object.keys(props).flatMap((name) => {
      const value = read.has(name) ? valueOf(props, name) : givenUnread(props, name);
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

function recordingOf(component: string, real: Component): Component {
  return function recordedComponent(props: Props) {
    const nodes = children(() => real(props) as never);
    recording.live.push({
      component,
      props,
      nodes: () => nodes.toArray(),
      assertionsAtMount: assertionsSoFar(),
    });
    return nodes;
  };
}

function isComponent(value: unknown): value is Component {
  return typeof value === "function";
}

export function instrumented(
  library: Readonly<Record<string, unknown>>,
  valuesRead: ValuesRead,
  staticParts: Readonly<Record<string, readonly string[]>>,
): Record<string, Component> {
  recording.valuesRead = valuesRead;
  const wrapperOf = new Map<Component, Component>();
  for (const name of Object.keys(valuesRead)) {
    const real = library[name];
    if (!isComponent(real)) {
      throw new Error(
        `${name}: @solix/core exports no function by this name, so no story can record it. The list comes from scripts/component-props.ts; read it again.`,
      );
    }
    wrapperOf.set(real, recordingOf(name, real));
  }
  const wrappers = Object.fromEntries(
    Object.keys(valuesRead).flatMap((name) => {
      const real = library[name];
      const wrapper = isComponent(real) ? wrapperOf.get(real) : undefined;
      return wrapper ? [[name, wrapper]] : [];
    }),
  );
  for (const [name, parts] of Object.entries(staticParts)) {
    const real = library[name] as Props;
    for (const part of parts) {
      const member = real[part];
      if (!isComponent(member)) {
        throw new Error(
          `${name}.${part}: the type checker gives ${name} this static part, but the library's ${name} holds no function there.`,
        );
      }
      Object.assign(wrappers[name] ?? {}, { [part]: wrapperOf.get(member) ?? member });
    }
  }
  return wrappers;
}

export function startRecording(): void {
  recording.live = [];
}

function insideThe(canvas: Element): (node: unknown) => boolean {
  return (node) => node instanceof Node && node.isConnected && canvas.contains(node);
}

export function takeRecord(canvas: Element): StoryRecord {
  const assertions = assertionsSoFar();
  const mounts = recording.live
    .filter(({ nodes }) => nodes().some(insideThe(canvas)))
    .map(({ component, props, assertionsAtMount }) => ({
      component,
      props: propsOf(props, new Set(recording.valuesRead[component])),
      played: assertions > assertionsAtMount,
    }));
  recording.live = [];
  return { mounts };
}
