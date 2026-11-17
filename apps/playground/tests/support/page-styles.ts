import type { Page } from "playwright";
import { runTimeStyleAttribute } from "../../../../packages/core/src/run-time-style.ts";

export function stylesAddedToThePage(page: Page): Promise<string[]> {
  return page.evaluate(
    (byTheLibrary) => [
      ...[...document.querySelectorAll(`style:not([${byTheLibrary}])`)].map(
        (style) => style.textContent ?? "",
      ),
      ...document.adoptedStyleSheets.flatMap((sheet) =>
        [...sheet.cssRules].map((rule) => rule.cssText),
      ),
    ],
    runTimeStyleAttribute,
  );
}

export type PageStyleRule = {
  addedAtRunTime: boolean;
  addedByTheLibrary: boolean;
  layers: string[];
  important: string[];
  text: string;
};

export function pageStyleRules(page: Page): Promise<PageStyleRule[]> {
  return page.evaluate((byTheLibrary) => {
    const found: PageStyleRule[] = [];
    type Source = Pick<PageStyleRule, "addedAtRunTime" | "addedByTheLibrary">;
    const walk = (rules: CSSRuleList, layers: string[], source: Source) => {
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
      const addedByTheLibrary =
        owner instanceof HTMLStyleElement && owner.hasAttribute(byTheLibrary);
      walk(sheet.cssRules, [], {
        addedAtRunTime: owner instanceof HTMLStyleElement && !addedByTheLibrary,
        addedByTheLibrary,
      });
    }
    for (const sheet of document.adoptedStyleSheets) {
      walk(sheet.cssRules, [], { addedAtRunTime: true, addedByTheLibrary: false });
    }
    return found;
  }, runTimeStyleAttribute);
}
