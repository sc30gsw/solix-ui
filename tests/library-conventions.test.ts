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
const tokenName = /^--solix-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stylesVariable = "styles";
const stylesFactory = "stylex.create";
const partsHelper = "createParts";
const partsHelperFile = "packages/core/src/parts.ts";
const rootBinding = "root";
const partBinding = "part";
const partPropsType = `PartProps<typeof ${stylesVariable}>`;
const elementPropsType = "ElementProps";
const polymorphicPropsType = "PolymorphicProps";
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

function variableNamed(node: ts.Node, name: string): ts.VariableDeclaration | undefined {
  return descendants(node).find(
    (found): found is ts.VariableDeclaration =>
      ts.isVariableDeclaration(found) && ts.isIdentifier(found.name) && found.name.text === name,
  );
}

function isConst(declaration: ts.VariableDeclaration): boolean {
  return (
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  );
}

function unwrapped(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ? unwrapped(node.expression) : node;
}

function returnedRoots(fn: ts.FunctionDeclaration): JsxTag[] {
  return descendants(fn).flatMap((node): JsxTag[] => {
    if (!ts.isReturnStatement(node) || !node.expression) return [];
    const returned = unwrapped(node.expression);
    if (ts.isJsxElement(returned)) return [returned.openingElement];
    return ts.isJsxSelfClosingElement(returned) ? [returned] : [];
  });
}

function jsxTags(fn: ts.FunctionDeclaration): JsxTag[] {
  return descendants(fn).filter(
    (node): node is JsxTag => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node),
  );
}

function spreadsOn(tag: JsxTag): string[] {
  return tag.attributes.properties.flatMap((property) =>
    ts.isJsxSpreadAttribute(property) ? [property.expression.getText()] : [],
  );
}

function intersected(type: ts.TypeNode): ts.TypeNode[] {
  return ts.isIntersectionTypeNode(type) ? type.types.flatMap(intersected) : [type];
}

function isDynamicRoot(initializer: ts.Expression | undefined, element: string): boolean {
  if (!initializer || !ts.isCallExpression(initializer)) return false;
  const [factory, ...others] = initializer.arguments;
  if (initializer.expression.getText() !== "dynamic" || !factory || others.length > 0) return false;
  if (!ts.isArrowFunction(factory) || factory.parameters.length > 0) return false;
  return factory.body.getText() === `props.component ?? "${element}"`;
}

type PropsShape = { kind: string; element: string | undefined; own: ts.TypeNode | undefined };

function propsShapeOf(type: ts.TypeNode | undefined): PropsShape | undefined {
  if (!type || !ts.isTypeReferenceNode(type)) return undefined;
  const kind = type.typeName.getText();
  if (kind !== elementPropsType && kind !== polymorphicPropsType) return undefined;
  const [target, own] = type.typeArguments ?? [];
  const element =
    kind === elementPropsType
      ? target && ts.isLiteralTypeNode(target) && ts.isStringLiteral(target.literal)
        ? target.literal.text
        : undefined
      : undefined;
  return { kind, element, own };
}

function polymorphicDefault(fn: ts.FunctionDeclaration): string | undefined {
  const [parameter] = fn.typeParameters ?? [];
  const fallback = parameter?.default;
  return fallback && ts.isLiteralTypeNode(fallback) && ts.isStringLiteral(fallback.literal)
    ? fallback.literal.text
    : undefined;
}

function rootProblems(fn: ts.FunctionDeclaration, shape: PropsShape): string[] {
  const roots = returnedRoots(fn);
  const [root] = roots;
  const rootSpreads = jsxTags(fn).filter((tag) => spreadsOn(tag).includes(rootBinding));
  const problems: string[] = [];
  if (roots.length !== 1) {
    return [`return one root element, and spread {...${rootBinding}} from ${partsHelper} on it.`];
  }
  if (rootSpreads.length !== 1 || rootSpreads[0] !== root) {
    problems.push(
      `spread {...${rootBinding}} once, on the returned root element, so it takes the consumer's attributes, the style props and its class and style.`,
    );
  }
  const tag = root.tagName.getText();
  if (shape.kind === polymorphicPropsType) {
    const element = polymorphicDefault(fn) ?? "<element>";
    if (!isDynamicRoot(variableNamed(fn, tag)?.initializer, element)) {
      problems.push(
        `render the root as \`const ${tag} = dynamic(() => props.component ?? "${element}")\`, the dynamic() of @solidjs/web with the element the type parameter defaults to.`,
      );
    }
  } else if (tag !== shape.element) {
    problems.push(
      `return the <${shape.element ?? "element"}> that ${elementPropsType} names as the root, not <${tag}>.`,
    );
  }
  return problems;
}

