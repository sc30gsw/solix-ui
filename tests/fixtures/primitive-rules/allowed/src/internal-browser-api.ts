export function whereAllowed<R>(run: () => R, blocked: () => R): R {
  try {
    return run();
  } catch {
    return blocked();
  }
}
