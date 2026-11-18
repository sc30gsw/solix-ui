type Leaf = string | number | boolean | bigint | symbol | null | undefined;

type Shallower = [never, 0, 1, 2, 3, 4];

type Indexes<List extends readonly unknown[]> = number extends List["length"]
  ? number
  : Exclude<keyof List, keyof unknown[]>;

type Step<Key extends string | number, Value, Depth extends number> = Value extends Leaf
  ? `${Key}`
  : `${Key}` | `${Key}.${Path<Value, Shallower[Depth]>}`;

export type Path<Values, Depth extends number = 5> = [Depth] extends [never]
  ? never
  : Values extends readonly unknown[]
    ? {
        [Key in Indexes<Values>]-?: Step<Key & (string | number), Values[Key], Depth>;
      }[Indexes<Values>]
    : { [Key in keyof Values]-?: Step<Key & string, Values[Key], Depth> }[keyof Values];

type ItemAt<Values, Segment extends string> = Segment extends `${number}`
  ? Values extends readonly (infer Item)[]
    ? Item
    : never
  : never;

export type PathValue<Values, Target extends string> = Values extends unknown
  ? Target extends `${infer Head}.${infer Rest}`
    ? Head extends keyof Values
      ? PathValue<Values[Head], Rest> | (undefined extends Values[Head] ? undefined : never)
      : PathValue<ItemAt<Values, Head>, Rest>
    : Target extends keyof Values
      ? Values[Target]
      : ItemAt<Values, Target>
  : never;

export type FormPathValue<Values, Target extends string> = [PathValue<Values, Target>] extends [
  never,
]
  ? unknown
  : PathValue<Values, Target>;

export type PathSegments = readonly [string, ...string[]];

const unsafeSegments: readonly string[] = ["__proto__", "constructor", "prototype"] as const;

export function splitPath(path: unknown): PathSegments | undefined {
  if (typeof path !== "string") return undefined;
  const [first = "", ...rest] = path.split(".");
  const segments: PathSegments = [first, ...rest];
  return segments.some((segment) => unsafeSegments.includes(segment)) ? undefined : segments;
}

function isContainer(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

export function getPath(path: unknown, values: unknown): unknown {
  const segments = splitPath(path);
  if (segments === undefined || !isContainer(values)) return undefined;
  return segments.reduce<unknown>(
    (current, segment) =>
      current === null || current === undefined ? current : Reflect.get(Object(current), segment),
    values,
  );
}

function put(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function copyOf(target: object): object {
  if (Array.isArray(target)) return target.slice();
  const copy: object = Object.create(Object.getPrototypeOf(target));
  for (const key of Reflect.ownKeys(target)) {
    if (Object.prototype.propertyIsEnumerable.call(target, key)) {
      put(copy, key, Reflect.get(target, key));
    }
  }
  return copy;
}

function withEntry(target: object, key: string, value: unknown): object {
  if (Object.hasOwn(target, key) && Object.is(Reflect.get(target, key), value)) return target;
  const copy = copyOf(target);
  put(copy, key, value);
  return copy;
}

function rewritten(target: object, segments: PathSegments, depth: number, value: unknown): object {
  const key = segments.at(depth) ?? "";
  if (depth === segments.length - 1) return withEntry(target, key, value);
  const child: unknown = Reflect.get(target, key);
  if (!isContainer(child)) return target;
  const updated = rewritten(child, segments, depth + 1, value);
  return updated === child ? target : withEntry(target, key, updated);
}

export function setPath<Values>(path: unknown, value: unknown, values: Values): Values {
  const segments = splitPath(path);
  if (segments === undefined || !isContainer(values)) return values;
  return rewritten(values, segments, 0, value) as Values;
}
