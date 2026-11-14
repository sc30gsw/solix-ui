import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import ts from "typescript";
import { expect, test } from "vite-plus/test";
import {
  stylePropNames,
  stylePropTable,
  visibilityPropNames,
} from "../packages/core/src/style-prop-table";
import { tokenValues } from "../scripts/tokens";
import { libraryPackages, packages, repositoryRoot } from "./support/workspace";

const componentFile = /^[A-Z][A-Za-z0-9]*\.tsx$/;
const helperFile =
  /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts|[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.stylex\.ts|index\.ts)$/;
const partName = /^[a-z][A-Za-z0-9]*$/;
const tokenName = /^--solix-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stylexImport = 'import * as stylex from "@stylexjs/stylex";';
const stylesVariable = "styles";
const stylesFactory = "stylex.create";
const rootComponent = "Box";
const partsHelper = "createParts";
const partsHelperFile = "packages/core/src/parts.ts";
const partPropsType = `PartProps<typeof ${stylesVariable}>`;
const rootPart = "root";
const featureDirectory = join(repositoryRoot, ".agents/skills/verify-playground/features");
const contractSkill = join(repositoryRoot, ".agents/skills/verify-component-contract/SKILL.md");
const stylePropTableFile = "packages/core/src/style-prop-table.ts";
const libraryCode = ["*.{ts,tsx,mjs,js}", "src/**/*.{ts,tsx,mjs,js}"];

const libraries = libraryPackages.map(({ directory, manifest }) => ({
  name: manifest.name ?? directory,
  source: join(directory, "src"),
}));

type Component = { name: string; file: string; source: ts.SourceFile };

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

type ComponentBody = {
  name: string;
  fn: ts.FunctionDeclaration;
  source: ts.SourceFile;
  propsType: ts.TypeNode | undefined;
  shape: RootShape;
};

type RootShape = {
  alsoOmits: string[];
  rendersItsElement: (component: ts.Expression | undefined) => boolean;
  componentAttribute: string;
};

type PartUse = { part: string | undefined; call: ts.CallExpression; tag: JsxTag | undefined };

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function relativePath(file: string): string {
  return relative(repositoryRoot, file);
}

const components: Component[] = libraries.flatMap(({ source }) =>
  readdirSync(source)
    .filter((entry) => componentFile.test(entry))
    .sort()
    .map((entry) => ({
      name: basename(entry, ".tsx"),
      file: join(source, entry),
      source: parse(join(source, entry)),
    })),
);

function descendants(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (child: ts.Node): void => {
    found.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function exportedNames(source: ts.SourceFile): string[] {
  return source.statements.flatMap((statement) => {
    if (ts.isExportAssignment(statement) || ts.isExportDeclaration(statement)) return ["<other>"];
    const exported = ts.canHaveModifiers(statement)
      ? ts
          .getModifiers(statement)
          ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      : false;
    if (!exported) return [];
    if (ts.isFunctionDeclaration(statement)) return [statement.name?.text ?? "<anonymous>"];
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.map((declaration) =>
        declaration.name.getText(),
      );
    }
    return ["<other>"];
  });
}

function callsOf(node: ts.Node, callee: string): ts.CallExpression[] {
  return descendants(node).filter(
    (found): found is ts.CallExpression =>
      ts.isCallExpression(found) && found.expression.getText() === callee,
  );
}

function stylesBlock(source: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
  const declaration = descendants(source).find(
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) &&
      node.name.getText() === stylesVariable &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText() === stylesFactory,
  );
  const argument =
    declaration?.initializer && ts.isCallExpression(declaration.initializer)
      ? declaration.initializer.arguments[0]
      : undefined;
  return argument && ts.isObjectLiteralExpression(argument) ? argument : undefined;
}

function stylesKeys(source: ts.SourceFile): string[] {
  return (stylesBlock(source)?.properties ?? []).flatMap((property) =>
    ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) ? [property.name.text] : [],
  );
}

function jsxAttributes(fn: ts.FunctionDeclaration, names: string[]): ts.JsxAttribute[] {
  return descendants(fn).filter(
    (node): node is ts.JsxAttribute =>
      ts.isJsxAttribute(node) && names.includes(node.name.getText()),
  );
}

function stringLiteralText(node: ts.Node | undefined): string | undefined {
  return node && ts.isStringLiteral(node) ? node.text : undefined;
}

function attributeNamesOf(tag: JsxTag): string[] {
  return tag.attributes.properties.map((property) =>
    ts.isJsxSpreadAttribute(property)
      ? `...${property.expression.getText()}`
      : property.name.getText(),
  );
}

