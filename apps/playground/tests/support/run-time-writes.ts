import { join } from "node:path";
import type { Page } from "playwright";
import {
  behaviourSdkHiddenRule,
  LIBRARY_CLASS_PREFIX,
} from "../../../../packages/core/build-pipeline.mjs";
import { stableClassPrefix } from "../../../../packages/core/src/stable-class.ts";
import { baseKey, stylePropClass } from "../../../../packages/core/src/style-prop-table.ts";
import {
  namesTheLibraryLayer,
  outsideTheSdkLayer,
  pageStyleRules,
  stylesAddedToThePage,
} from "#/tests/support/page-styles.ts";
import { displayedByTheApp, tabsRegion } from "#/tests/support/tabs.ts";

const sdkHiddenRule = behaviourSdkHiddenRule(
  join(import.meta.dirname, "../../../../packages/core"),
);
const classOfTheLibraryOrTheApp = `^(?:${LIBRARY_CLASS_PREFIX}|${stableClassPrefix}|${displayedByTheApp.class}$)`;

export type RunTimeWrites = {
  rulesTheSdkAddedOutsideItsLayer: string[];
  libraryRulesThatNameNoLibraryLayer: string[];
  importantRulesOutsideTheSdkLayer: string[];
  theSdkAddedTheHiddenRuleTheBuildReadsFromIt: boolean;
  styleAttributesOnTheTabsParts: string[];
  styleAttributeOnTheHtmlElement: string;
  inertElements: number;
  tabsPartsThatCarryAClassNeitherTheLibraryNorTheAppGave: number;
};

export const writesOfTheLibraryAndTheAppAlone: RunTimeWrites = {
  rulesTheSdkAddedOutsideItsLayer: [],
  libraryRulesThatNameNoLibraryLayer: [],
  importantRulesOutsideTheSdkLayer: [],
  theSdkAddedTheHiddenRuleTheBuildReadsFromIt: true,
  styleAttributesOnTheTabsParts: [
    "",
    `--${stylePropClass("display", baseKey)}:flex`,
    displayedByTheApp.style,
  ].sort(),
  styleAttributeOnTheHtmlElement: "",
  inertElements: 0,
  tabsPartsThatCarryAClassNeitherTheLibraryNorTheAppGave: 0,
};

export async function runTimeWrites(page: Page): Promise<RunTimeWrites> {
  const rules = await pageStyleRules(page);
  const added = await stylesAddedToThePage(page);
  const written = await page.evaluate(
    ([region, ownClass]) => {
      const parts = [...document.querySelectorAll(`${region} [data-slot]`)];
      const ours = new RegExp(ownClass);
      return {
        partStyles: [...new Set(parts.map((part) => part.getAttribute("style") ?? ""))].sort(),
        htmlStyle: document.documentElement.getAttribute("style") ?? "",
        inert: document.querySelectorAll("[inert]").length,
        foreign: parts.filter((part) => [...part.classList].some((name) => !ours.test(name)))
          .length,
      };
    },
    [tabsRegion, classOfTheLibraryOrTheApp] as const,
  );
  return {
    rulesTheSdkAddedOutsideItsLayer: rules
      .filter((rule) => rule.addedAtRunTime && outsideTheSdkLayer(rule))
      .map(({ text }) => text),
    libraryRulesThatNameNoLibraryLayer: rules
      .filter((rule) => rule.fromTheLibrary && !namesTheLibraryLayer(rule))
      .map(({ text }) => text),
    importantRulesOutsideTheSdkLayer: rules
      .filter((rule) => rule.important.length > 0 && outsideTheSdkLayer(rule))
      .map(({ text }) => text),
    theSdkAddedTheHiddenRuleTheBuildReadsFromIt: added.includes(sdkHiddenRule),
    styleAttributesOnTheTabsParts: written.partStyles,
    styleAttributeOnTheHtmlElement: written.htmlStyle,
    inertElements: written.inert,
    tabsPartsThatCarryAClassNeitherTheLibraryNorTheAppGave: written.foreign,
  };
}
