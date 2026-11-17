export function rendersSomething(child: unknown): boolean {
  return child !== null && child !== undefined && typeof child !== "boolean" && child !== "";
}
