import { approvedSkills, packageSkillProblems, reviewedSkillsFile } from "./package-skills.ts";

const problems = packageSkillProblems();

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `${approvedSkills().length} approved package skills are linked and hold the files whose hash ${reviewedSkillsFile} records.`,
  );
}