function spreadsRestBefore(tag: JsxTag, names: string[]): boolean {
  const written = attributeNamesOf(tag);
  const spreadAt = written.indexOf("...rest");
  return spreadAt !== -1 && names.every((name) => spreadAt < written.indexOf(name));
}

function attributeValue(tag: JsxTag, name: string): ts.Expression | undefined {
  const found = tag.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
  if (!found?.initializer) return undefined;
  return ts.isJsxExpression(found.initializer) ? found.initializer.expression : found.initializer;
}

function isPropsMember(node: ts.Node, member: string): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.expression.getText() === "props" &&
    node.name.text === member
  );
}

function isComponentPropWithDefault(node: ts.Node | undefined): boolean {
  return (
    node !== undefined &&
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    isPropsMember(node.left, "component") &&
    ts.isStringLiteral(node.right)
  );
}

function isDynamicRootWithDefault(initializer: ts.Expression | undefined): boolean {
  if (!initializer || !ts.isCallExpression(initializer)) return false;
  const [factory, ...others] = initializer.arguments;
  if (initializer.expression.getText() !== "dynamic" || !factory || others.length > 0) return false;
  if (!ts.isArrowFunction(factory) || factory.parameters.length > 0) return false;
  return isComponentPropWithDefault(factory.body);
}

function memberOf(node: ts.Node | undefined, member: string): string | undefined {
  return node && ts.isPropertyAccessExpression(node) && node.name.text === member
    ? node.expression.getText()
    : undefined;
}

function returnedRoots(fn: ts.FunctionDeclaration): JsxTag[] {
  return descendants(fn).flatMap((node): JsxTag[] => {
    if (!ts.isReturnStatement(node) || !node.expression) return [];
    const returned = ts.isParenthesizedExpression(node.expression)
      ? node.expression.expression
      : node.expression;
    if (ts.isJsxElement(returned)) return [returned.openingElement];
    return ts.isJsxSelfClosingElement(returned) ? [returned] : [];
  });
}

function rootComponentProblems({ name, fn, source }: ComponentBody): string[] {
  const problems: string[] = [];
  if (stylesKeys(source).length > 0 || callsOf(source, stylesFactory).length > 0) {
    problems.push(
      `${name} has one unstyled root, so it calls no ${stylesFactory}. Write a component that renders a <${name}> for anything with a default style.`,
    );
  }
  const [root, ...otherRoots] = returnedRoots(fn);
  const classAttributes = jsxAttributes(fn, ["class"]);
  const [classAttribute] = classAttributes;
  const classes =
    classAttribute?.initializer && ts.isJsxExpression(classAttribute.initializer)
      ? classAttribute.initializer.expression
      : undefined;
  if (
    !root ||
    otherRoots.length > 0 ||
    classAttributes.length !== 1 ||
    classAttribute.parent.parent !== root ||
    !classes ||
    !ts.isArrayLiteralExpression(classes)
  ) {
    return [
      ...problems,
      `return one root element, and write its class, and no other, as an array: ["solix-${name}-root", <resolved style props>.classes, props.class].`,
    ];
  }
  const tag = root.tagName.getText();
  const tagDeclaration = descendants(fn).find(
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) && node.name.getText() === tag,
  );
  if (!isDynamicRootWithDefault(tagDeclaration?.initializer)) {
    problems.push(
      `render the root as a component made by \`const ${tag} = dynamic(() => props.component ?? "<element>")\`, the dynamic() of @solidjs/web with the element it renders by default.`,
    );
  }
  const [stable, styleProps, consumer, ...extra] = classes.elements;
  const resolved = memberOf(styleProps, "classes");
  if (
    stringLiteralText(stable) !== `solix-${name}-root` ||
    resolved === undefined ||
    consumer?.getText() !== "props.class" ||
    extra.length > 0
  ) {
    problems.push(
      `write the root class array as ["solix-${name}-root", <resolved style props>.classes, props.class], so the style-prop classes sit before the consumer's class.`,
    );
  }
  if (resolved === undefined || memberOf(attributeValue(root, "style"), "style") !== resolved) {
    problems.push(
      "set style to the .style of the same resolved style props, which puts the consumer's style after the style props'.",
    );
  }
  const resolvesProps = callsOf(fn, "resolveStyleProps").some(
    (call) => call.arguments.map((argument) => argument.getText()).join() === "props",
  );
  if (!resolvesProps) {
    problems.push("resolve the style props with resolveStyleProps(props) from ./style-props.");
  }
  if (!spreadsRestBefore(root, ["class", "style"])) {
    problems.push(
      "spread {...rest} on the root element before its class and style, so the library's merged values are the ones that apply.",
    );
  }
  return problems;
}

