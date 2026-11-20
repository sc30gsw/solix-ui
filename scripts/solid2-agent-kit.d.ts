declare module "solid2-agent-kit/bin/doctor.mjs" {
  export type Finding = { id: string; message: string };
  export const BANNED_DEPS: Readonly<Record<string, string>>;
  export function doctorFindings(target: string): Finding[];
}
