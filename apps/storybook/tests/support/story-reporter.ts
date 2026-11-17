import { writeFileSync } from "node:fs";
import type { Reporter, TestCase } from "vite-plus/test/node";

export const storyReportVariable = "SOLIX_STORY_REPORT";

export type ReportedStory = { title: string; status: string; failureMessages: string[] };

export default class StoryReporter implements Reporter {
  private readonly stories: ReportedStory[] = [];

  onTestCaseResult(testCase: TestCase): void {
    const result = testCase.result();
    this.stories.push({
      title: testCase.name,
      status: result.state,
      failureMessages: (result.errors ?? []).map(({ message, stack }) =>
        [message, stack ?? ""].join("\n"),
      ),
    });
  }

  onTestRunEnd(): void {
    const file = process.env[storyReportVariable];
    if (file === undefined) throw new Error(`Set ${storyReportVariable} to the report's path.`);
    writeFileSync(file, JSON.stringify({ stories: this.stories }));
  }
}
