import { join } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import {
  declarationsOf,
  descendants,
  fileOf,
  firstLine,
  isFileOfPackage,
  isTypedAny,
  memberDeclarations,
  memberRead,
  nameOf,
  openProgram,
  type Program,
  ts,
  virtualFile,
} from "#/scripts/syntax.ts";
import { located } from "#/tests/support/primitive-rules/library.ts";
import {
  repositoryRoot,
  scriptFiles,
  scriptFilesInDotDirectories,
} from "#/tests/support/workspace.ts";

const playwrightPackages = ["playwright", "playwright-core"];
const captures = ["screenshot", "screenshots", "screencast", "video", "recordVideo"];
const readValuesInstead =
  "The checks read values, not pixels: compare a computed style, an attribute or the markup instead.";

function isACapture(declaration: ts.Node): boolean {
  return (
    isFileOfPackage(fileOf(declaration), playwrightPackages) &&
    captures.includes(nameOf(declaration))
  );
}

function givesAnOption(node: ts.Node): boolean {
  return (
    (ts.isPropertyAssignment(node.parent) || ts.isShorthandPropertyAssignment(node.parent)) &&
    node.parent.name === node &&
    ts.isObjectLiteralExpression(node.parent.parent)
  );
}

function capturesIn(program: Program, file: string): string[] {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${file}: TypeScript opened no source for this file.`);
  return descendants(source).flatMap((node) => {
    const found = (how: string) => [`${located(node)}: ${firstLine(node)}: ${how}`];
    if (givesAnOption(node) && declarationsOf(program, node).some(isACapture)) {
      return found(`this gives Playwright's ${node.getText()} option. ${readValuesInstead}`);
    }
    if (memberDeclarations(program, node).some(isACapture)) {
      return found(
        `this reaches a Playwright member that captures an image or a recording. ${readValuesInstead}`,
      );
    }
    const read = memberRead(program, node);
    return read &&
      isTypedAny(program, read.owner) &&
      read.names.some((name) => captures.includes(name))
      ? found(`this reads a capture by its name from a value typed any. ${readValuesInstead}`)
      : [];
  });
}

const checkedFiles = [...scriptFiles, ...scriptFilesInDotDirectories].map((file) =>
  join(repositoryRoot, file),
);
const program = openProgram(checkedFiles);

const refusedSpellings: Record<string, [text: string, extension: string]> = {
  "a page's screenshot": [
    'import type { Page } from "playwright";\nexport const shot = (page: Page) => page.screenshot();\n',
    ".ts",
  ],
  "a locator's screenshot by a literal name": [
    'import type { Locator } from "playwright";\nexport const shot = (locator: Locator) => locator["screenshot"]();\n',
    ".ts",
  ],
  "a screenshot destructured from a page": [
    'import type { Page } from "playwright";\nexport const shot = ({ screenshot }: Page) => screenshot;\n',
    ".ts",
  ],
  "a page's video": [
    'import type { Page } from "playwright";\nexport const recording = (page: Page) => page.video();\n',
    ".ts",
  ],
  "a page's screencast": [
    'import type { Page } from "playwright";\nexport const frames = (page: Page) => page.screencast;\n',
    ".ts",
  ],
  "a context that records video": [
    'import type { Browser } from "playwright";\nexport const recorded = (browser: Browser) => browser.newContext({ recordVideo: { dir: "videos" } });\n',
    ".ts",
  ],
  "a trace that captures screenshots": [
    'import type { BrowserContext } from "playwright";\nexport const traced = (context: BrowserContext) => context.tracing.start({ screenshots: true });\n',
    ".ts",
  ],
  "a screenshot in a script that infers its page": [
    'import { chromium } from "playwright";\nconst browser = await chromium.launch();\nconst page = await browser.newPage();\nawait page.screenshot({ path: "page.png" });\n',
    ".mjs",
  ],
  "a screenshot read from a value typed any": [
    "export const shot = (page: any) => page.screenshot();\n",
    ".ts",
  ],
};
const allowedSpellings: Record<string, [text: string, extension: string]> = {
  "a page's computed style": [
    'import type { Page } from "playwright";\nexport const read = (page: Page) => page.locator("button").evaluate((node) => getComputedStyle(node).color);\n',
    ".ts",
  ],
  "a screenshot of another library": [
    "type Camera = { screenshot: () => string };\nexport const shot = (camera: Camera) => camera.screenshot();\n",
    ".ts",
  ],
};
const spelt = (spellings: Record<string, [text: string, extension: string]>): [string, string][] =>
  Object.entries(spellings).map(([spelling, [text, extension]]) => [
    spelling,
    virtualFile(text, extension),
  ]);
const refused = spelt(refusedSpellings);
const allowed = spelt(allowedSpellings);
const spellings = openProgram([...refused, ...allowed].map(([, file]) => file));
afterAll(() => {
  program.dispose();
  spellings.dispose();
});

test(`no script file captures an image or a recording through Playwright: it reaches none of ${captures.join(", ")} as a member the type checker resolves, as an option it gives, or by name on a value typed any`, () => {
  expect(checkedFiles.length).toBeGreaterThan(100);
  expect(checkedFiles.flatMap((file) => capturesIn(program, file))).toEqual([]);
});

test.for(refused)("the rule refuses %s", ([, file]) => {
  expect(capturesIn(spellings, file)).not.toEqual([]);
});

test.for(allowed)("the rule passes %s", ([, file]) => {
  expect(capturesIn(spellings, file)).toEqual([]);
});
