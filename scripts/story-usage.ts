import { join } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  declarationKey,
  descendants,
  isExported,
  openProgram,
  type Program,
  staticPropertyName,
  symbolOf,
  ts,
  unwrapped,
} from "#/scripts/syntax.ts";

export type StoryUse = {
  readonly story: string;
  readonly props: readonly string[];
  readonly played: boolean;
};

const storyControlsDeclarations = join(repositoryRoot, "apps/storybook/story-controls.d.ts");
const everyValueHelper = "everyValueOf";
const childrenProp = "children";
const annotation = { args: "args", render: "render", play: "play", component: "component" };

function keyOf(program: Program, node: ts.Node): string | undefined {
  const target = ts.isPropertyAccessExpression(node) ? node.name : node;
  const declaration = symbolOf(program, target)?.declarations?.[0]?.resolve();
  return declaration && declarationKey(declaration);
}

function fieldOf(literal: ts.ObjectLiteralExpression, name: string): ts.Node | undefined {
  for (const property of literal.properties) {
    if (staticPropertyName(property) !== name) continue;
    if (ts.isPropertyAssignment(property)) return unwrapped(property.initializer);
    if (ts.isMethodDeclaration(property)) return property;
  }
  return undefined;
}

function argNames(literal: ts.ObjectLiteralExpression | undefined): string[] {
  const args = literal && fieldOf(literal, annotation.args);
  return args && ts.isObjectLiteralExpression(args)
    ? args.properties.flatMap((property) => staticPropertyName(property) ?? [])
    : [];
}

function initializerOf(program: Program, name: ts.Node): ts.Expression | undefined {
  const declaration = symbolOf(program, name)?.declarations?.[0]?.resolve();
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
    ? unwrapped(declaration.initializer)
    : undefined;
}

function reachedFrom(program: Program, root: ts.Node | undefined, file: string): ts.Node[] {
  const seen = new Set<ts.Node>();
  const visit = (node: ts.Node): void => {
    if (seen.has(node)) return;
    seen.add(node);
    for (const inner of descendants(node)) {
      if (!ts.isIdentifier(inner)) continue;
      const local = symbolOf(program, inner)?.declarations?.[0]?.resolve();
      if (local && ts.isFunctionDeclaration(local) && local.getSourceFile().fileName === file) {
        visit(local);
      }
    }
  };
  if (root) visit(root);
  return [...seen].flatMap((node) => [node, ...descendants(node)]);
}

function jsxElementsIn(nodes: readonly ts.Node[]) {
  return nodes.filter(
    (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node),
  ) as (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[];
}

function forwardsItsProps(
  program: Program,
  wrapper: ts.FunctionDeclaration,
  component: string,
): boolean {
  const [parameter] = wrapper.parameters;
  if (!parameter || !ts.isIdentifier(parameter.name)) return false;
  const props = parameter.name.text;
  return jsxElementsIn(descendants(wrapper)).some(
    (element) =>
      keyOf(program, element.tagName) === component &&
      element.attributes.properties.some(
        (attribute) =>
          ts.isJsxSpreadAttribute(attribute) && attribute.expression.getText() === props,
      ),
  );
}

function wrappersOf(program: Program, source: ts.SourceFile, component: string): Set<string> {
  return new Set([
    component,
    ...source.statements
      .filter(ts.isFunctionDeclaration)
      .filter((wrapper) => forwardsItsProps(program, wrapper, component))
      .flatMap((wrapper) => {
        const key = wrapper.name && keyOf(program, wrapper.name);
        return key === undefined ? [] : [key];
      }),
  ]);
}

function attributesOn(
  program: Program,
  nodes: readonly ts.Node[],
  components: ReadonlySet<string>,
): string[] {
  return jsxElementsIn(nodes).flatMap((node) => {
    if (!components.has(keyOf(program, node.tagName) ?? "")) return [];
    const children =
      ts.isJsxOpeningElement(node) &&
      ts.isJsxElement(node.parent) &&
      node.parent.children.length > 0
        ? [childrenProp]
        : [];
    return [
      ...children,
      ...node.attributes.properties.flatMap((attribute) =>
        ts.isJsxAttribute(attribute) ? [attribute.name.getText()] : [],
      ),
    ];
  });
}

function shownValuesOf(expression: ts.Expression): string[] {
  if (!ts.isCallExpression(expression) || expression.expression.getText() !== everyValueHelper) {
    return [];
  }
  const prop = expression.arguments[1];
  return prop && ts.isStringLiteral(prop) ? [prop.text] : [];
}

function storiesIn(program: Program, file: string): StoryUse[] {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${file}: TypeScript could not read this file.`);
  const exported = source.statements.find(ts.isExportAssignment);
  const meta = exported && initializerOf(program, exported.expression);
  if (!meta || !ts.isObjectLiteralExpression(meta)) {
    throw new Error(`${file}: the default export is not a meta object literal.`);
  }
  const componentField = fieldOf(meta, annotation.component);
  const component = componentField && keyOf(program, componentField);
  if (component === undefined) throw new Error(`${file}: the meta names no component.`);
  const components = wrappersOf(program, source, component);
  const metaRender = fieldOf(meta, annotation.render);
  const metaPlayed = fieldOf(meta, annotation.play) !== undefined;
  return source.statements
    .filter(ts.isVariableStatement)
    .filter(isExported)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .flatMap((declaration) => {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return [];
      const story = unwrapped(declaration.initializer);
      const literal = ts.isObjectLiteralExpression(story) ? story : undefined;
      const render = (literal && fieldOf(literal, annotation.render)) ?? metaRender;
      const props = [
        ...argNames(meta),
        ...argNames(literal),
        ...attributesOn(program, reachedFrom(program, render, file), components),
        ...shownValuesOf(story),
      ];
      return [
        {
          story: declaration.name.text,
          props: [...new Set(props)],
          played:
            metaPlayed ||
            (literal !== undefined && fieldOf(literal, annotation.play) !== undefined),
        },
      ];
    });
}

export function storyUses(files: readonly string[]): Record<string, StoryUse[]> {
  const program = openProgram([...files, storyControlsDeclarations]);
  try {
    return Object.fromEntries(files.map((file) => [file, storiesIn(program, file)]));
  } finally {
    program.dispose();
  }
}
