import type { ConsoleMessage, Page } from "playwright";
import { hydratedMark } from "#/src/hydrated-mark.ts";

export type OpenedUntil = "hydrated" | "stylesheetsLoaded" | "commit" | "load";

export const pageDidNotBecomeReady = "the page did not become ready";

export const hydrationTimeout = 10_000;

export type ExpectedReport = string | RegExp;

type Heard = { problems: string[]; asked: number; expected?: ExpectedReport };

function isExpected(problem: string, expected: ExpectedReport | undefined): boolean {
  if (expected === undefined) return false;
  return typeof expected === "string" ? problem === expected : expected.test(problem);
}

const heardOnEachPage = new Map<Page, Heard>();

function problemOf(message: ConsoleMessage): string | undefined {
  const type = message.type();
  return type === "error" || type === "warning" ? `${type}: ${message.text()}` : undefined;
}

function keepListening(page: Page, expected: ExpectedReport | undefined): void {
  let heard = heardOnEachPage.get(page);
  if (heard === undefined) {
    const kept: Heard = { problems: [], asked: 0 };
    page.on("console", (message) => {
      const problem = problemOf(message);
      if (problem !== undefined) kept.problems.push(problem);
    });
    page.on("pageerror", (error) => kept.problems.push(`pageerror: ${String(error)}`));
    heardOnEachPage.set(page, kept);
    heard = kept;
  }
  if (expected !== undefined) heard.expected = expected;
}

export function consoleProblemsSinceLastAsked(): string[] {
  const found: string[] = [];
  for (const [page, heard] of heardOnEachPage) {
    found.push(
      ...heard.problems
        .slice(heard.asked)
        .filter((problem) => !isExpected(problem, heard.expected)),
    );
    heard.asked = heard.problems.length;
    if (page.isClosed()) heardOnEachPage.delete(page);
  }
  return found;
}

function heardFrom(page: Page): { said: string[]; stop: () => void } {
  const said: string[] = [];
  const onConsole = (message: ConsoleMessage) => said.push(`${message.type()}: ${message.text()}`);
  const onError = (error: Error) => said.push(`pageerror: ${String(error)}`);
  page.on("console", onConsole);
  page.on("pageerror", onError);
  return {
    said,
    stop: () => {
      page.off("console", onConsole);
      page.off("pageerror", onError);
    },
  };
}

function notReady(timeout: number, said: string[], cause: unknown): Error {
  return new Error(
    `${pageDidNotBecomeReady}: its client script has not marked <html> with ${hydratedMark} within ${timeout} ms, so it has not hydrated the page. The page said: ${said.join(" | ") || "nothing"}`,
    { cause },
  );
}

function withWhatThePageSaid(said: string[], cause: unknown): Error {
  return new Error(`${String(cause)} The page said: ${said.join(" | ") || "nothing"}`, { cause });
}

export type StylesheetSnapshot = {
  href: string;
  outcome: "loaded" | "failed" | "pending" | "not watched";
  rules: number | "no sheet" | "unreadable";
};

const stylesheetOutcomesKey = "__stylesheetOutcomes";

function watchStylesheetOutcomes(key: string): void {
  const outcomes = new WeakMap<Element, "loaded" | "failed">();
  Object.defineProperty(window, key, { value: outcomes });
  for (const [type, outcome] of [
    ["load", "loaded"],
    ["error", "failed"],
  ] as const) {
    document.addEventListener(
      type,
      ({ target }) => {
        if (target instanceof HTMLLinkElement) outcomes.set(target, outcome);
      },
      true,
    );
  }
}

export type DocumentSnapshot = {
  readyState: DocumentReadyState;
  bodyParsed: boolean;
  scrollY: number;
  stylesheets: StylesheetSnapshot[];
};

function documentSnapshot(outcomesAt: string): DocumentSnapshot {
  const outcomes: unknown = Reflect.get(window, outcomesAt);
  const outcomeOf = (link: HTMLLinkElement): StylesheetSnapshot["outcome"] =>
    outcomes instanceof WeakMap ? (outcomes.get(link) ?? "pending") : "not watched";
  const rulesOf = (link: HTMLLinkElement): StylesheetSnapshot["rules"] => {
    if (link.sheet === null) return "no sheet";
    try {
      return link.sheet.cssRules.length;
    } catch {
      return "unreadable";
    }
  };
  return {
    readyState: document.readyState,
    bodyParsed: document.body !== null,
    scrollY: window.scrollY,
    stylesheets: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
      (link) => ({ href: link.href, outcome: outcomeOf(link), rules: rulesOf(link) }),
    ),
  };
}

