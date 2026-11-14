export function browserApi<O extends object, K extends keyof O>(
  owner: O | null | undefined,
  name: K,
): O[K] | undefined {
  return owner ? Reflect.get(owner, name) : undefined;
}

function isSecurityError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && Reflect.get(error, "name") === "SecurityError"
  );
}

export function whereAllowed<R>(run: () => R, blocked: () => R, cleanup: () => void): R {
  try {
    return run();
  } catch (error) {
    cleanup();
    if (isSecurityError(error)) return blocked();
    throw error;
  }
}
