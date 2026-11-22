import { matchesGlob } from "node:path";

import { formalSkillPrefix } from "#/scripts/verification-skills.ts";

export const modelFilePatterns = [
  "**/*.tla",
  "**/*.cfg",
  "**/*.model.ts",
  "**/*.model.test.{ts,tsx}",
] as const;
export const formalSkillFiles = `.agents/skills/${formalSkillPrefix}*/**`;

export function isModelFile(path: string): boolean {
  return modelFilePatterns.some((pattern) => matchesGlob(path, pattern));
}

export function isFormalVerificationFile(path: string): boolean {
  return isModelFile(path) || matchesGlob(path, formalSkillFiles);
}
