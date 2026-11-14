export function sameItems<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
}

export function sameKeys<T extends object>(left: T, right: T): boolean {
  const keys = Reflect.ownKeys(left);
  return (
    keys.length === Reflect.ownKeys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && Object.is(left[key as keyof T], right[key as keyof T]),
    )
  );
}