function partsFunctionOf(fn: ts.FunctionDeclaration, name: string): string | undefined {
  const calls = callsOf(fn, partsHelper);
  const [call] = calls;
  const declaration = call?.parent;
  const isDeclared =
    calls.length === 1 &&
    ts.isVariableDeclaration(declaration) &&
    ts.isIdentifier(declaration.name) &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0 &&
    call.arguments.map((argument) => argument.getText()).join(", ") ===
      `"${name}", ${stylesVariable}, props`;
  return isDeclared ? declaration.name.text : undefined;
}

function partUsesOf(fn: ts.FunctionDeclaration, partsFunction: string): PartUse[] {
  return callsOf(fn, partsFunction).map((call) => {
    const [argument, ...others] = call.arguments;
    const spread = call.parent;
    const onTag =
      ts.isJsxSpreadAttribute(spread) && spread.expression === call
        ? spread.parent.parent
        : undefined;
    return {
      part: others.length === 0 ? stringLiteralText(argument) : undefined,
      call,
      tag: onTag,
    };
  });
}

function styledComponentProblems({ name, fn, source, propsType, shape }: ComponentBody): string[] {
  const problems: string[] = [];
  const imports = source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.getText());
  if (!imports.includes(stylexImport)) problems.push(`import styles with \`${stylexImport}\`.`);
  if (!stylesBlock(source)) {
    problems.push(
      `declare the styles once, as \`const ${stylesVariable} = ${stylesFactory}({ ${rootPart}: { ... }, ... })\`, keyed by part.`,
    );
  }
  if (!propsType?.getText().includes(partPropsType)) {
    problems.push(
      `take ${partPropsType} among the props, so classes, styles and unstyled name exactly the parts of ${stylesVariable}.`,
    );
  }

  for (const call of descendants(source).filter(
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === "stylex" &&
      node.expression.getText() !== stylesFactory,
  )) {
    problems.push(
      `call ${call.expression.getText()} nowhere: ${partsHelper} in ${partsHelperFile} reads every part's class from ${stylesVariable}, so no component calls StyleX at run time itself.`,
    );
  }

  const partsFunction = partsFunctionOf(fn, name);
  if (!partsFunction) {
    problems.push(
      `declare the parts once, as \`const part = ${partsHelper}("${name}", ${stylesVariable}, props)\` from ${partsHelperFile}.`,
    );
    return problems;
  }

  for (const attribute of jsxAttributes(fn, ["class", "style"])) {
    problems.push(
      `set no ${attribute.name.getText()} attribute: spread {...${partsFunction}("<part>")} on the element, which gives it the part's class and style.`,
    );
  }

  const uses = partUsesOf(fn, partsFunction);
  for (const { part, call, tag } of uses) {
    if (part === undefined) {
      problems.push(`name the part in ${call.getText()} with one string literal.`);
    }
    if (!tag) {
      problems.push(
        `spread ${call.getText()} on its element as {...${call.getText()}}, so the element takes both the part's class and its style.`,
      );
    }
  }

  const roots = returnedRoots(fn);
  const [root] = roots;
  if (roots.length !== 1 || root.tagName.getText() !== rootComponent) {
    problems.push(
      `return one root element, a <${rootComponent}>, so the root takes every style prop, hiddenFrom and visibleFrom.`,
    );
  } else {
    const written = attributeNamesOf(root);
    const rootSpread = `...${partsFunction}("${rootPart}")`;
    if (!spreadsRestBefore(root, ["component", rootSpread]) || written.at(-1) !== rootSpread) {
      problems.push(
        `spread {...rest} on the root <${rootComponent}> before its component, and {${rootSpread}} last, so the part's class and style are the ones that apply.`,
      );
    }
    if (!shape.rendersItsElement(attributeValue(root, "component"))) {
      problems.push(`set ${shape.componentAttribute} on the root <${rootComponent}>.`);
    }
  }

  const onRoot = uses.filter(({ tag }) => tag !== undefined && tag === root);
  const rootUses = uses.filter(({ part }) => part === rootPart);
  if (
    rootUses.length !== 1 ||
    rootUses[0].tag !== root ||
    onRoot.some(({ part }) => part !== rootPart)
  ) {
    problems.push(
      `spread {...${partsFunction}("${rootPart}")} on the returned root, once, and no other part there.`,
    );
  }

  const keys = stylesKeys(source);
  const parts = [...new Set(uses.flatMap(({ part }) => (part === undefined ? [] : [part])))];
  for (const key of keys.filter((found) => !parts.includes(found))) {
    problems.push(
      `${stylesVariable}.${key} styles no element: spread {...${partsFunction}("${key}")} on the element it styles, or remove the style.`,
    );
  }
  for (const part of parts.filter((found) => !keys.includes(found))) {
    problems.push(
      `the part "${part}" has no style: add a ${part} key to ${stylesVariable}, or remove the part.`,
    );
  }
  for (const key of keys.filter((found) => !partName.test(found))) {
    problems.push(
      `name the part ${key} in camelCase, so its stable class is "solix-${name}-<part>".`,
    );
  }
  return problems;
}

