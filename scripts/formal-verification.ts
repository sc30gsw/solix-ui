import { matchesGlob } from "node:path";

export const formalSkillPrefix = "verify-formal-";
export const verificationSkillPrefix = "verify-";
export const modelFilePatterns = ["**/*.tla", "**/*.cfg", "**/*.model.ts"] as const;
export const formalSkillFiles = `.agents/skills/${formalSkillPrefix}*/**`;

export type TlaTsRun = { line: string; files: string[] };

const fence = /^\s*(```|~~~)/;
const tlaTsCommand = /(?:^|[\s;&|(])(?:npx |pnpm exec |pnpm dlx |vp exec )?tla-ts(?=\s|$)(.*)$/;
const tlaTsImport = /from\s+["']tla-ts["']/;
const repositoryPath = /(?:^|\s)((?:[\w.-]+\/)*[\w.-]+\.[\w.]+)(?=\s|$)/g;

export function isModelFile(path: string): boolean {
  return modelFilePatterns.some((pattern) => matchesGlob(path, pattern));
}

export function isFormalVerificationFile(path: string): boolean {
  return isModelFile(path) || matchesGlob(path, formalSkillFiles);
}

function commandLinesOf(skill: string): string[] {
  let fenced = false;
  return skill.split("\n").filter((line) => {
    if (fence.test(line)) {
      fenced = !fenced;
      return false;
    }
    return fenced;
  });
}

export function tlaTsRunsOf(
  skill: string,
  readFile: (path: string) => string | undefined,
): TlaTsRun[] {
  return commandLinesOf(skill).flatMap((line): TlaTsRun[] => {
    const command = tlaTsCommand.exec(line);
    if (command !== null) {
      return [{ line, files: [...command[1].matchAll(repositoryPath)].map(([, path]) => path) }];
    }
    const importing = [...line.matchAll(repositoryPath)]
      .map(([, path]) => path)
      .filter((path) => tlaTsImport.test(readFile(path) ?? ""));
    return importing.length > 0 ? [{ line, files: [] }] : [];
  });
}