export function snapshotOfDocument(page: Page): Promise<DocumentSnapshot> {
  return page.evaluate(documentSnapshot, stylesheetOutcomesKey);
}

export const linksNoStylesheet = "the page links no stylesheet";
export const stylesheetDidNotLoad = "a stylesheet did not load";
export const stylesheetUnreadable = "a stylesheet loaded but cannot be read";
export const notEveryStylesheetLoaded = "not every stylesheet loaded";
const pollEvery = 25;

type StylesheetsState = "pending" | "settled" | { failure: string };

function stylesheetsState(snapshot: DocumentSnapshot | undefined): StylesheetsState {
  if (snapshot === undefined) return "pending";
  const failed = snapshot.stylesheets.filter(({ outcome }) => outcome === "failed");
  if (failed.length > 0) {
    return {
      failure: `${stylesheetDidNotLoad}: ${failed.map(({ href }) => href).join(", ")} fired its error event.`,
    };
  }
  const unreadable = snapshot.stylesheets.filter(({ rules }) => rules === "unreadable");
  if (unreadable.length > 0) {
    return {
      failure: `${stylesheetUnreadable}, as a sheet from another origin served without CORS cannot, so nothing tells that it styles the page: ${unreadable.map(({ href }) => href).join(", ")}.`,
    };
  }
  if (!snapshot.bodyParsed) return "pending";
  if (snapshot.stylesheets.length === 0) {
    return {
      failure: `${linksNoStylesheet}, so there is none to wait for. Open it until "hydrated", "load" or "commit".`,
    };
  }
  return snapshot.stylesheets.every(
    ({ outcome, rules }) => outcome === "loaded" && typeof rules === "number",
  )
    ? "settled"
    : "pending";
}

function within<T>(work: Promise<T>, milliseconds: number): Promise<T | undefined> {
  return Promise.race([
    work.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(resolve, Math.max(1, milliseconds))),
  ]);
}

const watchedPages = new WeakSet<Page>();

async function watchStylesheets(page: Page): Promise<void> {
  if (watchedPages.has(page)) return;
  await page.addInitScript(watchStylesheetOutcomes, stylesheetOutcomesKey);
  watchedPages.add(page);
}

async function untilStylesheetsLoaded(
  page: Page,
  { deadline, timeout, said }: { deadline: number; timeout: number; said: readonly string[] },
): Promise<void> {
  const failure = (why: string) =>
    new Error(`${pageDidNotBecomeReady}: ${why} The page said: ${said.join(" | ") || "nothing"}`);
  let snapshot: DocumentSnapshot | undefined;
  for (;;) {
    snapshot = (await within(snapshotOfDocument(page), deadline - Date.now())) ?? snapshot;
    const state = stylesheetsState(snapshot);
    if (state === "settled") return;
    if (state !== "pending") throw failure(state.failure);
    if (Date.now() >= deadline) {
      throw failure(
        `${notEveryStylesheetLoaded} within ${timeout} ms. Its stylesheets were ${JSON.stringify(snapshot?.stylesheets ?? "not read")}.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollEvery));
  }
}

export async function opened(
  page: Page,
  url: string,
  until: OpenedUntil,
  {
    timeout = hydrationTimeout,
    reportsToTheConsole,
  }: { timeout?: number; reportsToTheConsole?: ExpectedReport } = {},
): Promise<void> {
  keepListening(page, reportsToTheConsole);
  if (until === "stylesheetsLoaded") {
    await watchStylesheets(page);
    const deadline = Date.now() + timeout;
    const heard = heardFrom(page);
    try {
      await page.goto(url, { waitUntil: "commit", timeout }).catch((cause: unknown) => {
        throw withWhatThePageSaid(heard.said, cause);
      });
      await untilStylesheetsLoaded(page, { deadline, timeout, said: heard.said });
    } finally {
      heard.stop();
    }
    return;
  }
  if (until !== "hydrated") {
    await page.goto(url, { waitUntil: until });
    return;
  }
  const deadline = Date.now() + timeout;
  const heard = heardFrom(page);
  try {
    await page.goto(url, { waitUntil: "commit", timeout }).catch((cause: unknown) => {
      throw withWhatThePageSaid(heard.said, cause);
    });
    await page
      .waitForFunction((mark) => document.documentElement.hasAttribute(mark), hydratedMark, {
        timeout: Math.max(1, deadline - Date.now()),
      })
      .catch((cause: unknown) => {
        throw notReady(timeout, heard.said, cause);
      });
  } finally {
    heard.stop();
  }
}
