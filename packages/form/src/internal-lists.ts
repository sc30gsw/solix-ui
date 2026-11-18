import { getPath, setPath } from "#/src/internal-paths.ts";
import { type ReorderPayload } from "#/src/types.ts";

export type ListOperation =
  | { kind: "insert"; item: unknown; index?: number }
  | { kind: "remove"; index: number }
  | ({ kind: "reorder" } & ReorderPayload)
  | { kind: "replace"; index: number; item: unknown };

function indexOf(segment: string): number | undefined {
  const index = Number(segment);
  return Number.isSafeInteger(index) && index >= 0 && String(index) === segment ? index : undefined;
}

function hasListIndexes(operation: ListOperation): boolean {
  const indexes = operation.kind === "reorder" ? [operation.from, operation.to] : [operation.index];
  return indexes.every((index) => index === undefined || indexOf(String(index)) !== undefined);
}

function changed(list: readonly unknown[], operation: ListOperation): readonly unknown[] {
  if (!hasListIndexes(operation)) return list;
  const copy = list.slice();
  switch (operation.kind) {
    case "insert":
      copy.splice(operation.index ?? copy.length, 0, operation.item);
      return copy;
    case "remove":
      return list.filter((_item, index) => index !== operation.index);
    case "reorder":
      copy.splice(operation.to, 0, ...copy.splice(operation.from, 1));
      return copy;
    case "replace":
      if (operation.index >= list.length) return list;
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
  return Array.isArray(list) ? setPath(path, changed(list, operation), values) : values;
}

export function isNestedUnder(key: string, path: string): boolean {
  return key.startsWith(`${path}.`);
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
  const [segment = "", ...rest] = key.slice(path.length + 1).split(".");
  const index = indexOf(segment);
  if (index === undefined) return key;
  const moved = movedIndex(index, operation);
  return moved === undefined ? undefined : [path, moved, ...rest].join(".");
}

export function moveListKeys<Value>(
  path: string,
  operation: ListOperation,
  record: Readonly<Record<string, Value>>,
): Record<string, Value> {
  const valid = hasListIndexes(operation);
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => {
      const moved = valid ? movedKey(key, path, operation) : key;
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
