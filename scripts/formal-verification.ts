import { matchesGlob } from "node:path";

export const verificationSkillPrefix = "verify-";
export const formalSkillPrefix = `${verificationSkillPrefix}formal-`;
export const modelFilePatterns = ["**/*.tla", "**/*.cfg", "**/*.model.ts"] as const;
export const formalSkillFiles = `.agents/skills/${formalSkillPrefix}*/**`;

export function isModelFile(path: string): boolean {
  return modelFilePatterns.some((pattern) => matchesGlob(path, pattern));
}

export function isFormalVerificationFile(path: string): boolean {
  return isModelFile(path) || matchesGlob(path, formalSkillFiles);
}
