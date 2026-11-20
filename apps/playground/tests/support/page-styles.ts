import type { Page } from "playwright";
import {
  BEHAVIOUR_SDK_LAYER,
  LIBRARY_CASCADE_LAYER,
} from "../../../../packages/core/build-pipeline.mjs";
import { libraryStyleMark } from "../../../../packages/core/src/style-prop-table.ts";

export function stylesAddedToThePage(page: Page): Promise<string[]> {
  return page.evaluate(
    (mark) => [
      ...[...document.querySelectorAll(`style:not([${mark}])`)].map(
        (style) => style.textContent ?? "",
      ),
      ...document.adoptedStyleSheets.flatMap((sheet) =>
        [...sheet.cssRules].map((rule) => rule.cssText),
      ),
    ],
    libraryStyleMark,
  );
}

export type PageStyleRule = {
  addedAtRunTime: boolean;
  fromTheLibrary: boolean;
  layers: string[];
  important: string[];
  text: string;
};

export function outsideTheSdkLayer(rule: PageStyleRule): boolean {
  return rule.layers[0] !== BEHAVIOUR_SDK_LAYER;
}

export function namesTheLibraryLayer(rule: PageStyleRule): boolean {
  return rule.layers.some(
    (layer) => layer === LIBRARY_CASCADE_LAYER || layer.startsWith(`${LIBRARY_CASCADE_LAYER}.`),
  );
}

export function pageStyleRules(page: Page): Promise<PageStyleRule[]> {
  return page.evaluate((mark) => {
    const found: PageStyleRule[] = [];
    const walk = (
      rules: CSSRuleList,
      layers: string[],
      source: Pick<PageStyleRule, "addedAtRunTime" | "fromTheLibrary">,
    ) => {
      for (const rule of rules) {
        if (rule instanceof CSSLayerBlockRule) {
          walk(rule.cssRules, [...layers, rule.name], source);
          continue;
        }
        const style = rule instanceof CSSStyleRule ? rule.style : undefined;
        found.push({
          ...source,
          layers: rule instanceof CSSLayerStatementRule ? [...layers, ...rule.nameList] : layers,
          important: style
            ? Array.from(style).filter((name) => style.getPropertyPriority(name) === "important")
            : [],
          text: rule.cssText,
        });
        if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList) {
          walk(rule.cssRules, layers, source);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      const owner = sheet.ownerNode;
      const fromTheLibrary = owner instanceof HTMLStyleElement && owner.hasAttribute(mark);
      walk(sheet.cssRules, [], {
        addedAtRunTime: owner instanceof HTMLStyleElement && !fromTheLibrary,
        fromTheLibrary,
      });
    }
    for (const sheet of document.adoptedStyleSheets) {
      walk(sheet.cssRules, [], { addedAtRunTime: true, fromTheLibrary: false });
    }
    return found;
  }, libraryStyleMark);
}
