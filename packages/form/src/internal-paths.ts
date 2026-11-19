export type PathSegments = readonly [string, ...string[]];

const unsafeSegments: readonly string[] = ["__proto__"] as const;

const lengthKey = "length";

const longestList = 2 ** 32 - 1;

export function splitPath(path: unknown): PathSegments | undefined {
  if (typeof path !== "string") return undefined;
  const [first = "", ...rest] = path.split(".");
  const segments: PathSegments = [first, ...rest];
  return segments.some((segment) => unsafeSegments.includes(segment)) ? undefined : segments;
}

export function isIndexSegment(segment: string): boolean {
  const index = Number(segment);
  return Number.isSafeInteger(index) && index >= 0 && String(index) === segment;
}

export function isNestedUnder(key: string, path: string): boolean {
  return key.startsWith(`${path}.`);
}

export function isAtOrUnder(key: string, path: string): boolean {
  return key === path || isNestedUnder(key, path);
}

export function withIndexesAs(path: string, marker: string): string | undefined {
  return splitPath(path)
    ?.map((segment) => (isIndexSegment(segment) ? marker : segment))
    .join(".");
}

export function isContainer(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

export function childOf(container: unknown, key: PropertyKey): unknown {
  if (container === null || container === undefined) return undefined;
  const boxed: object = Object(container);
  return Object.hasOwn(boxed, key) ? Reflect.get(boxed, key) : undefined;
}

export function getPath(path: unknown, values: unknown): unknown {
  const segments = splitPath(path);
  if (segments === undefined || !isContainer(values)) return undefined;
  return segments.reduce<unknown>(
    (current, segment) =>
      current === null || current === undefined ? current : childOf(current, segment),
    values,
  );
}

function put(target: object, key: PropertyKey, value: unknown): void {
  if (Array.isArray(target)) {
    Reflect.set(target, key, value);
    return;
  }
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

function isListLength(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= longestList;
}

function withEntry(target: object, key: string, value: unknown): object {
  if (Array.isArray(target) && key === lengthKey && !isListLength(value)) return target;
  if (Object.hasOwn(target, key) && Object.is(Reflect.get(target, key), value)) return target;
  const copy = copyOf(target);
  put(copy, key, value);
  return copy;
}

function rewritten(target: object, segments: PathSegments, depth: number, value: unknown): object {
  const key = segments.at(depth) ?? "";
  if (depth === segments.length - 1) return withEntry(target, key, value);
  const child = childOf(target, key);
  if (!isContainer(child)) return target;
  const updated = rewritten(child, segments, depth + 1, value);
  return updated === child ? target : withEntry(target, key, updated);
}

export function setPath<Values>(path: unknown, value: unknown, values: Values): Values {
  const segments = splitPath(path);
  if (segments === undefined || !isContainer(values)) return values;
  return rewritten(values, segments, 0, value) as Values;
}
