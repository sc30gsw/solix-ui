export const consoleProblemsKey = "__solixConsoleProblems";

export const recorderDidNotRun = "the console recorder did not run before the page's own scripts";

export type ExpectedReport = string | RegExp;

export function isExpected(problem: string, expected: ExpectedReport | undefined): boolean {
  if (expected === undefined) return false;
  return typeof expected === "string" ? problem === expected : expected.test(problem);
}

export function recordConsoleProblems(key: string): void {
  const problems: string[] = [];
  const sink = window.console;
  const printed = (data: unknown[]): string => {
    try {
      return data.map(String).join(" ");
    } catch {
      return "<unprintable>";
    }
  };
  for (const [method, type] of [
    ["error", "error"],
    ["warn", "warning"],
  ] as const) {
    const original = sink[method];
    sink[method] = (...data: unknown[]) => {
      try {
        problems.push(`${type}: ${printed(data)}`);
      } finally {
        original.apply(sink, data);
      }
    };
  }
  window.addEventListener(
    "error",
    (event) => {
      problems.push(
        event.target instanceof Element
          ? `error: ${event.target.outerHTML} did not load`
          : `pageerror: ${printed([event.error ?? event.message])}`,
      );
    },
    true,
  );
  window.addEventListener("unhandledrejection", (event) => {
    problems.push(`pageerror: ${printed([event.reason])}`);
  });
  document.addEventListener("securitypolicyviolation", (event) => {
    problems.push(`error: ${event.violatedDirective} refused ${event.blockedURI || "inline"}`);
  });
  Object.defineProperty(window, key, { value: problems });
}

export function recordedConsoleProblems([key, notRecorded]: [string, string]): string[] {
  const kept: unknown = Reflect.get(window, key);
  return Array.isArray(kept) ? kept.map(String) : [notRecorded];
}