function partProblems(fn: ts.FunctionDeclaration): string[] {
  const spreads = new Set(jsxTags(fn).flatMap(spreadsOn));
  return callsOf(fn, partBinding).flatMap((call) => {
    const [argument, ...others] = call.arguments;
    const problems: string[] = [];
    if (!argument || !ts.isStringLiteral(argument) || others.length > 0) {
      problems.push(`name the part in ${call.getText()} with one string literal.`);
    }
    const holder = call.parent;
    const spreadInline = ts.isJsxSpreadAttribute(holder) && holder.expression === call;
    const stored =
      ts.isVariableDeclaration(holder) &&
      ts.isIdentifier(holder.name) &&
      isConst(holder) &&
      spreads.has(holder.name.text);
    if (!spreadInline && !stored) {
      problems.push(
        `spread ${call.getText()} on the element it styles, as {...${call.getText()}} or through a const that is spread there.`,
      );
    }
    return problems;
  });
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
  const shape = propsShapeOf(parameter?.type);
  if (!shape) {
    report(
      `type props as ${polymorphicPropsType}<T, Own> for a root that \`component\` picks, or as ${elementPropsType}<"element", Own> for a root that is always one element, both from ./style-props.`,
    );
    return problems;
  }
  if (!shape.own || !intersected(shape.own).some((type) => type.getText() === partPropsType)) {
    report(
      `take ${partPropsType} in the Own type of ${shape.kind}, so classes, styles and unstyled name exactly the parts of ${stylesVariable}.`,
    );
  }

  const stylesDeclaration = variableNamed(source, stylesVariable);
  if (
    !stylesDeclaration?.initializer ||
    !ts.isCallExpression(stylesDeclaration.initializer) ||
    stylesDeclaration.initializer.expression.getText() !== stylesFactory
  ) {
    report(
      `declare the styles once, as \`const ${stylesVariable} = ${stylesFactory}({ ... })\`, keyed by part.`,
    );
  }

  const calls = callsOf(fn, partsHelper);
  const [call] = calls;
  const declaration = call?.parent;
  const bound =
    declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    isConst(declaration) &&
    ts.isObjectBindingPattern(declaration.name)
      ? declaration.name.elements.map((element) => element.getText())
      : [];
  const [componentName, compiled, consumer] = call?.arguments ?? [];
  if (
    calls.length !== 1 ||
    !bound.includes(rootBinding) ||
    bound.some((binding) => binding !== rootBinding && binding !== partBinding) ||
    !componentName ||
    !ts.isStringLiteral(componentName) ||
    componentName.text !== name ||
    compiled?.getText() !== stylesVariable ||
    consumer?.getText() !== "props"
  ) {
    report(
      `call ${partsHelper} once, as \`const { ${rootBinding}, ${partBinding} } = ${partsHelper}("${name}", ${stylesVariable}, props, ...ownKeys)\` from ${partsHelperFile}.`,
    );
    return problems;
  }

  return [
    ...problems,
    ...[
      ...rootProblems(fn, shape),
      ...partProblems(fn),
      ...descendants(fn)
        .filter(
          (node): node is ts.JsxAttribute =>
            ts.isJsxAttribute(node) && ["class", "style"].includes(node.name.getText()),
        )
        .map(
          (attribute) =>
            `set no ${attribute.name.getText()} by hand: ${partsHelper} gives the root and each part its class and style.`,
        ),
    ].map((problem) => `${where}: ${problem}`),
  ];
}

test("the library has components to check", () => {
  expect(libraries.length).toBeGreaterThan(0);
  expect(components.length).toBeGreaterThan(1);
});

test("every component is written the one way: one function, and its root and every other part from one createParts call", () => {
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
