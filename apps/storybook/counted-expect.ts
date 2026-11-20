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

function completed(subject: unknown, result: unknown): unknown {
  if (!isThenable(result)) {
    matcherCompleted(subject);
    return result;
  }
  return Promise.resolve(result).then((value) => {
    matcherCompleted(subject);
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

function countingItsMatchers(assertion: object, subject: unknown): object {
  return new Proxy(assertion, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (isMatcher(key, value)) {
        return (...args: unknown[]) => completed(subject, Reflect.apply(value, target, args));
      }
      if (typeof key === "string" && modifiers.has(key) && typeof value === "object" && value) {
        return countingItsMatchers(value, subject);
      }
      return value;
    },
  });
}

export const expect = new Proxy(instrumentedExpect, {
  apply(target, thisArgument, args: unknown[]) {
    const assertion: unknown = Reflect.apply(target, thisArgument, args);
    return typeof assertion === "object" && assertion !== null
      ? countingItsMatchers(assertion, args[0])
      : assertion;
  },
});
