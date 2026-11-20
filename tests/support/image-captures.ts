import {
  calledDeclaration,
  declarationsOf,
  descendants,
  fileOf,
  firstLine,
  isFileOfPackage,
  isTypedAny,
  memberDeclarations,
  memberRead,
  type MemberRead,
  nameOf,
  type Program,
  propertyDeclarations,
  stringsIn,
  ts,
} from "#/scripts/syntax.ts";
import { located } from "#/tests/support/primitive-rules/library.ts";

const playwrightPackages = ["playwright", "playwright-core"];
export const captures = ["screenshot", "screenshots", "screencast", "video", "recordVideo"];
const captureOptions = ["screenshots", "recordVideo"];
const protocolSend = "send";
const protocolCaptures = ["Page.captureScreenshot", "Page.startScreencast"];
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

function optionName(program: Program, node: ts.Node): string[] {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return [node.text];
  return ts.isComputedPropertyName(node) ? stringsIn(program, node.expression) : [];
}

function readOfAMember(program: Program, node: ts.Node): MemberRead | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return { owner: node.expression, names: [node.name.text] };
  }
  return ts.isElementAccessExpression(node) ||
    ts.isBindingElement(node) ||
    (ts.isCallExpression(node) && node.arguments.length > 1)
    ? memberRead(program, node)
    : undefined;
}

function writesACaptureOption(program: Program, node: ts.Node): boolean {
  return (
    givesAnOption(node) && optionName(program, node).some((name) => captureOptions.includes(name))
  );
}

function handsPlaywrightACaptureOption(program: Program, node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const called = calledDeclaration(program, node);
  return (
    called !== undefined &&
    isFileOfPackage(fileOf(called), playwrightPackages) &&
    node.arguments.some(
      (argument) => propertyDeclarations(program, argument, captureOptions).length > 0,
    )
  );
}

function sendsAProtocolCapture(program: Program, node: ts.Node): boolean {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== protocolSend
  ) {
    return false;
  }
  const called = calledDeclaration(program, node);
  return (
    called !== undefined &&
    isFileOfPackage(fileOf(called), playwrightPackages) &&
    stringsIn(program, node.arguments[0]).some((command) => protocolCaptures.includes(command))
  );
}

export function capturesIn(program: Program, file: string): string[] {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${file}: TypeScript opened no source for this file.`);
  const nodes = descendants(source);
  const optionsWritten = nodes.some((node) => writesACaptureOption(program, node));
  return nodes.flatMap((node) => {
    const found = (how: string) => [`${located(node)}: ${firstLine(node)}: ${how}`];
    if (sendsAProtocolCapture(program, node)) {
      return found(
        `this sends Playwright's DevTools session a command that captures the page. ${readValuesInstead}`,
      );
    }
    if (optionsWritten && handsPlaywrightACaptureOption(program, node)) {
      return found(
        `this hands a Playwright call options that capture an image or a recording, however they were built. ${readValuesInstead}`,
      );
    }
    if (givesAnOption(node)) {
      return optionName(program, node).some((name) => captures.includes(name)) &&
        declarationsOf(program, node).some(isACapture)
        ? found(`this gives Playwright's ${node.getText()} option. ${readValuesInstead}`)
        : [];
    }
    const read = readOfAMember(program, node);
    if (!read?.names.some((name) => captures.includes(name))) return [];
    if (memberDeclarations(program, node).some(isACapture)) {
      return found(
        `this reaches a Playwright member that captures an image or a recording. ${readValuesInstead}`,
      );
    }
    return isTypedAny(program, read.owner)
      ? found(`this reads a capture by its name from a value typed any. ${readValuesInstead}`)
      : [];
  });
}

export const refusedCaptureSpellings: Record<string, [text: string, extension: string]> = {
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
  "options built apart from the call and handed to it": [
    'import type { Browser } from "playwright";\nconst options = { recordVideo: { dir: "videos" } };\nexport const recorded = (browser: Browser) => browser.newContext(options);\n',
    ".ts",
  ],
  "options spread into the call": [
    'import type { Browser } from "playwright";\nconst base = { recordVideo: { dir: "videos" } };\nexport const recorded = (browser: Browser) => browser.newContext({ ...base, viewport: null });\n',
    ".ts",
  ],
  "trace options built apart": [
    'import type { BrowserContext } from "playwright";\nconst traced = { screenshots: true, snapshots: false };\nexport const start = (context: BrowserContext) => context.tracing.start(traced);\n',
    ".ts",
  ],
  "a screenshot through the DevTools protocol": [
    'import type { Page } from "playwright";\nexport const shot = async (page: Page) => (await page.context().newCDPSession(page)).send("Page.captureScreenshot");\n',
    ".ts",
  ],
  "a screencast through the DevTools protocol, by a constant": [
    'import type { CDPSession } from "playwright";\nconst command = "Page.startScreencast";\nexport const frames = (session: CDPSession) => session.send(command);\n',
    ".ts",
  ],
  "a screenshot read from a value typed any": [
    "export const shot = (page: any) => page.screenshot();\n",
    ".ts",
  ],
};
export const allowedCaptureSpellings: Record<string, [text: string, extension: string]> = {
  "a page's computed style": [
    'import type { Page } from "playwright";\nexport const read = (page: Page) => page.locator("button").evaluate((node) => getComputedStyle(node).color);\n',
    ".ts",
  ],
  "an option of the same name handed to another library": [
    "type Recorder = { start: (options: { recordVideo: boolean }) => void };\nconst options = { recordVideo: true };\nexport const started = (recorder: Recorder) => recorder.start(options);\n",
    ".ts",
  ],
  "another DevTools protocol command": [
    'import type { CDPSession } from "playwright";\nexport const metrics = (session: CDPSession) => session.send("Performance.getMetrics");\n',
    ".ts",
  ],
  "a screenshot of another library": [
    "type Camera = { screenshot: () => string };\nexport const shot = (camera: Camera) => camera.screenshot();\n",
    ".ts",
  ],
};
