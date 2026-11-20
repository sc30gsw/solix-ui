import { expect as instrumentedExpect } from "storybook/test";
import { matcherCompleted } from "#/story-records.ts";

export * from "storybook/test";

const matcherName = /^to[A-Z]/;
const modifiers = new Set(["not", "resolves", "rejects"]);

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof Reflect.get(value, "then") === "function"
  );
}

function completed(result: unknown): unknown {
  if (!isThenable(result)) {
    matcherCompleted();
    return result;
  }
  return Promise.resolve(result).then((value) => {
    matcherCompleted();
    return value;
  });
}

function isMatcher(key: string | symbol, value: unknown): value is (...args: unknown[]) => unknown {
  return (
    typeof key === "string" &&
    typeof value === "function" &&
    matcherName.test(key) &&
    !(key in Object.prototype)
  );
}

function countingItsMatchers(assertion: object): object {
  return new Proxy(assertion, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (isMatcher(key, value)) {
        return (...args: unknown[]) => completed(Reflect.apply(value, target, args));
      }
      if (typeof key === "string" && modifiers.has(key) && typeof value === "object" && value) {
        return countingItsMatchers(value);
      }
      return value;
    },
  });
}

export const expect = new Proxy(instrumentedExpect, {
  apply(target, thisArgument, args: unknown[]) {
    const assertion: unknown = Reflect.apply(target, thisArgument, args);
    return typeof assertion === "object" && assertion !== null
      ? countingItsMatchers(assertion)
      : assertion;
  },
});
