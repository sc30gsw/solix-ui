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
const { baseKey, breakpointWidths, libraryStyleMark, stylePropClass } = await repositoryModule("packages/core/src/style-prop-table.ts");
const { stableClass, stableClassPrefix } = await repositoryModule("packages/core/src/stable-class.ts");
const { BEHAVIOUR_SDK_LAYER, LIBRARY_CASCADE_LAYER, LIBRARY_CLASS_PREFIX, behaviourSdkHiddenRule } = await repositoryModule("packages/core/build-pipeline.mjs");
const { themedByTheProvider, themedSpacing, themeNames, themeSection } = await repositoryModule("apps/playground/src/sections/theme-setups.ts");
const { pageStyleRules, stylesAddedToThePage } = await repositoryModule("apps/playground/tests/support/page-styles.ts");
const { openedAndHydrated, openedBeforeHydration } = await repositoryModule("apps/playground/tests/support/opening.ts");
const { account, controlled, displayedByTheApp, keyboardTable, manual, optional, panelOf, startAt, stateOf, tabList, tabNamed, tabNames, tabsRegion, valueOf } =
  await repositoryModule("apps/playground/tests/support/tabs.ts");
const { overview, billing, members, security } = tabNames.account;
const { two, three } = tabNames.manual;
const { notes } = tabNames.optional;
const { drafts, locked } = tabNames.controlled;
const state = join(root, ".verify-playground");
const pixelsPerMediaQueryEm = 16;
const mdWidth = Number.parseFloat(breakpointWidths.md) * pixelsPerMediaQueryEm;

const style = (locator, property) =>
  locator.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), property);
const widthOf = (locator) => locator.evaluate((node) => node.getBoundingClientRect().width);
const elementAfter = (page, text) => page.getByText(text, { exact: true }).locator("xpath=following-sibling::*[1]");

