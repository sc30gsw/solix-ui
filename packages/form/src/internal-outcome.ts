export function isThenable<Value>(value: Value | PromiseLike<Value>): value is PromiseLike<Value> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof Reflect.get(value, "then") === "function"
  );
}

function isNow<Value>(value: Value | PromiseLike<Value>): value is Value {
  return !isThenable(value);
}

export function thenOrNow<Value, Result>(
  value: Value | PromiseLike<Value>,
  next: (value: Value) => Result,
): Result | Promise<Result> {
  return isThenable(value) ? Promise.resolve(value).then(next) : next(value);
}

export function allOrNow<Value, Result>(
  values: readonly (Value | PromiseLike<Value>)[],
  next: (values: Value[]) => Result,
): Result | Promise<Result> {
  const now = values.filter(isNow);
  return now.length === values.length ? next(now) : Promise.all(values).then(next);
}