const elementRoot: RootShape = {
  alsoOmits: [],
  rendersItsElement: (component) => component !== undefined && ts.isStringLiteral(component),
  componentAttribute: 'component="<element>"',
};

const polymorphicRoot: RootShape = {
  alsoOmits: ['"component"'],
  rendersItsElement: isComponentPropWithDefault,
  componentAttribute: 'component={props.component ?? "<element>"}',
};

function rootShapeOf(propsType: ts.TypeNode | undefined): RootShape | undefined {
  if (
    propsType &&
    ts.isTypeReferenceNode(propsType) &&
    propsType.typeName.getText() === "PolymorphicProps"
  ) {
    return polymorphicRoot;
  }
  return propsType?.getText().includes('ElementProps<"') ? elementRoot : undefined;
}

function problemsWith({ name, file, source }: Component): string[] {
  const where = relativePath(file);
  const problems: string[] = [];
  const report = (message: string) => problems.push(`${where}: ${message}`);

  const exported = exportedNames(source);
  if (exported.length !== 1 || exported[0] !== name) {
    report(
      `export exactly one function named "${name}" and nothing else (found: ${exported.join(", ") || "nothing"}).`,
    );
  }

  const fn = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (!fn?.body) {
    report(`declare "export function ${name}(props ...)" and nothing that replaces it.`);
    return problems;
  }

  const parameter = fn.parameters[0];
  if (fn.parameters.length !== 1 || parameter.name.getText() !== "props") {
    report('take one parameter named "props".');
  }
  const propsType = parameter?.type;
  const shape = rootShapeOf(propsType);
  const isRootComponent = name === rootComponent;
  if (!shape || (isRootComponent && shape !== polymorphicRoot)) {
    report(
      `type props as PolymorphicProps<T, Own> for a root that \`component\` picks${isRootComponent ? "" : ', or as ElementProps<"element", Own> for a root that is always one element'}, both from ./style-props, so the root's attributes and every style prop are the component's props.`,
    );
    return problems;
  }

  const first = fn.body.statements[0];
  const firstInitializer =
    first && ts.isVariableStatement(first)
      ? first.declarationList.declarations[0]?.initializer
      : undefined;
  const omitted =
    firstInitializer &&
    ts.isCallExpression(firstInitializer) &&
    firstInitializer.expression.getText() === "omit"
      ? firstInitializer.arguments.map((argument) => argument.getText())
      : [];
  const mustOmit = isRootComponent
    ? ['"class"', '"style"', '"component"', "...stylePropKeys"]
    : ['"class"', '"style"', ...shape.alsoOmits, "...partPropKeys"];
  if (omitted[0] !== "props" || mustOmit.some((key) => !omitted.includes(key))) {
    report(
      `start the body with \`const rest = omit(props, ${mustOmit.join(", ")}, ...)\`, so the consumer's class and style are merged and not overwritten, and no prop of the library's own reaches the element.`,
    );
  }

  const body: ComponentBody = { name, fn, source, propsType, shape };
  const found = isRootComponent ? rootComponentProblems(body) : styledComponentProblems(body);
  return [...problems, ...found.map((problem) => `${where}: ${problem}`)];
}

test("the library has components to check", () => {
  expect(libraries.length).toBeGreaterThan(0);
  expect(components.length).toBeGreaterThan(1);
  expect(components.map(({ name }) => name)).toContain(rootComponent);
});

test("every component is written the one way: one function, a Box root, and every part's class and style from createParts", () => {
  expect(components.flatMap(problemsWith)).toEqual([]);
});

test("every other source file is the barrel, a StyleX definition, or a kebab-case module", () => {
  const violations = libraries.flatMap(({ source }) =>
    readdirSync(source)
      .filter((entry) => !componentFile.test(entry) && !helperFile.test(entry))
      .map(
        (entry) =>
          `${relativePath(join(source, entry))}: name it Component.tsx for a component, kebab-case.ts for a module, or name.stylex.ts for StyleX variables.`,
      ),
  );

  expect(violations).toEqual([]);
});

