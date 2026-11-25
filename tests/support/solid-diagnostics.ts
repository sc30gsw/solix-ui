import { DEV, OBSERVE, type DiagnosticCode, type DiagnosticEvent } from "solid-js";
import {
  type UpstreamException,
  upstreamExceptions,
} from "#/tests/support/upstream-diagnostic-exceptions.ts";

export type SolidDiagnostic = {
  readonly code: string;
  readonly message: string;
  readonly owner?: string;
};

export type SolidDiagnosticsGate = {
  readonly finish: () => SolidDiagnostic[];
  readonly finishDescribed: () => string[];
};

export type PrintedProblems = {
  readonly diagnostics: readonly SolidDiagnostic[];
  readonly otherLines: readonly string[];
};

const ownerSeparator = " › ";
const printedReport = /^(?:Error: )?\[([A-Z][A-Z0-9_]*)\] (.*)$/;
const ownerLine = /^\s+in (.+)$/;
const continuedLine = /^\s/;
const footerLines = ["what it means and how to fix it:", "agent repair guide:", "deeper evidence:"];

const allowedOnPurpose = new WeakSet<DiagnosticEvent>();
const testGate = { open: false };

export function solidDevelopmentBuildLoaded(): boolean {
  return OBSERVE !== undefined && DEV !== undefined;
}

export function describeSolidDiagnostic({ code, message, owner }: SolidDiagnostic): string {
  return owner === undefined ? `${code}: ${message}` : `${code}: ${message} (in ${owner})`;
}

function firstLineOf(text: string): string {
  return text.split("\n")[0] ?? "";
}

function solidDiagnosticOf({ code, message, ownerPath }: DiagnosticEvent): SolidDiagnostic {
  const first = firstLineOf(message);
  return ownerPath === undefined || ownerPath.length === 0
    ? { code, message: first }
    : { code, message: first, owner: ownerPath.join(ownerSeparator) };
}

export function isCoveredBy(exception: UpstreamException, diagnostic: SolidDiagnostic): boolean {
  return (
    exception.reportedUnder !== "" &&
    diagnostic.code === exception.code &&
    (diagnostic.owner ?? "").includes(exception.reportedUnder)
  );
}

export function isUpstream(diagnostic: SolidDiagnostic): boolean {
  return upstreamExceptions.some((exception) => isCoveredBy(exception, diagnostic));
}

function isFooter(message: string): boolean {
  return footerLines.some((footer) => message.startsWith(footer));
}

type OpenReport = { code: string; message: string; owner?: string };

export function problemsPrinted(text: string): PrintedProblems {
  const diagnostics: OpenReport[] = [];
  const otherLines: string[] = [];
  let open: OpenReport | undefined;
  for (const line of text.split("\n")) {
    const report = printedReport.exec(line);
    if (report !== null) {
      const [, code = "", message = ""] = report;
      if (isFooter(message)) {
        open = undefined;
      } else {
        open = { code, message };
        diagnostics.push(open);
      }
      continue;
    }
    const owner =
      open !== undefined && open.owner === undefined ? ownerLine.exec(line)?.[1] : undefined;
    if (open !== undefined && owner !== undefined) {
      open.owner = owner;
    } else if (open === undefined || !continuedLine.test(line)) {
      open = undefined;
      if (line.trim() !== "") otherLines.push(line);
    }
  }
  return { diagnostics, otherLines };
}

export function openSolidDiagnosticsGate(options?: {
  readonly exclusive?: boolean;
}): SolidDiagnosticsGate {
  const exclusive = options?.exclusive === true;
  if (exclusive && testGate.open) {
    throw new Error(
      "A test opened Solid's diagnostics gate while another test's gate was open. The gate reads one process-wide channel, so tests under it run one at a time.",
    );
  }
  const capture = OBSERVE?.diagnostics.capture();
  if (exclusive) testGate.open = true;
  let closed = false;
  const finish = (): SolidDiagnostic[] => {
    if (closed) return [];
    closed = true;
    if (exclusive) testGate.open = false;
    return (capture?.stop() ?? [])
      .filter((event) => !allowedOnPurpose.has(event))
      .map(solidDiagnosticOf)
      .filter((diagnostic) => !isUpstream(diagnostic));
  };
  return {
    finish,
    finishDescribed: () => finish().map(describeSolidDiagnostic),
  };
}

function allowedAmong(code: DiagnosticCode, events: readonly DiagnosticEvent[]): boolean {
  const expected = events.filter((event) => event.code === code);
  for (const event of expected) allowedOnPurpose.add(event);
  return expected.length > 0;
}

function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof Reflect.get(value, "then") === "function"
  );
}

export function expectingSolidDiagnostic<T>(
  code: DiagnosticCode,
  raise: () => T extends PromiseLike<unknown> ? never : T,
): T {
  if (!testGate.open) {
    throw new Error(
      `expectingSolidDiagnostic("${code}") was called while no test held Solid's diagnostics gate, so nothing would check what it allows.`,
    );
  }
  const capture = OBSERVE?.diagnostics.capture();
  const stop = () => allowedAmong(code, capture?.stop() ?? []);
  let returned: T;
  try {
    returned = raise();
  } catch (error) {
    stop();
    throw error;
  }
  if (isThenable(returned)) {
    stop();
    throw new Error(
      `expectingSolidDiagnostic("${code}") only wraps synchronous code; an async callback would close its capture before work after await runs.`,
    );
  }
  if (!stop()) {
    throw new Error(
      `expectingSolidDiagnostic("${code}"): what it ran raised no ${code}, so either the allowance is no longer needed or an earlier render in this process used up the one report Solid makes of it.`,
    );
  }
  return returned;
}
