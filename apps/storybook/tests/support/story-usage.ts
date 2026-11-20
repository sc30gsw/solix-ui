import { join } from "node:path";
import { repositoryRoot } from "../../../../scripts/repository.ts";
import {
  declarationsOf,
  declarationsOfSymbol,
  descendants,
  hasCallSignature,
  isExported,
  type Program,
  reachedFrom,
  staticPropertyName,
  symbolOf,
  ts,
  unwrapped,
} from "../../../../scripts/syntax.ts";

export type StoryUse = {
  readonly story: string;
  readonly props: ReadonlySet<string>;
  readonly played: boolean;
  readonly shows?: string;
};

export type StoryFileUse = {
  readonly file: string;
  readonly component: readonly ts.Node[];
  readonly stories: readonly StoryUse[];
  readonly problems: readonly string[];
};

export const everyValueFile = join(repositoryRoot, "apps/storybook/every-value.tsx");
const everyValueHelper = "everyValueOf";
const childrenProp = "children";
const annotation = { args: "args", render: "render", play: "play", component: "component" };

type Element = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
type Target = { readonly key: ts.Node; readonly overridden: ReadonlySet<string> };

function valueDeclarations(program: Program, node: ts.Node): ts.Node[] {
  const target = ts.isPropertyAccessExpression(node) ? node.name : node;
  return declarationsOfSymbol(symbolOf(program, target)).flatMap((declaration) =>
    ts.isBinaryExpression(declaration)
      ? valueDeclarations(program, declaration.right)
      : [declaration],
  );
}

function fieldOf(
  literal: ts.ObjectLiteralExpression | undefined,
  name: string,
): ts.Node | undefined {
  for (const property of literal?.properties ?? []) {
    if (staticPropertyName(property) !== name) continue;
    if (ts.isPropertyAssignment(property)) return unwrapped(property.initializer);
    if (ts.isMethodDeclaration(property)) return property;
  }
  return undefined;
}

function argNames(literal: ts.ObjectLiteralExpression | undefined): string[] {
  const args = fieldOf(literal, annotation.args);
  return args && ts.isObjectLiteralExpression(args)
    ? args.properties.flatMap((property) => staticPropertyName(property) ?? [])
    : [];
}

function elementsIn(nodes: readonly ts.Node[]): Element[] {
  return nodes.flatMap((node) =>
    ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? [node] : [],
  );
}

function namesAfter(element: Element, spread: string): Set<string> {
  const attributes = element.attributes.properties;
  const at = attributes.findIndex(
    (attribute) => ts.isJsxSpreadAttribute(attribute) && attribute.expression.getText() === spread,
  );
  return new Set(
    attributes
      .slice(at + 1)
      .flatMap((attribute) => (ts.isJsxAttribute(attribute) ? [attribute.name.getText()] : [])),
  );
}

function spreadOf(element: Element, name: string): boolean {
  return element.attributes.properties.some(
    (attribute) => ts.isJsxSpreadAttribute(attribute) && attribute.expression.getText() === name,
  );
}

function firstParameterName(node: ts.Node | undefined): string | undefined {
  const parameter =
    node &&
    (ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node))
      ? node.parameters[0]
      : undefined;
  return parameter && ts.isIdentifier(parameter.name) ? parameter.name.text : undefined;
}

function isComponent(program: Program, element: Element, component: readonly ts.Node[]): boolean {
  return valueDeclarations(program, element.tagName).some((declaration) =>
    component.includes(declaration),
  );
}

function targetsIn(
  program: Program,
  source: ts.SourceFile,
  component: readonly ts.Node[],
): Target[] {
  const wrappers = source.statements
    .filter(ts.isFunctionDeclaration)
    .flatMap((wrapper): Target[] => {
      const props = firstParameterName(wrapper);
      const forwarded =
        props === undefined
          ? undefined
          : elementsIn(descendants(wrapper)).find(
              (element) => isComponent(program, element, component) && spreadOf(element, props),
            );
      return forwarded && props ? [{ key: wrapper, overridden: namesAfter(forwarded, props) }] : [];
    });
  return [...component.map((key) => ({ key, overridden: new Set<string>() })), ...wrappers];
}