test("the barrel exports every component once, in alphabetical order, and nothing else", () => {
  for (const { source } of libraries) {
    const names = components
      .filter(({ file }) => file.startsWith(source))
      .map(({ name }) => name)
      .sort();
    const expected = names.map((name) => `export { ${name} } from "./${name}";`);
    const actual = readFileSync(join(source, "index.ts"), "utf8").trim().split("\n");

    expect(actual, `${relativePath(join(source, "index.ts"))}`).toEqual(expected);
  }
});

test("every public token is named --solix-*, is used by a component or a style-prop scale, and is defined once", () => {
  const scalesOfStyleProps = Object.values(stylePropTable).flatMap((row) =>
    "scale" in row ? [row.scale] : [],
  );
  for (const { source } of libraries) {
    const tokensFile = relativePath(join(source, "tokens.stylex.ts"));
    const defined = Object.keys(tokenValues(tokensFile));
    const usedByStyleProps = defined.filter((name) =>
      scalesOfStyleProps.some((scale) => name.startsWith(`--solix-${scale}-`)),
    );
    const used = [
      ...usedByStyleProps,
      ...components
        .filter(({ file }) => file.startsWith(source))
        .flatMap(({ file }) =>
          [...readFileSync(file, "utf8").matchAll(/tokens\["([^"]+)"\]/g)].map(([, name]) => name),
        ),
    ];

    expect(
      defined.filter((name) => !tokenName.test(name)),
      `token names in ${tokensFile}`,
    ).toEqual([]);
    expect(
      defined.filter((name) => !used.includes(name)),
      `tokens in ${tokensFile} that no component uses and no style-prop scale covers`,
    ).toEqual([]);
    expect(
      used.filter((name) => !defined.includes(name)),
      `tokens used but not defined in ${tokensFile}`,
    ).toEqual([]);
  }
});

test("every component is rendered by the app, has a feature file, and is listed in the contract skill", () => {
  const apps = packages.filter(({ manifest }) =>
    libraries.some(({ name }) => name in { ...manifest.dependencies, ...manifest.devDependencies }),
  );
  const features = readdirSync(featureDirectory);
  const skill = readFileSync(contractSkill, "utf8");
  const violations = components.flatMap(({ name, file }) => {
    const kebab = name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, "-").toLowerCase();
    const problems: string[] = [];
    for (const { directory, path } of apps) {
      const app = readFileSync(join(directory, "src/App.tsx"), "utf8");
      if (!new RegExp(`<${name}[\\s>]`).test(app))
        problems.push(`${path}: render <${name}> in src/App.tsx so the journeys can drive it.`);
    }
    if (!features.some((feature) => feature === `${kebab}.md` || feature.startsWith(`${kebab}-`))) {
      problems.push(
        `${relativePath(featureDirectory)}: add ${kebab}.md describing ${name} for the verify-playground skill.`,
      );
    }
    if (!skill.includes(`\`${relativePath(file)}\`: \`${name}\``)) {
      problems.push(
        `${relativePath(contractSkill)}: add a row for \`${relativePath(file)}\`: \`${name}\` to the covered-code table.`,
      );
    }
    return problems;
  });

  expect(apps.length).toBeGreaterThan(0);
  expect(existsSync(featureDirectory)).toBe(true);
  expect(violations).toEqual([]);
});

function listsOfStylePropsIn(file: string, names: string[]): { line: number; listed: string[] }[] {
  const source = parse(file);
  return descendants(source).flatMap((node) => {
    const items = ts.isArrayLiteralExpression(node)
      ? node.elements
      : ts.isCallExpression(node) || ts.isNewExpression(node)
        ? (node.arguments ?? [])
        : [];
    const listed = items.flatMap((item) =>
      ts.isStringLiteralLike(item) && names.includes(item.text) ? [item.text] : [],
    );
    if (listed.length < 2) return [];
    return [{ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, listed }];
  });
}

test("no array or argument list outside the style-prop table names two or more style props", () => {
  const names = [...stylePropNames, ...visibilityPropNames];
  const violations = libraryPackages.flatMap(({ directory }) =>
    globSync(libraryCode, { cwd: directory })
      .map((path) => join(directory, path))
      .filter((file) => relativePath(file) !== stylePropTableFile)
      .flatMap((file) =>
        listsOfStylePropsIn(file, names).map(
          ({ line, listed }) =>
            `${relativePath(file)}:${line}: this list names the style props ${listed.join(", ")}. Read them from the table in ${stylePropTableFile} instead of listing them again.`,
        ),
      ),
  );

  expect(names.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
