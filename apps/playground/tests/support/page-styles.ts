import type { Page } from "playwright";

export function stylesAddedToThePage(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...[...document.querySelectorAll("style")].map((style) => style.textContent ?? ""),
    ...document.adoptedStyleSheets.flatMap((sheet) =>
      [...sheet.cssRules].map((rule) => rule.cssText),
    ),
  ]);
}

export type PageStyleRule = {
  addedAtRunTime: boolean;
  layers: string[];
  important: string[];
  text: string;
};

export function pageStyleRules(page: Page): Promise<PageStyleRule[]> {
  return page.evaluate(() => {
    const found: PageStyleRule[] = [];
    const walk = (rules: CSSRuleList, layers: string[], addedAtRunTime: boolean) => {
      for (const rule of rules) {
        if (rule instanceof CSSLayerBlockRule) {
          walk(rule.cssRules, [...layers, rule.name], addedAtRunTime);
          continue;
        }
        const style = rule instanceof CSSStyleRule ? rule.style : undefined;
        found.push({
          addedAtRunTime,
          layers: rule instanceof CSSLayerStatementRule ? [...layers, ...rule.nameList] : layers,
          important: style
            ? Array.from(style).filter((name) => style.getPropertyPriority(name) === "important")
            : [],
          text: rule.cssText,
        });
        if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList) {
          walk(rule.cssRules, layers, addedAtRunTime);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      walk(sheet.cssRules, [], sheet.ownerNode instanceof HTMLStyleElement);
    }
    for (const sheet of document.adoptedStyleSheets) walk(sheet.cssRules, [], true);
    return found;
  });
}
