import type postcss from "postcss";
import selectorParser from "postcss-selector-parser";

type Described = { text: string; namesAnElementType: boolean; requiresAClass: boolean };

const branchingPseudoClasses = [":is", ":where"];
const classAttribute = "class";
const colorSchemeProperty = "color-scheme";
const customPropertyPrefix = "--";

function branchesOf(node: selectorParser.Node): selectorParser.Selector[] {
  return selectorParser.isPseudoClass(node) &&
    branchingPseudoClasses.includes(node.value.toLowerCase())
    ? node.nodes
    : [];
}

function subjectOf(selector: selectorParser.Selector): selectorParser.Node[] {
  return selector.nodes.slice(selector.nodes.findLastIndex(selectorParser.isCombinator) + 1);
}

function namesAnElementType(node: selectorParser.Node): boolean {
  return (
    selectorParser.isTag(node) ||
    branchesOf(node).some((branch) => subjectOf(branch).some(namesAnElementType))
  );
}

function requiresAClass(node: selectorParser.Node): boolean {
  if (selectorParser.isClassName(node)) return true;
  if (selectorParser.isAttribute(node)) return node.attribute.toLowerCase() === classAttribute;
  const branches = branchesOf(node);
  return branches.length > 0 && branches.every((branch) => branch.nodes.some(requiresAClass));
}

function selectorsOf(rule: postcss.Rule): Described[] {
  return selectorParser()
    .astSync(rule.selector)
    .map((selector) => ({
      text: selector.toString().trim(),
      namesAnElementType: subjectOf(selector).some(namesAnElementType),
      requiresAClass: selector.nodes.some(requiresAClass),
    }));
}

function declaresMoreThanAnUnclassedElementMayTake(node: postcss.ChildNode): boolean {
  return (
    node.type === "decl" &&
    !node.prop.startsWith(customPropertyPrefix) &&
    node.prop.toLowerCase() !== colorSchemeProperty
  );
}

function containersAround(node: postcss.Node): postcss.Node[] {
  const parent = node.parent;
  return parent === undefined ? [] : [parent, ...containersAround(parent)];
}

function isStyleRule(node: postcss.Node | undefined): node is postcss.Rule {
  return node?.type === "rule";
}

function isKeyframes(node: postcss.Node): boolean {
  return node.type === "atrule" && "name" in node && String(node.name).endsWith("keyframes");
}

function written(node: postcss.Rule | postcss.AtRule): string {
  return node.type === "rule" ? node.selector : `@${node.name} ${node.params}`;
}

export function rulesThatStyleThePage(stylesheet: postcss.Root): string[] {
  const problems: string[] = [];
  stylesheet.walk((node) => {
    if (node.type !== "rule" && node.type !== "atrule") return;
    const around = containersAround(node);
    if (isStyleRule(node.parent)) {
      problems.push(
        `${written(node)}: it is nested in the rule ${node.parent.selector}. Write every rule and at-rule of the library outside any style rule, so each declaration is read against the selector of the rule that holds it.`,
      );
    }
    if (node.type !== "rule" || around.some(isStyleRule) || around.some(isKeyframes)) return;
    const more = node.nodes.filter(declaresMoreThanAnUnclassedElementMayTake);
    for (const selector of selectorsOf(node)) {
      if (selector.namesAnElementType) {
        problems.push(
          `${selector.text}: its subject names an element type. Select a class the library puts on its own element, and leave <body>, <html> and every other element of the page to the app.`,
        );
      }
      if (!selector.requiresAClass && more.length > 0) {
        problems.push(
          `${selector.text}: it requires no class and declares ${more.map(String).join("; ")}. Without a class, declare only custom properties and ${colorSchemeProperty}, so the library sets nothing else on a page's own <html> and <body>.`,
        );
      }
    }
  });
  return problems;
}
