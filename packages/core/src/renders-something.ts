export function rendersSomething(resolved: unknown): boolean {
  if (Array.isArray(resolved)) return resolved.some(rendersSomething);
  return (
    resolved !== undefined &&
    resolved !== null &&
    resolved !== false &&
    resolved !== true &&
    resolved !== ""
  );
}
