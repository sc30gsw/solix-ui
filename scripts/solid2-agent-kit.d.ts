declare module "solid2-agent-kit/bin/doctor.mjs" {
  export const BANNED_DEPS: Readonly<Record<string, string>>;
  export function doctorFindings(target: string): { id: string; message: string }[];
}

declare module "solid2-agent-kit/bin/check.mjs" {
  export const SOURCE_FILE: RegExp;
  export function walk(directory: string): Generator<string>;
}
