import type postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { enclosingAtRules } from "#/tests/cascade-layers.ts";

type Described = { text: string; namesAnElementType: boolean; requiresAClass: boolean };

const branchingPseudoClasses = [":is", ":where"];
const classAttribute = "class";
const colorSchemeProperty = "color-scheme";
const customPropertyPrefix = "--";
const described = new Map<string, Described[]>();

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
  const known = described.get(rule.selector);
  if (known) return known;
  const found = selectorParser()
    .astSync(rule.selector)
    .map((selector) => ({
      text: selector.toString().trim(),
      namesAnElementType: subjectOf(selector).some(namesAnElementType),
      requiresAClass: selector.nodes.some(requiresAClass),
    }));
  described.set(rule.selector, found);
  return found;
}

function declaresMoreThanAnUnclassedElementMayTake(node: postcss.ChildNode): boolean {
  return (
    node.type === "decl" &&
    !node.prop.startsWith(customPropertyPrefix) &&
    node.prop.toLowerCase() !== colorSchemeProperty
  );
}

export function rulesThatStyleThePage(stylesheet: postcss.Root): string[] {
  const problems: string[] = [];
  stylesheet.walkRules((rule) => {
    if (enclosingAtRules(rule).some(({ name }) => name.endsWith("keyframes"))) return;
    const more = rule.nodes.filter(declaresMoreThanAnUnclassedElementMayTake);
    for (const selector of selectorsOf(rule)) {
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
