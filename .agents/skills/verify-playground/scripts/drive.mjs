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
const { expectedValues, lookOf } = await repositoryModule("scripts/expected-values.ts");
const { breakpointWidths } = await repositoryModule("packages/core/src/style-prop-table.ts");
const { stableClass } = await repositoryModule("packages/core/src/stable-class.ts");
const { startAt, stateOf, tabNamed, tabsRegion } = await repositoryModule("apps/playground/tests/support/tabs.ts");
const state = join(root, ".verify-playground");
const pixelsPerMediaQueryEm = 16;
const mdWidth = Number.parseFloat(breakpointWidths.md) * pixelsPerMediaQueryEm;

const style = (locator, property) =>
  locator.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), property);

const journeys = {
  "button-default": async ({ page, observe, shot, expected }) => {
    const button = page.getByRole("button", { name: "Default" });
    await shot("page", "Open the page.");
    await shot("default-button", "Look at the button named Default.", button);
    observe("background", await style(button, "background-color"), expected("--solix-color-primary"));
    observe("text colour", await style(button, "color"), expected("--solix-color-on-primary"));
    observe("height", await style(button, "height"), expected("--solix-control-height-md"));
  },
  "consumer-override": async ({ page, observe, shot, expected }) => {
    const overridden = page.getByRole("button", { name: "Overridden" });
    await shot("page", "Open the page.");
    await shot("overridden-button", "Look at the button named Overridden, which the app gives its own class.", overridden);
    observe("background comes from the consumer's class", await style(overridden, "background-color"), expected("danger"));
    observe("height still comes from the library", await style(overridden, "height"), expected("--solix-control-height-md"));
    observe("text colour still comes from the library", await style(overridden, "color"), expected("--solix-color-on-primary"));
  },
  "token-theme": async ({ page, observe, shot, expected }) => {
    const themed = page.getByRole("button", { name: "Themed" });
    await shot("page", "Open the page.");
    await shot("themed-button", "Look at the button named Themed, which sits in a subtree where the app overrides a token.", themed);
    observe("background follows the consumer's token value", await style(themed, "background-color"), expected("brandGreen"));
    observe("a button outside the themed subtree keeps the default", await style(page.getByRole("button", { name: "Default" }), "background-color"), expected("--solix-color-primary"));
  },
  "changing-props": async ({ page, observe, shot, expected }) => {
    const emphasise = page.getByRole("button", { name: "Emphasise" });
    const follower = page.locator("details").filter({ hasText: "Follows the Emphasise button" });
    const followerSummary = follower.locator("summary");
    await shot("before", "Open the page. The Emphasise button has the default colour and the Follows disclosure has no outline.");
    observe("before: Emphasise background", await style(emphasise, "background-color"), expected("--solix-color-primary"));
    observe("before: Emphasise aria-pressed", await emphasise.getAttribute("aria-pressed"), "false");
    observe("before: Follows outline", await style(follower, "outline-style"), "none");
    observe("before: Follows summary background", await style(followerSummary, "background-color"), expected("--solix-color-surface"));

    await emphasise.click();
    await page.waitForFunction((element) => element.getAttribute("aria-pressed") === "true", await emphasise.elementHandle());
    await shot("after-click", "Click Emphasise. The app now passes it a class, and passes the Follows disclosure another.");
    observe("after a click: Emphasise background comes from the class the app now passes", await style(emphasise, "background-color"), expected("danger"));
    observe("after a click: Emphasise aria-pressed", await emphasise.getAttribute("aria-pressed"), "true");
    observe("after a click: Follows outline comes from the class the app now passes", await style(follower, "outline-style"), "solid");
    observe("after a click: Follows summary background comes from the class classes.summary now names", await style(followerSummary, "background-color"), expected("danger"));

    await emphasise.click();
    await page.waitForFunction((element) => element.getAttribute("aria-pressed") === "false", await emphasise.elementHandle());
    await shot("after-second-click", "Click Emphasise again. Both return to how they started.");
    observe("after a second click: Emphasise background", await style(emphasise, "background-color"), expected("--solix-color-primary"));
    observe("after a second click: Follows outline", await style(follower, "outline-style"), "none");
    observe("after a second click: Follows summary background", await style(followerSummary, "background-color"), expected("--solix-color-surface"));
  },
  disclosure: async ({ page, observe, shot, expected }) => {
    const summary = page.locator("summary").filter({ hasText: "Toggle" });
    const details = page.locator("details").filter({ has: summary });
    const content = page.getByText("Hidden content");
    const isOpen = () => details.evaluate((node) => node.open);

    await shot("closed", "Open the page. The disclosure starts closed.");
    observe("closed: the details element's open property", await isOpen(), false);
    observe("closed: summary background", await style(summary, "background-color"), expected("--solix-color-surface"));
    observe("closed: content is visible", await content.isVisible(), false);

    await summary.click();
    await content.waitFor({ state: "visible" });
    await shot("open", "Click the summary named Toggle. The content appears and the summary changes colour.");
    observe("open: the details element's open property", await isOpen(), true);
    observe("open: summary background", await style(summary, "background-color"), expected("--solix-color-primary"));
    observe("open: summary text colour", await style(summary, "color"), expected("--solix-color-on-primary"));
    observe("open: content is visible", await content.isVisible(), true);
    observe("open: content left border", await style(content, "border-left-color"), expected("--solix-color-primary"));

    await summary.click();
    await content.waitFor({ state: "hidden" });
    await shot("closed-again", "Click Toggle again. The content goes away and the summary returns to its first colour.");
    observe("closed again: the details element's open property", await isOpen(), false);
    observe("closed again: summary background", await style(summary, "background-color"), expected("--solix-color-surface"));
    observe("closed again: content is visible", await content.isVisible(), false);

    const innerSummary = page.locator("summary").filter({ hasText: "Inner" });
    await summary.click();
    await content.waitFor({ state: "visible" });
    await shot("inner-stays-closed", "Click Toggle to open it. The disclosure named Inner, inside it, still looks closed.");
    observe("inner disclosure inside the open one: summary background", await style(innerSummary, "background-color"), expected("--solix-color-surface"));
    observe("inner disclosure inside the open one: summary text colour", await style(innerSummary, "color"), expected("--solix-color-text"));
    await summary.click();
    await content.waitFor({ state: "hidden" });

    await summary.focus();
    await page.keyboard.press("Enter");
    await content.waitFor({ state: "visible" });
    await shot("opened-with-enter", "Focus the summary and press Enter. The disclosure opens.");
    observe("Enter on the focused summary: the details element's open property", await isOpen(), true);
    observe("Enter on the focused summary: summary background", await style(summary, "background-color"), expected("--solix-color-primary"));
    observe("Enter on the focused summary: content is visible", await content.isVisible(), true);

    await page.keyboard.press("Space");
    await content.waitFor({ state: "hidden" });
    await shot("closed-with-space", "Press Space. The disclosure closes.");
    observe("Space on the focused summary: the details element's open property", await isOpen(), false);
    observe("Space on the focused summary: summary background", await style(summary, "background-color"), expected("--solix-color-surface"));
    observe("Space on the focused summary: content is visible", await content.isVisible(), false);
  },
  "text-input": async ({ page, observe, shot, expected }) => {
    const email = page.getByRole("textbox", { name: "Email" });
    const overridden = page.getByRole("textbox", { name: "Overridden input" });
    const disabled = page.getByRole("textbox", { name: "Disabled input" });
    await shot("page", "Open the page. Three text inputs sit below the disclosures.");
    await shot("email-input", "Look at the input named Email.", email);
    observe("email: border colour", await style(email, "border-top-color"), expected("--solix-color-border"));
    observe("email: height", await style(email, "height"), expected("--solix-control-height-md"));
    observe("overridden input: background comes from the consumer's class", await style(overridden, "background-color"), expected("danger"));
    observe("overridden input: height still comes from the library", await style(overridden, "height"), expected("--solix-control-height-md"));
    observe("disabled input: opacity", await style(disabled, "opacity"), "0.6");
    observe("disabled input: the user can type in it", await disabled.isEditable(), false);

    await email.fill("not an address");
    await shot("typed-invalid", "Type a value that is not an email address into Email. The border does not change while the user is still in the field.", email);
    observe("while typing an invalid value: border is not the error colour", (await style(email, "border-top-color")) === expected("--solix-color-error"), false);

    await page.getByRole("button", { name: "Default" }).focus();
    await page.waitForFunction(([element, colour]) => getComputedStyle(element).borderTopColor === colour, [await email.elementHandle(), expected("--solix-color-error")]);
    await shot("left-invalid", "Move focus to another control. The Email border takes the error colour.", email);
    observe("after leaving the invalid value: border colour", await style(email, "border-top-color"), expected("--solix-color-error"));

    await email.fill("someone@example.com");
    await page.getByRole("button", { name: "Default" }).focus();
    await page.waitForFunction(([element, colour]) => getComputedStyle(element).borderTopColor === colour, [await email.elementHandle(), expected("--solix-color-border")]);
    await shot("left-valid", "Type a valid address and leave the field. The border returns to the default.", email);
    observe("after leaving a valid value: border colour", await style(email, "border-top-color"), expected("--solix-color-border"));
  },
  modal: async ({ page, observe, shot, expected }) => {
    const opener = page.getByRole("button", { name: "Open modal" });
    const dialog = page.getByRole("dialog", { name: "Settings" });
    const readout = page.getByText(/^The app records the modal as/);
    const isModal = () => dialog.evaluate((node) => node.matches(":modal"));

    await shot("closed", "Open the page. The Settings modal is not showing.");
    observe("closed: the dialog is visible", await page.locator("dialog").isVisible(), false);

    await opener.click();
    await dialog.waitFor({ state: "visible" });
    await shot("open", "Press Open modal. A dialog named Settings covers the page with a dimmed backdrop.");
    observe("open: the dialog is modal", await isModal(), true);
    observe("open: dialog background", await style(dialog, "background-color"), expected("--solix-color-body"));
    observe("open: backdrop colour", await dialog.evaluate((node) => getComputedStyle(node, "::backdrop").backgroundColor), expected("--solix-color-backdrop"));
    observe("open: the app records", await readout.textContent(), "The app records the modal as opened.");

    await dialog.getByText("Modal content").click();
    await shot("press-inside", "Press the text inside the dialog. It stays open.", page);
    observe("press inside: the dialog is visible", await dialog.isVisible(), true);

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await shot("closed-with-escape", "Press Escape. The dialog closes.");
    observe("Escape: the dialog is visible", await page.locator("dialog").isVisible(), false);
    observe("Escape: the app records", await readout.textContent(), "The app records the modal as closed.");

    await opener.click();
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "hidden" });
    await shot("closed-with-close-button", "Open it again and press the Close button. The dialog closes.");
    observe("Close button: the dialog is visible", await page.locator("dialog").isVisible(), false);
    observe("Close button: the app records", await readout.textContent(), "The app records the modal as closed.");

    await opener.click();
    await dialog.waitFor({ state: "visible" });
    await page.mouse.click(2, 2);
    await dialog.waitFor({ state: "hidden" });
    await shot("closed-by-pressing-outside", "Open it a third time and press the backdrop, outside the dialog. The dialog closes.");
    observe("press outside: the dialog is visible", await page.locator("dialog").isVisible(), false);
    observe("press outside: the app records", await readout.textContent(), "The app records the modal as closed.");
  },
  box: async ({ page, observe, shot, expected }) => {
    const section = page.getByRole("region", { name: "Style props" });
    const overButton = page.getByRole("button", { name: "Background from a style prop" });
    const text = (content) => page.getByText(content, { exact: true });
    await page.setViewportSize({ width: mdWidth - 1, height: 360 });
    await section.scrollIntoViewIfNeeded();
    await shot("below-md", `Open the page ${mdWidth - 1} pixels wide, one pixel below the md breakpoint, and scroll to the section named Style props.`, section);
    observe("the style prop's background beats the button's own default", await style(overButton, "background-color"), expected("--solix-color-error"));
    observe("a style prop sets the margin", await style(text("Style prop margin"), "margin-top"), expected("--solix-spacing-xl"));
    observe("the consumer's class beats the style prop", await style(text("Consumer class margin"), "margin-top"), expected("roomy"));
    observe("the consumer's style beats the consumer's class and the style prop", await style(text("Consumer style margin"), "margin-top"), expected("pinnedMargin"));
    observe("below md: the section's padding comes from its xs value", await style(section, "padding-top"), expected("--solix-spacing-sm"));
    observe("below md: the pt longhand beats the p shorthand", await style(text("Longhand padding"), "padding-top"), expected("zero"));
    observe("below md: the p shorthand sets the other sides", await style(text("Longhand padding"), "padding-bottom"), expected("--solix-spacing-xs"));
    observe("mt=unset inside a Box with mt=xl takes no margin from it", await style(text("Unset margin"), "margin-top"), expected("zero"));
    observe("below md: Hidden from md is visible", await text("Hidden from md").isVisible(), true);
    observe("below md: Visible from md is visible", await text("Visible from md").isVisible(), false);

    await page.setViewportSize({ width: mdWidth, height: 360 });
    await text("Visible from md").waitFor({ state: "visible" });
    await section.scrollIntoViewIfNeeded();
    await shot("at-md", `Widen the page to ${mdWidth} pixels, which is the md breakpoint. The padding grows, one line goes away and another appears.`, section);
    observe("at md: the section's padding comes from its md value", await style(section, "padding-top"), expected("--solix-spacing-lg"));
    observe("at md: the pt longhand still beats the p shorthand's md value", await style(text("Longhand padding"), "padding-top"), expected("zero"));
    observe("at md: the p shorthand sets the other sides to its md value", await style(text("Longhand padding"), "padding-bottom"), expected("--solix-spacing-lg"));
    observe("at md: Hidden from md is visible", await text("Hidden from md").isVisible(), false);
    observe("at md: Visible from md is visible", await text("Visible from md").isVisible(), true);
    observe("at md: the consumer's style still wins", await style(text("Consumer style margin"), "margin-top"), expected("pinnedMargin"));
  },
  "styles-api": async ({ page, observe, shot, expected }) => {
    const section = page.getByRole("region", { name: "Styles API" });
    const fromClasses = page.getByRole("button", { name: "Class from classes.root" });
    const summary = page.locator("summary").filter({ hasText: "Styled parts" });
    const content = page.getByText("Content of the styled parts");
    const unstyled = page.getByRole("button", { name: "Unstyled" });
    const plain = page.getByRole("button", { name: "Plain button" });
    await section.scrollIntoViewIfNeeded();
    await shot("styles-api", "Open the page and scroll to the section named Styles API, at the end.", section);
    observe("classes.root: background comes from the consumer's class", await style(fromClasses, "background-color"), expected("danger"));
    observe("classes.root: height still comes from the library", await style(fromClasses, "height"), expected("--solix-control-height-md"));
    observe("styles.summary: background comes from styles, not from the class classes.summary names or the library", await style(summary, "background-color"), expected("partBackground"));
    observe("styles.summary: text colour comes from styles, not from the library", await style(summary, "color"), expected("partText"));
    observe("classes.summary: the consumer's class still sets the outline", await style(summary, "outline-style"), "solid");
    const plainLook = await lookOf(plain);
    for (const [property, value] of Object.entries(await lookOf(unstyled))) {
      observe(`unstyled: ${property} is the Plain button's`, value, plainLook[property]);
    }
    observe("unstyled: the button keeps its stable class", (await unstyled.getAttribute("class")).split(/\s+/).includes(stableClass("Button", "root")), true);

    await summary.click();
    await content.waitFor({ state: "visible" });
    await section.scrollIntoViewIfNeeded();
    await shot("styled-parts-open", "Click the summary named Styled parts. It opens, and its background still comes from styles.", section);
    observe("open: content is visible", await content.isVisible(), true);
    observe("open: styles.summary still beats the library's open background", await style(summary, "background-color"), expected("partBackground"));
    observe("open: styles.summary still beats the library's open text colour", await style(summary, "color"), expected("partText"));
  },
  tabs: async ({ page, observe, shot, expected }) => {
    const region = page.locator(tabsRegion);
    const press = async (key, list, description, name) => {
      await page.keyboard.press(key);
      await shot(name, description, region);
      return stateOf(page, list);
    };
    await region.scrollIntoViewIfNeeded();
    await shot("tabs", "Open the page and scroll to the section named Tabs.", region);
    const first = await stateOf(page, "Account");
    observe("at first: selected tab", first.selected, "Overview");
    observe("at first: panels shown", first.shown.join(), "Overview panel");
    observe("at first: selected tab text colour", await style(tabNamed(page, "Account", "Overview"), "color"), expected("--solix-color-primary"));
    observe("at first: another tab text colour", await style(tabNamed(page, "Account", "Members"), "color"), expected("--solix-color-text"));
    observe("at first: the disabled tab is disabled", await tabNamed(page, "Account", "Billing").isDisabled(), true);

    await tabNamed(page, "Account", "Members").click();
    await shot("click", "Click the tab named Members. Its panel replaces the Overview panel.", region);
    const clicked = await stateOf(page, "Account");
    observe("after a click on Members: selected tab", clicked.selected, "Members");
    observe("after a click on Members: panels shown", clicked.shown.join(), "Members panel");
    observe("after a click on Members: the tab names its panel", await tabNamed(page, "Account", "Members").getAttribute("aria-controls"), "account-panel-members");

    await startAt(page, "Account", "Overview");
    const stepped = await press("ArrowRight", "Account", "Click Overview and press the right arrow. Focus and selection step over the disabled Billing tab to Members.", "arrow-steps-over-disabled");
    observe("right arrow from Overview: focused tab", stepped.focused, "Members");
    observe("right arrow from Overview: selected tab", stepped.selected, "Members");
    const atEnd = await press("End", "Account", "Press End. The last tab, Settings, is focused and selected.", "end");
    observe("End: focused and selected tab", `${atEnd.focused} ${atEnd.selected}`, "Settings Settings");
    const wrapped = await press("ArrowRight", "Account", "Press the right arrow on the last tab. It wraps to Overview.", "arrow-wraps");
    observe("right arrow from the last tab: focused and selected tab", `${wrapped.focused} ${wrapped.selected}`, "Overview Overview");

    await startAt(page, "Manual vertical", "Two");
    const moved = await press("ArrowDown", "Manual vertical", "In the vertical list, click Two and press the down arrow. Focus moves to Three and Two stays selected.", "manual-arrow");
    observe("manual, down arrow from Two: focused tab", moved.focused, "Three");
    observe("manual, down arrow from Two: selected tab", moved.selected, "Two");
    const activated = await press("Enter", "Manual vertical", "Press Enter. Three is selected.", "manual-enter");
    observe("manual, Enter on Three: selected tab", activated.selected, "Three");
    const stopped = await press("ArrowDown", "Manual vertical", "Press the down arrow on the last tab. This list does not wrap, so focus stays on Three.", "manual-no-wrap");
    observe("manual, down arrow on the last tab: focused tab", stopped.focused, "Three");

    observe("optional: nothing is selected at first", (await stateOf(page, "Optional")).selected, null);
    await tabNamed(page, "Optional", "Notes").click();
    await shot("optional-selected", "Click Notes in the list named Optional. Its panel shows.", region);
    observe("optional, after a click on Notes: panels shown", (await stateOf(page, "Optional")).shown.join(), "Notes panel");
    await tabNamed(page, "Optional", "Notes").click();
    await shot("optional-deselected", "Click Notes again. No tab is selected and no panel shows.", region);
    const none = await stateOf(page, "Optional");
    observe("optional, after a second click on Notes: selected tab", none.selected, null);
    observe("optional, after a second click on Notes: panels shown", none.shown.join(), "");

    await tabNamed(page, "Controlled", "Locked").click();
    await shot("locked", "Click Locked in the list named Controlled. The app's own handler refuses the press, so Drafts stays selected.", region);
    observe("controlled, after a click on Locked: selected tab", (await stateOf(page, "Controlled")).selected, "Drafts");
    observe("controlled, after a click on Locked: presses the app refused", await page.getByRole("status", { name: "Refused presses" }).textContent(), "1");
  },
  "server-render": async ({ browser, url, observe, shot, directory, expected }) => {
    const html = await (await fetch(url)).text();
    writeFileSync(join(directory, "response.html"), html);
    observe("the response already contains the Default button", /<button[^>]*>Default<\/button>/.test(html), true);
    observe("the response already contains the Toggle summary", /<summary[^>]*>Toggle<\/summary>/.test(html), true);

    const scriptless = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 640, height: 360 } });
    const page = await scriptless.newPage();
    await page.goto(url);
    await shot("javascript-off", "Request the page with JavaScript turned off in the browser.", page);
    observe("with JavaScript off the Default button is styled", await style(page.getByRole("button", { name: "Default" }), "background-color"), expected("--solix-color-primary"));

    const summary = page.locator("summary").filter({ hasText: "Toggle" });
    await summary.click();
    await page.getByText("Hidden content").waitFor({ state: "visible" });
    await shot("disclosure-opens-without-javascript", "Still with JavaScript off, click the summary named Toggle. The disclosure opens.", page);
    observe("with JavaScript off the disclosure opens on a click", await page.getByText("Hidden content").isVisible(), true);
    observe("with JavaScript off the open summary takes the primary colour", await style(summary, "background-color"), expected("--solix-color-primary"));
    observe("with JavaScript off the modal is not showing", await page.locator("dialog").isVisible(), false);
    observe("with JavaScript off the Email input is styled", await style(page.getByRole("textbox", { name: "Email" }), "border-top-color"), expected("--solix-color-border"));
    await scriptless.close();
  },
};

