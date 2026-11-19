import { writeFileSync } from "node:fs";
import type { Reporter, TestCase } from "vite-plus/test/node";
import "#/story-color-scheme.ts";

export const storyReportVariable = "SOLIX_STORY_REPORT";

export type ReportedStory = {
  id: string;
  status: string;
  messages: string[];
  colorSchemeAtTheEnd: string | undefined;
};

export default class StoryReporter implements Reporter {
  private readonly stories: ReportedStory[] = [];

  onTestCaseResult(testCase: TestCase): void {
    const meta: Record<string, unknown> = { ...testCase.meta() };
    const result = testCase.result();
    this.stories.push({
      id: typeof meta.storyId === "string" ? meta.storyId : `no story id: ${testCase.fullName}`,
      status: result.state,
      messages: (result.errors ?? []).map(({ message }) => message),
      colorSchemeAtTheEnd: testCase.meta().colorSchemeAtTheEnd,
    });
  }

  onTestRunEnd(): void {
    const file = process.env[storyReportVariable];
    if (file === undefined) throw new Error(`Set ${storyReportVariable} to the report's path.`);
    writeFileSync(file, JSON.stringify({ stories: this.stories }));
  }
}
