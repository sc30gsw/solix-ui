import {
  getPath,
  isIndexSegment,
  isListIndex,
  isNestedUnder,
  joinPath,
  setPath,
  splitPath,
} from "#/src/internal-paths.ts";
import { type ReorderPayload } from "#/src/types.ts";

export type ListOperation =
  | { kind: "insert"; item: unknown; index?: number }
  | { kind: "remove"; index: number }
  | ({ kind: "reorder" } & ReorderPayload)
  | { kind: "replace"; index: number; item: unknown };

function listIndexOf(segment: string): number | undefined {
  return isIndexSegment(segment) ? Number(segment) : undefined;
}

function inRange(operation: ListOperation, length: number): ListOperation | undefined {
  switch (operation.kind) {
    case "insert":
      return isListIndex(operation.index ?? length)
        ? {
            kind: "insert",
            item: operation.item,
            index: Math.min(operation.index ?? length, length),
          }
        : undefined;
    case "remove":
    case "replace":
      return isListIndex(operation.index) && operation.index < length ? operation : undefined;
    case "reorder":
      return isListIndex(operation.from) && operation.from < length && isListIndex(operation.to)
        ? { kind: "reorder", from: operation.from, to: Math.min(operation.to, length - 1) }
        : undefined;
  }
}

function reordered(list: readonly unknown[], from: number, to: number): unknown[] {
  const copy = list.slice();
  if (from < to) copy.copyWithin(from, from + 1, to + 1);
  else copy.copyWithin(to + 1, to, from);
  if (Object.hasOwn(list, from)) copy[to] = list[from];
  else Reflect.deleteProperty(copy, to);
  return copy;
}

function changed(list: readonly unknown[], operation: ListOperation): readonly unknown[] {
  const copy = list.slice();
  switch (operation.kind) {
    case "insert":
      copy.splice(operation.index ?? copy.length, 0, operation.item);
      return copy;
    case "remove":
      copy.splice(operation.index, 1);
      return copy;
    case "reorder":
      return reordered(list, operation.from, operation.to);
    case "replace":
      copy[operation.index] = operation.item;
      return copy;
  }
}

export function changeListAt<Values>(
  path: string,
  operation: ListOperation,
  values: Values,
): Values {
  const list = getPath(path, values);
  if (!Array.isArray(list)) return values;
  const resolved = inRange(operation, list.length);
  return resolved === undefined ? values : setPath(path, changed(list, resolved), values);
}

function movedIndex(index: number, operation: ListOperation): number | undefined {
  switch (operation.kind) {
    case "insert":
      return operation.index === undefined || index < operation.index ? index : index + 1;
    case "remove":
      if (index === operation.index) return undefined;
      return index > operation.index ? index - 1 : index;
    case "reorder":
      if (index === operation.from) return operation.to;
      if (index < Math.min(operation.from, operation.to)) return index;
      if (index > Math.max(operation.from, operation.to)) return index;
      return operation.from < operation.to ? index - 1 : index + 1;
    case "replace":
      return index;
  }
}

function movedKey(key: string, path: string, operation: ListOperation): string | undefined {
  if (!isNestedUnder(key, path)) return key;
  const [segment, ...rest] = splitPath(key.slice(path.length + 1)) ?? [""];
  const index = listIndexOf(segment);
  if (index === undefined) return key;
  const moved = movedIndex(index, operation);
  return moved === undefined ? undefined : rest.reduce(joinPath, joinPath(path, String(moved)));
}

export function moveListKeys<Value>(
  path: string,
  operation: ListOperation,
  record: Readonly<Record<string, Value>>,
  length: number,
): Record<string, Value> {
  const resolved = inRange(operation, length);
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => {
      const moved = resolved === undefined ? key : movedKey(key, path, resolved);
      return moved === undefined ? [] : [[moved, value]];
    }),
  );
}

export function clearListKeys<Value>(
  path: string,
  record: Readonly<Record<string, Value>>,
): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !isNestedUnder(key, path)));
}