const writtenAtRunTime = (page, region, classOfTheLibrary) =>
  page.evaluate(
    ([selector, pattern]) => {
      const parts = [...document.querySelectorAll(`${selector} [data-slot]`)];
      const ours = new RegExp(pattern);
      return {
        partStyles: [...new Set(parts.map((part) => part.getAttribute("style") ?? ""))].sort().join(" | "),
        htmlStyle: document.documentElement.getAttribute("style") ?? "",
        inert: document.querySelectorAll("[inert]").length,
        partsWithAForeignClass: parts.filter((part) => [...part.classList].some((name) => !ours.test(name))).length,
      };
    },
    [region, classOfTheLibrary],
  );

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
  "provider-theme": async ({ page, observe, shot, expected }) => {
    const themed = page.getByText(themeNames.themed, { exact: true });
    const untouched = page.getByText(themeNames.untouched, { exact: true });
    await shot("page", "Open the page.");
    await shot("theme-section", `Look at the two boxes in the section named ${themeSection}.`, page.getByRole("region", { name: themeSection }));
    observe("the box under the provider's selector reads the theme's spacing", (await style(themed, "--solix-spacing-md")).trim(), themedSpacing.md);
    observe("the box outside it keeps the default padding", await style(untouched, "padding-top"), expected("--solix-spacing-md"));
    observe("the theme changes the padding of the box under the selector", (await style(themed, "padding-top")) !== (await style(untouched, "padding-top")), true);
    const styles = await page.evaluate(([mark, selected]) => {
      const nonce = document.querySelector("script[nonce]")?.nonce;
      const all = [...document.querySelectorAll("style")];
      return { withoutTheNonce: all.filter((element) => element.nonce !== nonce).length, theme: all.filter((element) => element.hasAttribute(mark) && (element.textContent ?? "").includes(selected)).length };
    }, [libraryStyleMark, themedByTheProvider]);
    observe("style elements without the page's nonce", styles.withoutTheNonce, 0);
    observe("library style elements that hold the provider's theme", styles.theme, 1);
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
    await shot("open-parts", "Click the summary named Styled parts. It opens, and its background still comes from styles.", section);
    observe("open: content is visible", await content.isVisible(), true);
    observe("open: styles.summary still beats the library's open background", await style(summary, "background-color"), expected("partBackground"));
    observe("open: styles.summary still beats the library's open text colour", await style(summary, "color"), expected("partText"));
  },
  space: async ({ page, observe, shot, expected }) => {
    const section = page.getByRole("region", { name: "Space" });
    await page.setViewportSize({ width: mdWidth - 1, height: 360 });
    await section.scrollIntoViewIfNeeded();
    await shot("below-md", `Open the page ${mdWidth - 1} pixels wide, one pixel below the md breakpoint, and scroll to the section named Space.`, section);
    observe("below md: the space between Above the space and Below the space is at least its h, md", await style(elementAfter(page, "Above the space"), "min-height"), expected("--solix-spacing-md"));
    observe("the space between Before the space and After the space keeps its w, lg, as its minimum width in a flex row", await style(elementAfter(page, "Before the space"), "min-width"), expected("--solix-spacing-lg"));
    observe("the pinned space takes its mih, xs, as its minimum height instead of its h", await style(elementAfter(page, "Above the pinned space"), "min-height"), expected("--solix-spacing-xs"));

    await page.setViewportSize({ width: mdWidth, height: 360 });
    await section.scrollIntoViewIfNeeded();
    await shot("at-md", `Widen the page to ${mdWidth} pixels, the md breakpoint. The first space grows.`, section);
    observe("at md: the space between Above the space and Below the space is at least its h, xl", await style(elementAfter(page, "Above the space"), "min-height"), expected("--solix-spacing-xl"));
  },
  center: async ({ page, observe, shot }) => {
    const section = page.getByRole("region", { name: "Center" });
    const content = page.getByText("Centered content", { exact: true });
    const center = content.locator("xpath=..");
    const link = page.getByRole("link", { name: "Inline centered link" });
    await section.scrollIntoViewIfNeeded();
    await shot("center", "Open the page and scroll to the section named Center.", section);
    observe("the Center is a flex container", await style(center, "display"), "flex");
    observe(
      "Centered content sits in the middle of the Center, as far from each edge as from the one opposite",
      await center.evaluate((parent, child) => {
        const around = parent.getBoundingClientRect();
        const within = child.getBoundingClientRect();
        const even = (before, after) => Math.abs(before - after) <= 1;
        return even(within.left - around.left, around.right - within.right) && even(within.top - around.top, around.bottom - within.bottom);
      }, await content.elementHandle()),
      true,
    );
    observe("the inline Center is an inline flex container", await style(link, "display"), "inline-flex");
    observe("the inline Center is the link its component prop names", await link.getAttribute("href"), "#center");
  },
  stack: async ({ page, observe, shot, expected }) => {
    const section = page.getByRole("region", { name: "Stack" });
    const first = page.getByRole("button", { name: "First in the stack" });
    const second = page.getByRole("button", { name: "Second in the stack" });
    const stack = first.locator("xpath=..");
    const centred = page.getByText("Top of the centred stack", { exact: true }).locator("xpath=..");
    await section.scrollIntoViewIfNeeded();
    await shot("stack", "Open the page and scroll to the section named Stack.", section);
    observe("the Stack lays its children out in a column", await style(stack, "flex-direction"), "column");
    observe("the Stack's gap is md by default", await style(stack, "row-gap"), expected("--solix-spacing-md"));
    observe("the Stack stretches its children by default", await style(stack, "align-items"), "stretch");
    observe(
      "Second in the stack sits below First in the stack",
      await second.evaluate((node, above) => node.getBoundingClientRect().top >= above.getBoundingClientRect().bottom, await first.elementHandle()),
      true,
    );
    observe("the centred Stack takes the gap it is given, xl", await style(centred, "row-gap"), expected("--solix-spacing-xl"));
    observe("the centred Stack centres its children", await style(centred, "align-items"), "center");
  },
  group: async ({ page, observe, shot, expected }) => {
    const section = page.getByRole("region", { name: "Group" });
    const first = page.getByRole("button", { name: "First in the group" });
    const group = first.locator("xpath=..");
    const growing = ["Grows", "Grows too", "Grows as well"].map((name) => page.getByRole("button", { name, exact: true }));
    const wide = page.getByRole("button", { name: /^A label wide enough/ });
    const short = page.getByRole("button", { name: "Short", exact: true });
    await section.scrollIntoViewIfNeeded();
    await shot("group", "Open the page and scroll to the section named Group.", section);
    observe("the Group lays its children out in a row", await style(group, "flex-direction"), "row");
    observe("the Group wraps by default", await style(group, "flex-wrap"), "wrap");
    observe("the Group's gap is md by default", await style(group, "column-gap"), expected("--solix-spacing-md"));
    observe("the Group centres its children across the row by default", await style(group, "align-items"), "center");
    observe("the growing Group carries data-grow", await growing[0].locator("xpath=..").getAttribute("data-grow"), "true");
    const widths = await Promise.all(growing.map(widthOf));
    observe("each child of the growing Group takes the same share of the row", Math.max(...widths) - Math.min(...widths) <= 1, true);
    observe("a child of the growing Group grows", await style(growing[0], "flex-grow"), "1");
    observe("with preventGrowOverflow false a child has no maximum width", await style(wide, "max-width"), "none");
    observe("with preventGrowOverflow false the wide child takes more of the row than the short one", (await widthOf(wide)) > (await widthOf(short)) + 1, true);
  },
  flex: async ({ page, observe, shot, expected }) => {
    const section = page.getByRole("region", { name: "Flex" });
    const flex = page.getByRole("button", { name: "First in the flex" }).locator("xpath=..");
    const list = page.getByRole("list", { name: "Flex list" });
    await page.setViewportSize({ width: mdWidth - 1, height: 360 });
    await section.scrollIntoViewIfNeeded();
    await shot("below-md", `Open the page ${mdWidth - 1} pixels wide, one pixel below the md breakpoint, and scroll to the section named Flex.`, section);
    observe("below md: the Flex lays its buttons out in a column", await style(flex, "flex-direction"), "column");
    observe("below md: the gap between columns is xs", await style(flex, "column-gap"), expected("--solix-spacing-xs"));
    observe("the gap between rows is rowGap, sm, not gap", await style(flex, "row-gap"), expected("--solix-spacing-sm"));
    observe("align centres the buttons across the main axis", await style(flex, "align-items"), "center");
    observe("justify spreads the buttons along the main axis", await style(flex, "justify-content"), "space-between");
    observe("wrap lets the buttons wrap", await style(flex, "flex-wrap"), "wrap");
    observe("the Flex list is the <ul> its component prop names, a flex container", await style(list, "display"), "flex");
    observe("the Flex list's gap is lg", await style(list, "column-gap"), expected("--solix-spacing-lg"));

    await page.setViewportSize({ width: mdWidth, height: 360 });
    await section.scrollIntoViewIfNeeded();
    await shot("at-md", `Widen the page to ${mdWidth} pixels, the md breakpoint. The buttons move into a row.`, section);
    observe("at md: the Flex lays its buttons out in a row", await style(flex, "flex-direction"), "row");
    observe("at md: the gap between columns is xl", await style(flex, "column-gap"), expected("--solix-spacing-xl"));
    observe("at md: the gap between rows is still rowGap, sm", await style(flex, "row-gap"), expected("--solix-spacing-sm"));
  },
  container: async ({ page, observe, shot, expected }) => {
    const section = page.getByRole("region", { name: "Container" });
    const container = (text) => page.getByText(text, { exact: true }).locator("xpath=..");
    const plain = container("Inside the default container");
    const grid = container("In the middle column of the grid container");
    const breakout = container("Breaks out of the grid container");
    const back = container("Back to the width of the grid container");
    const middle = page.getByText("In the middle column of the grid container", { exact: true });
    await section.scrollIntoViewIfNeeded();
    await shot("container", "Open the page and scroll to the section named Container.", section);
    observe("the default container is at most the md container size wide", await style(plain, "max-width"), expected("--solix-container-size-md"));
    observe("the default container pads its sides by md", await style(plain, "padding-left"), expected("--solix-spacing-md"));
    observe("the default container carries data-strategy=block", await plain.getAttribute("data-strategy"), "block");
    observe("the extra small container is at most the xs container size wide", await style(container("Inside the extra small container"), "max-width"), expected("--solix-container-size-xs"));
    observe("the fluid container takes the whole width", await style(container("Inside the fluid container"), "max-width"), "100%");
    observe("the grid container is a grid with no maximum width", `${await style(grid, "display")} ${await style(grid, "max-width")}`, "grid none");
    observe("a child of the grid container is as wide as its size, the middle column", Math.abs((await widthOf(middle)) - (await widthOf(back))) <= 1, true);
    observe("the breakout child spans the whole grid container", Math.abs((await widthOf(breakout)) - (await widthOf(grid))) <= 1, true);
    observe("the data-container inside the breakout is at most the xs container size wide", await style(back, "max-width"), expected("--solix-container-size-xs"));
  },
  "simple-grid": async ({ page, observe, shot, expected }) => {
    const section = page.getByRole("region", { name: "Simple grid" });
    const gridAround = (text) => page.getByText(text, { exact: true }).locator("xpath=..");
    const columnsOf = (grid) => grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length);
    const media = gridAround("First cell");
    await page.setViewportSize({ width: mdWidth - 1, height: 720 });
    await section.scrollIntoViewIfNeeded();
    await shot("below-md", `Open the page ${mdWidth - 1} pixels wide, one pixel below the md breakpoint, and scroll to the section named Simple grid.`, section);
    observe("below md: the first grid has the 2 columns of its sm value", await columnsOf(media), 2);
    observe("below md: the gap between its columns is xs", await style(media, "column-gap"), expected("--solix-spacing-xs"));
    observe("the gap between its rows is verticalSpacing, xl", await style(media, "row-gap"), expected("--solix-spacing-xl"));
    observe("the grid in a 320 pixel container has 2 columns, past 18em", await columnsOf(gridAround("Cell of the narrow container")), 2);
    observe("the grid in a 560 pixel container has 4 columns, past 30em", await columnsOf(gridAround("Cell of the wide container")), 4);
    observe("the grid in one cell of it queries its own container and has 1 column", await columnsOf(gridAround("Cell of the nested container")), 1);
    observe("below md: the grid in a 1024 pixel container, past md, has the 2 columns of its md value", await columnsOf(gridAround("Cell of a container past md")), 2);
    observe("the grid in a 1100 pixel container with 20 pixel type is past md and has 2 columns", await columnsOf(gridAround("Cell of a container past md in larger type")), 2);
    observe("the auto-filled grid makes columns at least 160 pixels wide",(await widthOf(page.getByText("Auto-filled cell", { exact: true }))) >= 160, true);

    await page.setViewportSize({ width: mdWidth, height: 720 });
    await section.scrollIntoViewIfNeeded();
    await shot("at-md", `Widen the page to ${mdWidth} pixels, the md breakpoint. The first grid takes a third column.`, section);
    observe("at md: the first grid has the 3 columns of its md value", await columnsOf(media), 3);
    observe("at md: the gap between its columns is lg", await style(media, "column-gap"), expected("--solix-spacing-lg"));
    observe("at md: the grids in containers keep their columns", `${await columnsOf(gridAround("Cell of the narrow container"))} ${await columnsOf(gridAround("Cell of the wide container"))}`, "2 4");
    observe("at md: the grid in a 960 pixel container, short of md, has 1 column", await columnsOf(gridAround("Cell of a container short of md")), 1);
  },
  grid: async ({ page, observe, shot, expected }) => {
    const section = page.getByRole("region", { name: "Grid", exact: true });
    const column = (text) => page.getByText(text, { exact: true });
    const boxOf = (element) => element.evaluate((node) => { const { left, top, bottom, width } = node.getBoundingClientRect(); return { left, top, bottom, width }; });
    const spanWidth = async (element, span, columns) => {
      const inner = element.locator("xpath=..");
      const { width } = await boxOf(inner);
      const gap = await inner.evaluate((node) => Number.parseFloat(getComputedStyle(node).columnGap));
      return ((width + gap) * span) / columns - gap;
    };
    const near = (actual, wanted) => Math.abs(actual - wanted) <= 1;
    const half = column("Half from md");
    await page.setViewportSize({ width: mdWidth - 1, height: 720 });
    await section.scrollIntoViewIfNeeded();
    await shot("below-md", `Open the page ${mdWidth - 1} pixels wide, one pixel below the md breakpoint, and scroll to the section named Grid.`, section);
    observe("below md: Half from md spans all 12 columns", near((await boxOf(half)).width, await spanWidth(half, 12, 12)), true);
    observe("below md: the gap is xs", await style(half.locator("xpath=.."), "column-gap"), expected("--solix-spacing-xs"));
    observe("A third spans 4 of 12 columns", near((await boxOf(column("A third"))).width, await spanWidth(column("A third"), 4, 12)), true);
    const third = await boxOf(column("A third"));
    const gap = Number.parseFloat(await style(column("A third").locator("xpath=.."), "column-gap"));
    observe("A third after an offset leaves 4 columns empty before it", near((await boxOf(column("A third after an offset"))).left - (third.left + third.width), (await spanWidth(column("A third"), 4, 12)) + 2 * gap), true);
    const ordered = async () => [await boxOf(column("Ordered one")), await boxOf(column("Ordered two"))];
    const [oneBelow, twoBelow] = await ordered();
    observe("below md: Ordered two comes before Ordered one, in one row", oneBelow.top === twoBelow.top && twoBelow.left < oneBelow.left, true);
    observe("Content column is as wide as its content", await style(column("Content column"), "flex-basis"), "auto");
    observe("Auto column grows into the rest of its row", await style(column("Auto column"), "flex-grow"), "1");
    observe("with grow, two columns of 6 out of 24 each fill half the row", near((await boxOf(column("Grows to half"))).width, await spanWidth(column("Grows to half"), 12, 24)), true);
    observe("justify and overflow reach the grid", `${await style(column("Grows to half").locator("xpath=.."), "justify-content")} ${await style(column("Grows to half").locator("xpath=../.."), "overflow")}`, "center hidden");
    const [tall, short] = [await boxOf(column("Grows to half")), await boxOf(column("Grows to the other half"))];
    observe("align flex-end puts the shorter column level with the bottom of the taller one", near(short.bottom, tall.bottom) && short.top > tall.top + 1, true);
    observe("in a 480 pixel container, past 20em, a column spans 6 of 12", near((await boxOf(column("Half of a wide container"))).width, await spanWidth(column("Half of a wide container"), 6, 12)), true);
    observe("in a 240 pixel container, short of 20em, a column spans 12 of 12", near((await boxOf(column("All of a narrow container"))).width, await spanWidth(column("All of a narrow container"), 12, 12)), true);
    observe("below md: without breakpoints, in a 1024 pixel container, past md, a column spans 6 of 12", near((await boxOf(column("Half of a container past md"))).width, await spanWidth(column("Half of a container past md"), 6, 12)), true);

    await page.setViewportSize({ width: mdWidth, height: 720 });
    await section.scrollIntoViewIfNeeded();
    await shot("at-md", `Widen the page to ${mdWidth} pixels, the md breakpoint. The first two columns share a row, and the ordered columns swap.`, section);
    observe("at md: Half from md spans 6 of 12 columns", near((await boxOf(half)).width, await spanWidth(half, 6, 12)), true);
    observe("at md: the gap is lg", await style(half.locator("xpath=.."), "column-gap"), expected("--solix-spacing-lg"));
    const [oneAtMd, twoAtMd] = await ordered();
    observe("at md: Ordered one comes before Ordered two, in one row", oneAtMd.top === twoAtMd.top && oneAtMd.left < twoAtMd.left, true);
    observe("at md: without breakpoints, in a 960 pixel container, short of md, a column spans 12 of 12", near((await boxOf(column("All of a container short of md"))).width, await spanWidth(column("All of a container short of md"), 12, 12)), true);
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
    const first = await stateOf(page, account);
    observe("at first: selected tab", first.selected, overview);
    observe("at first: panels shown", first.shown.join(), panelOf(overview));
    observe("at first: selected tab text colour", await style(tabNamed(page, account, overview), "color"), expected("--solix-color-primary"));
    observe("at first: another tab text colour", await style(tabNamed(page, account, members), "color"), expected("--solix-color-text"));
    observe("at first: the disabled tab is disabled", await tabNamed(page, account, billing).isDisabled(), true);

    await tabNamed(page, account, members).click();
    await shot("click", `Click the tab named ${members}. Its panel replaces the ${panelOf(overview)}.`, region);
    const clicked = await stateOf(page, account);
    observe(`after a click on ${members}: selected tab`, clicked.selected, members);
    observe(`after a click on ${members}: panels shown`, clicked.shown.join(), panelOf(members));
    observe(`after a click on ${members}: the tab names its panel`, await tabNamed(page, account, members).getAttribute("aria-controls"), `account-panel-${valueOf(members)}`);

    await startAt(page, account, overview);
    const stepped = await press("ArrowRight", account, `Click ${overview} and press the right arrow. Focus and selection step over the disabled ${billing} tab to ${members}.`, "arrow-steps-over-disabled");
    observe(`right arrow from ${overview}: focused tab`, stepped.focused, members);
    observe(`right arrow from ${overview}: selected tab`, stepped.selected, members);
    const atEnd = await press("End", account, `Press End. The last tab, ${security}, is focused and selected.`, "end");
    observe("End: focused and selected tab", `${atEnd.focused} ${atEnd.selected}`, `${security} ${security}`);
    const wrapped = await press("ArrowRight", account, `Press the right arrow on the last tab. It wraps to ${overview}.`, "arrow-wraps");
    observe("right arrow from the last tab: focused and selected tab", `${wrapped.focused} ${wrapped.selected}`, `${overview} ${overview}`);

    await startAt(page, manual, two);
    const moved = await press("ArrowDown", manual, `In the vertical list, click ${two} and press the down arrow. Focus moves to ${three} and ${two} stays selected.`, "manual-arrow");
    observe(`manual, down arrow from ${two}: focused tab`, moved.focused, three);
    observe(`manual, down arrow from ${two}: selected tab`, moved.selected, two);
    const activated = await press("Enter", manual, `Press Enter. ${three} is selected.`, "manual-enter");
    observe(`manual, Enter on ${three}: selected tab`, activated.selected, three);
    observe(`manual, Enter on ${three}: the selected tab's edge at its inline end, and under it`, `${await style(tabNamed(page, manual, three), "border-inline-end-style")} ${await style(tabNamed(page, manual, three), "border-bottom-style")}`, "solid none");
    const stopped = await press("ArrowDown", manual, `Press the down arrow on the last tab. This list does not wrap, so focus stays on ${three}.`, "manual-no-wrap");
    observe("manual, down arrow on the last tab: focused tab", stopped.focused, three);

    observe("optional: nothing is selected at first", (await stateOf(page, optional)).selected, null);
    await tabNamed(page, optional, notes).click();
    await shot("optional-selected", `Click ${notes} in the list named ${optional}. Its panel shows.`, region);
    observe(`optional, after a click on ${notes}: panels shown`, (await stateOf(page, optional)).shown.join(), panelOf(notes));
    await tabNamed(page, optional, notes).click();
    await shot("optional-deselected", `Click ${notes} again. No tab is selected and no panel shows.`, region);
    const none = await stateOf(page, optional);
    observe(`optional, after a second click on ${notes}: selected tab`, none.selected, null);
    observe(`optional, after a second click on ${notes}: panels shown`, none.shown.join(), "");

    await tabNamed(page, controlled, locked).click();
    await shot(valueOf(locked), `Click ${locked} in the list named ${controlled}. The app's own handler refuses the press, so ${drafts} stays selected.`, region);
    observe(`controlled, after a click on ${locked}: selected tab`, (await stateOf(page, controlled)).selected, drafts);
    observe(`controlled, after a click on ${locked}: presses the app refused`, await page.getByRole("status", { name: "Refused presses" }).textContent(), "1");
  },
  "tabs-keyboard": async ({ page, observe, shot }) => {
    await page.locator(tabsRegion).scrollIntoViewIfNeeded();
    await shot("tabs", "Open the page and scroll to the section named Tabs.", page.locator(tabsRegion));
    for (const [index, { list, start, keys, focused, selected }] of keyboardTable.entries()) {
      const row = `${list}, from ${start}, ${keys.join(" then ")}`;
      await startAt(page, list, start);
      for (const key of keys) await page.keyboard.press(key);
      await page.waitForFunction(
        ([name, wanted]) =>
          document.activeElement?.closest(`[role="tablist"][aria-label="${name}"]`) !== null &&
          document.activeElement?.textContent?.includes(wanted),
        [list, focused],
      );
      await shot(`keys-${index + 1}`, `In ${list}, start at ${start} and press ${keys.join(", then ")}.`, tabList(page, list).locator(".."));
      const after = await stateOf(page, list);
      observe(`${row}: focused tab`, after.focused, focused);
      observe(`${row}: selected tab`, after.selected, selected);
      observe(`${row}: panels shown`, after.shown.join(), panelOf(selected));
      observe(`${row}: tab stops`, after.tabStops.join(), selected);
    }
  },
  "tabs-focus": async ({ page, observe, shot, expected }) => {
    const region = page.locator(tabsRegion);
    await region.scrollIntoViewIfNeeded();
    await startAt(page, manual, two);
    await startAt(page, account, security);
    const last = tabNamed(page, account, security);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await shot("focus-ring", `Click ${two} in ${manual} and ${security} in ${account}. Leave the ${account} list with Shift+Tab and come back with Tab. Focus returns to the selected tab, ${security}, which shows a focus ring.`, region);
    observe("Tab into the list: focused tab", (await stateOf(page, account)).focused, security);
    observe("focus ring: outline style", await style(last, "outline-style"), "solid");
    observe("focus ring: outline colour", await style(last, "outline-color"), expected("--solix-color-primary"));
    await page.keyboard.press("Tab");
    await shot("focus-panel", "Press Tab. Focus leaves the list for the panel.", region);
    observe("Tab out of the list: focused element", await page.evaluate(() => document.activeElement?.textContent), panelOf(security));
    await page.keyboard.press("Tab");
    await shot("focus-next-list", `Press Tab. Focus enters the next list at its selected tab, ${two}.`, region);
    observe("Tab into the next list: focused tab", (await stateOf(page, manual)).focused, two);
  },
  "tabs-run-time-writes": async ({ page, observe, shot }) => {
    const region = page.locator(tabsRegion);
    const classOfTheLibraryOrTheApp = `^(?:${LIBRARY_CLASS_PREFIX}|${stableClassPrefix}|${displayedByTheApp.class}$)`;
    const styleOfTheOneStyleProp = `--${stylePropClass("display", baseKey)}:flex`;
    const sdkHiddenRule = behaviourSdkHiddenRule(join(root, "packages/core"));
    const observeWrites = async (when) => {
      const rules = await pageStyleRules(page);
      const outsideTheSdkLayer = (rule) => rule.layers[0] !== BEHAVIOUR_SDK_LAYER;
      const written = await writtenAtRunTime(page, tabsRegion, classOfTheLibraryOrTheApp);
      observe(`${when}: rules the SDK added outside its layer`, rules.filter((rule) => rule.addedAtRunTime && outsideTheSdkLayer(rule)).map(({ text }) => text).join(" | "), "");
      observe(`${when}: rules of the library's marked styles that name no solix layer`, rules.filter((rule) => rule.fromTheLibrary && !rule.layers.some((layer) => layer === LIBRARY_CASCADE_LAYER || layer.startsWith(`${LIBRARY_CASCADE_LAYER}.`))).map(({ text }) => text).join(" | "), "");
      observe(`${when}: important declarations outside the SDK's layer`, rules.filter((rule) => rule.important.length > 0 && outsideTheSdkLayer(rule)).map(({ text }) => text).join(" | "), "");
      observe(`${when}: the SDK added the hidden rule the build reads from it`, (await stylesAddedToThePage(page)).includes(sdkHiddenRule), true);
      observe(`${when}: style attributes on the parts`, written.partStyles, ["", styleOfTheOneStyleProp, displayedByTheApp.style].sort().join(" | "));
      observe(`${when}: style attribute on the html element`, written.htmlStyle, "");
      observe(`${when}: inert elements`, written.inert, 0);
      observe(`${when}: parts that carry a class neither the library nor the app gave`, written.partsWithAForeignClass, 0);
    };
    await region.scrollIntoViewIfNeeded();
    await shot("tabs", "Open the page and scroll to the section named Tabs.", region);
    await observeWrites("after hydration");
    await startAt(page, account, overview);
    for (const key of ["ArrowRight", "End", "Home"]) await page.keyboard.press(key);
    await tabNamed(page, optional, notes).click();
    await tabNamed(page, optional, notes).click();
    await shot("after-keys", `Click ${overview} in ${account} and press the right arrow, End and Home. Click ${notes} in ${optional} twice.`, region);
    await observeWrites("after clicks and keys");
  },
  "server-render": async ({ browser, url, observe, shot, directory, expected }) => {
    const html = await (await fetch(url)).text();
    writeFileSync(join(directory, "response.html"), html);
    observe("the response already contains the Default button", /<button[^>]*>Default<\/button>/.test(html), true);
    observe("the response already contains the Toggle summary", /<summary[^>]*>Toggle<\/summary>/.test(html), true);

    const scriptless = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 640, height: 360 } });
    const page = await scriptless.newPage();
    await openedBeforeHydration(page, url, "load");
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
  bypassCSP: true,
  viewport: { width: 640, height: 360 },
  recordVideo: { dir: directory, size: { width: 640, height: 360 } },
});
const page = await recorded.newPage();
const consoleProblems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") consoleProblems.push(message.text());
});
page.on("pageerror", (error) => consoleProblems.push(String(error)));
await openedAndHydrated(page, url);

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
