import { children, createRoot, DEV, getOwner, untrack } from "solid-js";
import { followThePlayPhase } from "#/play-phase.ts";

export type RecordedValue = string | number | boolean | null;

export type Mount = {
  readonly component: string;
  readonly given: readonly string[];
  readonly values: Readonly<Record<string, readonly RecordedValue[]>>;
  readonly played: boolean;
};

export type StoryRecord = { readonly mounts: readonly Mount[] };

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    recordStory: (storyId: string, record: StoryRecord) => Promise<void>;
  }
}

export type PropsRead = Readonly<
  Record<string, { readonly values: readonly string[]; readonly elements: readonly string[] }>
>;

type Props = Record<string, unknown>;
type Component = (props: Props) => unknown;
type Owner = NonNullable<ReturnType<typeof getOwner>>;
type Live = {
  readonly component: string;
  readonly props: Props;
  readonly readByIt: ReadonlyMap<string, ReadonlySet<RecordedValue>>;
  readonly owner: Owner | null;
  readonly returned: unknown;
  readonly matchersAtMount: number;
};

const recording: {
  live: Live[];
  read: PropsRead;
  playing: boolean;
  matchers: number;
  matchersWhenThePlayEnded: number | undefined;
} = { live: [], read: {}, playing: false, matchers: 0, matchersWhenThePlayEnded: undefined };

const createdUnder = new WeakMap<Node, Owner>();

const nodeFactories: readonly {
  readonly on: object;
  readonly name: string;
  readonly deep: (args: readonly unknown[]) => boolean;
}[] = [
  { on: Document.prototype, name: "createElement", deep: () => false },
  { on: Document.prototype, name: "createElementNS", deep: () => false },
  { on: Document.prototype, name: "createTextNode", deep: () => false },
  { on: Document.prototype, name: "createComment", deep: () => false },
  { on: Document.prototype, name: "createDocumentFragment", deep: () => false },
  { on: Document.prototype, name: "importNode", deep: (args) => args[1] === true },
  { on: Node.prototype, name: "cloneNode", deep: (args) => args[0] === true },
];

function ownerTree() {
  if (DEV === undefined) {
    throw new Error(
      "Solid's development build is not loaded in the stories project, so the recorder cannot tell which component created a node. The stories run on the development build; read the stories project's resolve conditions again.",
    );
  }
  return DEV;
}

function markCreated(node: unknown, deep: boolean): void {
  const owner = getOwner();
  if (owner === null || !(node instanceof Node)) return;
  createdUnder.set(node, owner);
  if (!deep) return;
  const walker = document.createTreeWalker(node);
  for (let inside = walker.nextNode(); inside !== null; inside = walker.nextNode()) {
    createdUnder.set(inside, owner);
  }
}

function recordNodeCreation(): void {
  for (const { on, name, deep } of nodeFactories) {
    const original: unknown = Reflect.get(on, name);
    if (typeof original !== "function") {
      throw new Error(
        `${name}: the browser gives no such function, so the recorder cannot tell which component created a node. Read the DOM factories Solid's web runtime calls again.`,
      );
    }
    Object.defineProperty(on, name, {
      configurable: true,
      writable: true,
      value: function created(this: unknown, ...args: unknown[]) {
        const node: unknown = Reflect.apply(original, this, args);
        markCreated(node, deep(args));
        return node;
      },
    });
  }
}

function startThePlay(): void {
  recording.playing = true;
}

function endThePlay(): void {
  recording.playing = false;
  recording.matchersWhenThePlayEnded = recording.matchers;
}

export function matcherCompleted(): void {
  if (recording.playing) recording.matchers += 1;
}

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

function seeingWhatItReads(props: Props, readByIt: Map<string, Set<RecordedValue>>): Props {
  return new Proxy(props, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (typeof key === "string" && value !== undefined) {
        readByIt.set(key, (readByIt.get(key) ?? new Set()).add(recorded(value)));
      }
      return value;
    },
  });
}

function recordingOf(component: string, real: Component): Component {
  function recordedComponent(props: Props) {
    const readByIt = new Map<string, Set<RecordedValue>>();
    const returned = real(seeingWhatItReads(props, readByIt));
    recording.live.push({
      component,
      props,
      readByIt,
      owner: getOwner(),
      returned,
      matchersAtMount: recording.matchers,
    });
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
  ownerTree();
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
  recordNodeCreation();
  followThePlayPhase({ started: startThePlay, ended: endThePlay });
  return wrappers;
}

export function startRecording(): void {
  recording.live = [];
  recording.playing = false;
  recording.matchersWhenThePlayEnded = undefined;
}

function nodesOf(returned: unknown): unknown[] {
  return createRoot((dispose) => {
    const resolved = children(() => returned as never).toArray();
    dispose();
    return resolved;
  });
}

function isUnder(node: Node, owner: Owner): boolean {
  const tree = ownerTree();
  for (let at = createdUnder.get(node) ?? null; at !== null; at = tree.getParent(at)) {
    if (at === owner) return true;
  }
  return false;
}

function shownIn(canvas: Element, { owner, returned }: Live): boolean {
  return (
    owner !== null &&
    nodesOf(returned).some(
      (node) =>
        node instanceof Node && node.isConnected && canvas.contains(node) && isUnder(node, owner),
    )
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

export function takeRecord(canvas: Element): StoryRecord {
  const playEnded = recording.matchersWhenThePlayEnded;
  const mounts = recording.live
    .filter((live) => shownIn(canvas, live))
    .map((live) => ({
      component: live.component,
      given: givenOf(live),
      values: valuesOf(live),
      played: playEnded !== undefined && playEnded > live.matchersAtMount,
    }));
  recording.live = [];
  return { mounts };
}
