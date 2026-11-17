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

export type PageStyleSource = "linked" | "library" | "added";

export type PageStyleRule = {
  source: PageStyleSource;
  layerOrder: boolean;
  layers: string[];
  important: string[];
  text: string;
};

export function pageStyleRules(page: Page): Promise<PageStyleRule[]> {
  return page.evaluate((byTheLibrary) => {
    const found: PageStyleRule[] = [];
    const walk = (rules: CSSRuleList, layers: string[], source: PageStyleSource) => {
      for (const rule of rules) {
        if (rule instanceof CSSLayerBlockRule) {
          walk(rule.cssRules, [...layers, rule.name], source);
          continue;
        }
        const style = rule instanceof CSSStyleRule ? rule.style : undefined;
        const layerOrder = rule instanceof CSSLayerStatementRule;
        found.push({
          source,
          layerOrder,
          layers: layerOrder ? [...layers, ...rule.nameList] : layers,
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
      walk(
        sheet.cssRules,
        [],
        !(owner instanceof HTMLStyleElement)
          ? "linked"
          : owner.hasAttribute(byTheLibrary)
            ? "library"
            : "added",
      );
    }
    for (const sheet of document.adoptedStyleSheets) walk(sheet.cssRules, [], "added");
    return found;
  }, runTimeStyleAttribute);
}
