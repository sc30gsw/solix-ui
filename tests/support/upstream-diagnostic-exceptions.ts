import type { DiagnosticCode } from "solid-js";

export type UpstreamException = {
  readonly code: DiagnosticCode;
  readonly reportedUnder: string;
  readonly package: string;
  readonly reachedThrough: string;
  readonly reason: string;
  readonly expires: string;
};

export const upstreamExceptions: readonly UpstreamException[] = [];