function targetOf(
  program: Program,
  element: Element,
  targets: readonly Target[],
): Target | undefined {
  const declarations = valueDeclarations(program, element.tagName);
  return targets.find(({ key }) => declarations.includes(key));
}

function attributesOn(element: Element): string[] {
  const children =
    ts.isJsxOpeningElement(element) &&
    ts.isJsxElement(element.parent) &&
    element.parent.children.length > 0
      ? [childrenProp]
      : [];
  return [
    ...children,
    ...element.attributes.properties.flatMap((attribute) =>
      ts.isJsxAttribute(attribute) ? [attribute.name.getText()] : [],
    ),
  ];
}

function usedIn(
  program: Program,
  file: string,
  render: ts.Node | undefined,
  args: readonly string[],
  targets: readonly Target[],
): Set<string> {
  if (render === undefined) return new Set(args);
  const reached = reachedFrom(program, [render], (node) => node.getSourceFile().fileName !== file);
  const parameter = firstParameterName(render);
  const used = new Set<string>();
  for (const element of elementsIn(reached.nodes)) {
    const target = targetOf(program, element, targets);
    if (!target) continue;
    for (const name of attributesOn(element)) if (!target.overridden.has(name)) used.add(name);
    if (parameter === undefined || !spreadOf(element, parameter)) continue;
    const overridden = namesAfter(element, parameter);
    for (const name of args) {
      if (!overridden.has(name) && !target.overridden.has(name)) used.add(name);
    }
  }
  return used;
}

function everyValueCall(
  program: Program,
  expression: ts.Expression,
): ts.CallExpression | undefined {
  if (!ts.isCallExpression(expression)) return undefined;
  const helper = declarationsOf(program, expression.expression).some(
    (declaration) =>
      ts.isFunctionDeclaration(declaration) &&
      declaration.name?.text === everyValueHelper &&
      declaration.getSourceFile().fileName === everyValueFile,
  );
  return helper ? expression : undefined;
}

export function storyFileUse(
  program: Program,
  file: string,
  indexed: ReadonlySet<string>,
): StoryFileUse {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${file}: TypeScript could not read this file.`);
  const exported = source.statements.find(ts.isExportAssignment);
  const metaDeclaration =
    exported && declarationsOfSymbol(symbolOf(program, exported.expression))[0];
  const meta =
    metaDeclaration && ts.isVariableDeclaration(metaDeclaration) && metaDeclaration.initializer
      ? unwrapped(metaDeclaration.initializer)
      : undefined;
  if (!meta || !ts.isObjectLiteralExpression(meta)) {
    throw new Error(`${file}: the default export is not a meta object literal.`);
  }
  const componentField = fieldOf(meta, annotation.component);
  const component = componentField ? valueDeclarations(program, componentField) : [];
  const targets = targetsIn(program, source, component);
  const metaRender = fieldOf(meta, annotation.render);
  const metaPlayed = hasCallSignature(program, fieldOf(meta, annotation.play));
  const problems: string[] = [];
  const stories = source.statements
    .filter(isExported)
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .flatMap((declaration): StoryUse[] => {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return [];
      const story = declaration.name.text;
      if (!indexed.has(story)) return [];
      const initializer = unwrapped(declaration.initializer);
      const call = everyValueCall(program, initializer);
      if (call) {
        const [given, prop] = call.arguments;
        const ownMeta =
          given !== undefined &&
          declarationsOfSymbol(symbolOf(program, given)).some((node) => node === metaDeclaration);
        if (!ownMeta)
          problems.push(
            `${file}: ${story} gives everyValueOf another meta than the file's default export.`,
          );
        const shown = ownMeta && prop && ts.isStringLiteral(prop) ? prop.text : undefined;
        return [
          {
            story,
            props: new Set(shown ? [shown] : []),
            played: false,
            ...(shown ? { shows: shown } : {}),
          },
        ];
      }
      const literal = ts.isObjectLiteralExpression(initializer) ? initializer : undefined;
      const render = fieldOf(literal, annotation.render) ?? metaRender;
      const args = [...argNames(meta), ...argNames(literal)];
      return [
        {
          story,
          props: usedIn(program, file, render, args, targets),
          played: metaPlayed || hasCallSignature(program, fieldOf(literal, annotation.play)),
        },
      ];
    });
  return { file, component, stories, problems };
}