const usage = `usage: drive.mjs <${Object.keys(journeys).join("|")}> [${engineNames.join("|")}]`;
const journey = process.argv[2];
if (!(journey in journeys)) {
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
  console.error("no instance was launched from this checkout. Run launch.sh first.");
  process.exit(2);
}
const url = `http://127.0.0.1:${port}/`;
const directory = join(state, "evidence", engine, `${journey}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(directory, { recursive: true });

const observations = [];
const observe = (what, actual, expected) => observations.push({ what, actual, expected, pass: actual === expected });

const browser = await browserType(engine).launch();
const browserVersion = browser.version();
const recorded = await browser.newContext({
  viewport: { width: 640, height: 360 },
  recordVideo: { dir: directory, size: { width: 640, height: 360 } },
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
  await journeys[journey]({ browser, page, url, observe, shot, directory, expected });
  observe("console errors and warnings", consoleProblems.join(" | "), "");
} finally {
  await recorded.close();
  await browser.close();
}
renameSync(await page.video().path(), join(directory, "recording.webm"));

const passed = observations.every((observation) => observation.pass);
writeFileSync(
  join(directory, "observations.json"),
  `${JSON.stringify({ journey, engine, browserVersion, url, passed, steps, observations }, null, 2)}\n`,
);
for (const { what, actual, expected, pass } of observations) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${what}${pass ? "" : `: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
console.log(`evidence: ${directory}`);
process.exit(passed ? 0 : 1);
