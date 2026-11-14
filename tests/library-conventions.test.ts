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
const stylesCall = /^stylex\.attrs\(styles\.(\w+)\)\.class$/;
const stylexImport = 'import * as stylex from "@stylexjs/stylex";';
const featureDirectory = join(repositoryRoot, ".agents/skills/verify-playground/features");
const contractSkill = join(repositoryRoot, ".agents/skills/verify-component-contract/SKILL.md");
const stylePropTableFile = "packages/core/src/style-prop-table.ts";
const libraryCode = ["*.{ts,tsx,mjs,js}", "src/**/*.{ts,tsx,mjs,js}"];

const libraries = libraryPackages.map(({ directory, manifest }) => ({
  name: manifest.name ?? directory,
  source: join(directory, "src"),
}));

type Component = { name: string; file: string; source: ts.SourceFile };

type RootElement = {
  name: string;
  fn: ts.FunctionDeclaration;
  attribute: ts.JsxAttribute;
  classes: ts.ArrayLiteralExpression;
};

type RootShape = {
  importsStylex: boolean;
  alsoOmits: string[];
  problems: (root: RootElement) => string[];
};

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

function stylesKeys(source: ts.SourceFile): string[] {
  const create = descendants(source).find(
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) && node.expression.getText() === "stylex.create",
  );
  const argument = create?.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return [];
  return argument.properties.flatMap((property) =>
    ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) ? [property.name.text] : [],
  );
}

function classAttributes(fn: ts.FunctionDeclaration): ts.JsxAttribute[] {
  return descendants(fn).filter(
    (node): node is ts.JsxAttribute => ts.isJsxAttribute(node) && node.name.getText() === "class",
  );
}

function stringLiteralText(node: ts.Node | undefined): string | undefined {
  return node && ts.isStringLiteral(node) ? node.text : undefined;
}

function attributeNamesOf(attribute: ts.JsxAttribute): string[] {
  return attribute.parent.properties.map((property) =>
    ts.isJsxSpreadAttribute(property) ? property.expression.getText() : property.name.getText(),
  );
}

function spreadsRestBefore(attribute: ts.JsxAttribute, names: string[]): boolean {
  const written = attributeNamesOf(attribute);
  const spreadAt = written.indexOf("rest");
  return spreadAt !== -1 && names.every((name) => spreadAt < written.indexOf(name));
}

function attributeValue(attribute: ts.JsxAttribute, name: string): ts.Expression | undefined {
  const found = attribute.parent.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
  return found?.initializer && ts.isJsxExpression(found.initializer)
    ? found.initializer.expression
    : undefined;
}

function isPropsMember(node: ts.Node, member: string): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.expression.getText() === "props" &&
    node.name.text === member
  );
}

function isDynamicRootWithDefault(initializer: ts.Expression | undefined): boolean {
  if (!initializer || !ts.isCallExpression(initializer)) return false;
  const [factory, ...others] = initializer.arguments;
  if (initializer.expression.getText() !== "dynamic" || !factory || others.length > 0) return false;
  if (!ts.isArrowFunction(factory) || factory.parameters.length > 0) return false;
  const body = factory.body;
  return (
    ts.isBinaryExpression(body) &&
    body.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    isPropsMember(body.left, "component") &&
    ts.isStringLiteral(body.right)
  );
}

function memberOf(node: ts.Node | undefined, member: string): string | undefined {
  return node && ts.isPropertyAccessExpression(node) && node.name.text === member
    ? node.expression.getText()
    : undefined;
}

function elementRootProblems({ name, attribute, classes }: RootElement): string[] {
  const problems: string[] = [];
  const [styled, stable, consumer, ...extra] = classes.elements;
  if (
    stylesCall.exec(styled?.getText() ?? "")?.[1] !== "root" ||
    stringLiteralText(stable) !== `solix-${name}-root` ||
    consumer?.getText() !== "props.class" ||
    extra.length > 0
  ) {
    problems.push(
      `write the root class array as [stylex.attrs(styles.root).class, "solix-${name}-root", props.class], so the consumer's class sits next to the library's.`,
    );
  }
  if (!spreadsRestBefore(attribute, ["class"])) {
    problems.push(
      "spread {...rest} on the root element before its class, so the library's class array is the one that applies.",
    );
  }
  return problems;
}

function polymorphicRootProblems({ name, fn, attribute, classes }: RootElement): string[] {
  const problems: string[] = [];
  const tag = attribute.parent.parent.tagName.getText();
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
  if (
    resolved === undefined ||
    memberOf(attributeValue(attribute, "style"), "style") !== resolved
  ) {
    problems.push(
      "set style to the .style of the same resolved style props, which puts the consumer's style after the style props'.",
    );
  }
  const resolvesProps = descendants(fn).some(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText() === "resolveStyleProps" &&
      node.arguments.map((argument) => argument.getText()).join() === "props",
  );
  if (!resolvesProps) {
    problems.push("resolve the style props with resolveStyleProps(props) from ./style-props.");
  }
  if (!spreadsRestBefore(attribute, ["class", "style"])) {
    problems.push(
      "spread {...rest} on the root element before its class and style, so the library's merged values are the ones that apply.",
    );
  }
  return problems;
}

