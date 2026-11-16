export function lookUp<O extends object, K extends keyof O>(
  owner: O | null | undefined,
  name: K,
): O[K] | undefined {
  return owner ? Reflect.get(owner, name) : undefined;
}

type Method<O, K extends keyof O> = O[K] extends ((...args: infer Args) => infer R) | undefined
  ? (...args: Args) => R
  : never;

export function browserMethod<O extends object, K extends keyof O>(
  owner: O | null | undefined,
  name: K,
): Method<O, K> | undefined {
  const method: unknown = lookUp(owner, name);
  if (typeof method !== "function") return undefined;
  return ((...args: unknown[]) => Reflect.apply(method, owner, args)) as Method<O, K>;
}
