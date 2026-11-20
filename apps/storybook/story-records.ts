import { onCleanup, untrack } from "solid-js";

export type RecordedValue = string | number | boolean | null;

export type Mount = {
  readonly component: string;
  readonly props: Readonly<Record<string, RecordedValue>>;
  readonly mountedWhenPlayEnded: boolean;
};

export type StoryRecord = { readonly played: boolean; readonly mounts: readonly Mount[] };

type Live = { component: string; props: Record<string, RecordedValue>; mounted: boolean };
type Component = (props: Record<string, unknown>) => unknown;

const childrenProp = "children";
const recording: { live: Live[]; playEnded: Set<Live> | undefined } = {
  live: [],
  playEnded: undefined,
};

function recorded(value: unknown): RecordedValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "function") return "[function]";
  if (typeof value === "object" && value !== null) return "[object]";
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}

function propsOf(props: Record<string, unknown>): Record<string, RecordedValue> {
  return untrack(() =>
    Object.fromEntries(
      Object.keys(props).flatMap((name) => {
        if (name === childrenProp) return [[name, "[object]"]];
        const value = recorded(props[name]);
        return value === undefined ? [] : [[name, value]];
      }),
    ),
  );
}

function isComponent(value: unknown): value is Component {
  return typeof value === "function";
}

function recordingOf(component: string, Real: Component): Component {
  return (props) => {
    const live: Live = { component, props: propsOf(props), mounted: true };
    recording.live.push(live);
    onCleanup(() => {
      live.mounted = false;
    });
    return Real(props);
  };
}

export function instrumented(
  library: Readonly<Record<string, unknown>>,
  components: readonly string[],
): Record<string, unknown> {
  const wrapperOf = new Map<unknown, Component>();
  for (const name of components) {
    const real = library[name];
    if (!isComponent(real)) continue;
    const recording = recordingOf(name, real);
    wrapperOf.set(
      real,
      new Proxy(recording, {
        get: (target, key) => {
          if (Object.hasOwn(target, key)) return Reflect.get(target, key);
          const member: unknown = Reflect.get(real, key);
          return wrapperOf.get(member) ?? member;
        },
      }),
    );
  }
  return Object.fromEntries(components.map((name) => [name, wrapperOf.get(library[name])]));
}

export function startRecording(): void {
  recording.live = [];
  recording.playEnded = undefined;
}

export function markPlayEnded(): void {
  recording.playEnded = new Set(recording.live.filter(({ mounted }) => mounted));
}

export function takeRecord(): StoryRecord {
  const { live, playEnded } = recording;
  return {
    played: playEnded !== undefined,
    mounts: live.map((mount) => ({
      component: mount.component,
      props: mount.props,
      mountedWhenPlayEnded: playEnded?.has(mount) ?? false,
    })),
  };
}