const elementRoot: RootShape = {
  importsStylex: true,
  alsoOmits: [],
  problems: elementRootProblems,
};

const polymorphicRoot: RootShape = {
  importsStylex: false,
  alsoOmits: ['"style"', '"component"', "...stylePropKeys"],
  problems: polymorphicRootProblems,
};

function rootShapeOf(propsType: ts.TypeNode | undefined): RootShape | undefined {
  if (
    propsType &&
    ts.isTypeReferenceNode(propsType) &&
    propsType.typeName.getText() === "PolymorphicProps"
  ) {
    return polymorphicRoot;
  }
  return propsType?.getText().includes('ComponentProps<"') ? elementRoot : undefined;
}

function isReturnedRoot(fn: ts.FunctionDeclaration, attribute: ts.JsxAttribute): boolean {
  const opening = attribute.parent.parent;
  const element = ts.isJsxOpeningElement(opening) ? opening.parent : opening;
  return descendants(fn).some(
    (node) =>
      ts.isReturnStatement(node) &&
      node.expression !== undefined &&
      (ts.isParenthesizedExpression(node.expression)
        ? node.expression.expression
        : node.expression) === element,
  );
}

function partProblems(name: string, classes: ts.ArrayLiteralExpression): string[] {
  const [styled, stable] = classes.elements;
  const key = stylesCall.exec(styled?.getText() ?? "")?.[1];
  const stableName = stringLiteralText(stable);
  const prefix = `solix-${name}-`;
  const part = stableName?.startsWith(prefix) ? stableName.slice(prefix.length) : undefined;
  if (!key || part === undefined || !partName.test(part)) {
    return [
      `start every class array with stylex.attrs(styles.<part>).class and the stable class "${prefix}<part>" (camelCase part).`,
    ];
  }
  return [
    ...(key === part
      ? []
      : [
          `the style "styles.${key}" and the stable class "${stableName}" must name the same part.`,
        ]),
    ...(part === "root"
      ? [`put "solix-${name}-root" on the returned root element, and only there.`]
      : []),
    ...(classes.elements.length === 2
      ? []
      : [
          `a part's class array has exactly two items, but "${stableName}" has ${classes.elements.length}.`,
        ]),
  ];
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
  const shape = rootShapeOf(parameter?.type);
  if (!shape) {
    report(
      "type props from ComponentProps<\"element\"> in @solidjs/web, or as PolymorphicProps<T, Own> for a root that `component` picks, so the root element's attributes are the component's attributes.",
    );
    return problems;
  }

  const imports = source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.getText());
  if (shape.importsStylex && !imports.includes(stylexImport)) {
    report(`import styles with \`${stylexImport}\`.`);
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
  const mustOmit = ['"class"', ...shape.alsoOmits];
  if (omitted[0] !== "props" || mustOmit.some((key) => !omitted.includes(key))) {
    report(
      `start the body with \`const rest = omit(props, ${mustOmit.join(", ")}, ...)\`, so the consumer's class and style are merged and not overwritten, and no prop of the library's own reaches the element.`,
    );
  }

  const parts: string[] = [];
  let rootAttributes = 0;
  for (const attribute of classAttributes(fn)) {
    const value = attribute.initializer;
    const classes = value && ts.isJsxExpression(value) ? value.expression : undefined;
    if (!classes || !ts.isArrayLiteralExpression(classes)) {
      report(
        'write every class attribute as an array: [stylex.attrs(styles.part).class, "solix-Name-part"].',
      );
      continue;
    }
    const key = stylesCall.exec(classes.elements[0]?.getText() ?? "")?.[1];
    if (key) parts.push(key);
    const isRoot = isReturnedRoot(fn, attribute);
    if (isRoot) rootAttributes += 1;
    const found = isRoot
      ? shape.problems({ name, fn, attribute, classes })
      : partProblems(name, classes);
    problems.push(...found.map((problem) => `${where}: ${problem}`));
  }
  if (rootAttributes !== 1)
    report(`the root element carries "solix-${name}-root" exactly once (found ${rootAttributes}).`);

  const keys = stylesKeys(source);
  expect(
    [...new Set(parts)].sort(),
    `${where}: every stylex.create key is a part class and every part class has a key`,
  ).toEqual([...keys].sort());
  return problems;
}

test("the library has components to check", () => {
  expect(libraries.length).toBeGreaterThan(0);
  expect(components.length).toBeGreaterThan(1);
});

test("every component is written the one way: one function, props from ComponentProps, consumer class last on the root", () => {
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
