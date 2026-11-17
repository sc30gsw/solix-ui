import { writeFileSync } from "node:fs";
import type { Reporter, TestCase } from "vite-plus/test/node";

export const storyReportVariable = "SOLIX_STORY_REPORT";

export type ReportedStory = { id: string; status: string; messages: string[] };

export default class StoryReporter implements Reporter {
  private readonly stories: ReportedStory[] = [];

  onTestCaseResult(testCase: TestCase): void {
    const storyId: unknown = Reflect.get(testCase.meta(), "storyId");
    const result = testCase.result();
    this.stories.push({
      id: typeof storyId === "string" ? storyId : testCase.fullName,
      status: result.state,
      messages: (result.errors ?? []).map(({ message }) => message),
    });
  }

  onTestRunEnd(): void {
    const file = process.env[storyReportVariable];
    if (file === undefined) throw new Error(`Set ${storyReportVariable} to the report's path.`);
    writeFileSync(file, JSON.stringify({ stories: this.stories }));
  }
}
