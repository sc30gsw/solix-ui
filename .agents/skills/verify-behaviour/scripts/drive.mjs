#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: dirname(fileURLToPath(import.meta.url)),
  encoding: "utf8",
}).trim();
const repositoryModule = (path) => import(pathToFileURL(join(root, path)).href);
const { browserType, engineNames, enginesToVerify } = await repositoryModule("scripts/browser-engines.mjs");
const { expectedValues } = await repositoryModule("scripts/expected-values.ts");
const { BEHAVIOUR_SDK_LAYER } = await repositoryModule("packages/core/build-pipeline.mjs");
const { account, keyboardTable, manual, sdkStyles, startAt, stateOf, tabList, tabNamed, tabsRegion } =
  await repositoryModule("apps/playground/tests/support/tabs.ts");
const state = join(root, ".verify-playground");

const style = (locator, property) =>
  locator.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), property);

const writtenAtRunTime = (page, region) =>
  page.evaluate((selector) => {
    const parts = [...document.querySelectorAll(`${selector} [data-slot]`)];
    return {
      "style attributes on the parts": [...new Set(parts.map((part) => part.getAttribute("style") ?? ""))].sort().join(" | "),
      "style attribute on the html element": document.documentElement.getAttribute("style") ?? "",
      "inert elements": document.querySelectorAll("[inert]").length,
      "adopted style sheets": document.adoptedStyleSheets.length,
      "parts that carry a class the library did not give": parts.filter((part) =>
        [...part.classList].some((name) => !/^(sx|solix-)/.test(name)),
      ).length,
    };
  }, region);

const components = {
  tabs: async ({ page, observe, shot, expected }) => {
    const region = page.locator(tabsRegion);
    const expectWrites = async (when) => {
      const styles = await sdkStyles(page, BEHAVIOUR_SDK_LAYER);
      observe(`${when}: style elements the SDK added`, styles.length, 1);
      observe(`${when}: important declarations in them`, styles.join("").match(/!\s*important/g)?.length ?? 0, 1);
      const written = await writtenAtRunTime(page, tabsRegion);
      observe(`${when}: style attributes on the parts`, written["style attributes on the parts"], " | --sx-display:flex");
      observe(`${when}: style attribute on the html element`, written["style attribute on the html element"], "");
      observe(`${when}: inert elements`, written["inert elements"], 0);
      observe(`${when}: adopted style sheets`, written["adopted style sheets"], 0);
      observe(`${when}: parts that carry a class the library did not give`, written["parts that carry a class the library did not give"], 0);
    };

    await region.scrollIntoViewIfNeeded();
    await shot("tabs", "Open the page and scroll to the section named Tabs.", region);
    await expectWrites("after hydration");

    for (const [index, { list, direction, start, keys, focused, selected }] of keyboardTable.entries()) {
      const row = `${list}${direction ? ` (${direction})` : ""}, from ${start}, ${keys.join(" then ")}`;
      await tabList(page, list).evaluate((node, written) => node.setAttribute("dir", written), direction ?? "ltr");
      await startAt(page, list, start);
      for (const key of keys) await page.keyboard.press(key);
      await page.waitForFunction(
        ([name, wanted]) =>
          document.activeElement?.closest(`[role="tablist"][aria-label="${name}"]`) !== null &&
          document.activeElement?.textContent?.includes(wanted),
        [list, focused],
      );
      await shot(`keys-${index + 1}`, `In ${list}, start at ${start} and press ${keys.join(", then ")}.`, region);
      const after = await stateOf(page, list);
      observe(`${row}: focused tab`, after.focused, focused);
      observe(`${row}: selected tab`, after.selected, selected);
      observe(`${row}: panels shown`, after.shown.join(), `${selected} panel`);
      observe(`${row}: tab stops`, after.tabStops.join(), selected);
      await tabList(page, list).evaluate((node) => node.removeAttribute("dir"));
    }

    await startAt(page, manual, "Two");
    await startAt(page, account, "Settings");
    const settings = tabNamed(page, account, "Settings");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await shot("focus-ring", "Leave the Account list with Shift+Tab and come back with Tab. Focus returns to the selected tab, Settings, which shows a focus ring.", region);
    observe("Tab into the list: focused tab", (await stateOf(page, account)).focused, "Settings");
    observe("focus ring: outline style", await style(settings, "outline-style"), "solid");
    observe("focus ring: outline colour", await style(settings, "outline-color"), expected("--solix-color-primary"));
    await page.keyboard.press("Tab");
    await shot("focus-panel", "Press Tab. Focus leaves the list for the panel.", region);
    observe("Tab out of the list: focused element", await page.evaluate(() => document.activeElement?.textContent), "Settings panel");
    await page.keyboard.press("Tab");
    await shot("focus-next-list", "Press Tab. Focus enters the next list at its selected tab, Two.", region);
    observe("Tab into the next list: focused tab", (await stateOf(page, manual)).focused, "Two");

    await expectWrites("after every key");
  },
};

const usage = `usage: drive.mjs <${Object.keys(components).join("|")}> [${engineNames.join("|")}]`;
const component = process.argv[2];
if (!(component in components)) {
  console.error(usage);
  process.exit(2);
}
const engine = process.argv[3] ?? enginesToVerify()[0];
if (!engineNames.includes(engine)) {
  console.error(usage);
  process.exit(2);
}

let port;
try {
  port = readFileSync(join(state, "server.port"), "utf8").trim();
} catch {
  console.error("no instance was launched from this checkout. Run .agents/skills/verify-playground/scripts/launch.sh first.");
  process.exit(2);
}
const url = `http://127.0.0.1:${port}/`;
const directory = join(state, "evidence", engine, `behaviour-${component}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(directory, { recursive: true });

const observations = [];
const observe = (what, actual, expected) => observations.push({ what, actual, expected, pass: actual === expected });

const browser = await browserType(engine).launch();
const browserVersion = browser.version();
const recorded = await browser.newContext({
  viewport: { width: 640, height: 480 },
  recordVideo: { dir: directory, size: { width: 640, height: 480 } },
});
const page = await recorded.newPage();
const consoleProblems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") consoleProblems.push(message.text());
});
page.on("pageerror", (error) => consoleProblems.push(String(error)));
await page.goto(url, { waitUntil: "networkidle" });

const steps = [];
const shot = async (name, description, target = page) => {
  const image = `${String(steps.length + 1).padStart(2, "0")}-${name}.png`;
  await target.screenshot({ path: join(directory, image) });
  steps.push({ description, image });
};

try {
  const expected = await expectedValues(page);
  await components[component]({ page, observe, shot, expected });
  observe("console errors and warnings", consoleProblems.join(" | "), "");
} finally {
  await recorded.close();
  await browser.close();
}
renameSync(await page.video().path(), join(directory, "recording.webm"));

const passed = observations.every((observation) => observation.pass);
writeFileSync(
  join(directory, "observations.json"),
  `${JSON.stringify({ component, engine, browserVersion, url, passed, steps, observations }, null, 2)}\n`,
);
for (const { what, actual, expected, pass } of observations) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${what}${pass ? "" : `: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
console.log(`evidence: ${directory}`);
process.exit(passed ? 0 : 1);
