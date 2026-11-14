import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import ts from "typescript";
import { expect, test } from "vite-plus/test";
import { libraryPackages, packages, repositoryRoot } from "./support/workspace";

const componentFile = /^[A-Z][A-Za-z0-9]*\.tsx$/;
const helperFile =
  /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts|[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.stylex\.ts|index\.ts)$/;
const partName = /^[a-z][A-Za-z0-9]*$/;
const tokenName = /^--solix-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stylesCall = /^stylex\.attrs\(styles\.(\w+)\)\.class$/;
const featureDirectory = join(repositoryRoot, ".agents/skills/verify-playground/features");
const contractSkill = join(repositoryRoot, ".agents/skills/verify-component-contract/SKILL.md");

const libraries = libraryPackages.map(({ directory, manifest }) => ({
  name: manifest.name ?? directory,
  source: join(directory, "src"),
}));

type Component = { name: string; file: string; source: ts.SourceFile };

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
  if (!parameter?.type?.getText().includes('ComponentProps<"')) {
    report(
      "type props from ComponentProps<\"element\"> in @solidjs/web, so the root element's attributes are the component's attributes.",
    );
  }

  const imports = source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.getText());
  if (!imports.includes('import * as stylex from "@stylexjs/stylex";')) {
    report('import styles with `import * as stylex from "@stylexjs/stylex";`.');
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
  if (omitted[0] !== "props" || !omitted.includes('"class"')) {
    report(
      'start the body with `const rest = omit(props, "class", ...)`, so the consumer\'s class is merged and not overwritten.',
    );
  }

  const parts: string[] = [];
  const attributes = classAttributes(fn);
  let rootAttributes = 0;
  for (const attribute of attributes) {
    const value = attribute.initializer;
    const expression = value && ts.isJsxExpression(value) ? value.expression : undefined;
    if (!expression || !ts.isArrayLiteralExpression(expression)) {
      report(
        'write every class attribute as an array: [stylex.attrs(styles.part).class, "solix-Name-part"].',
      );
      continue;
    }
    const [styled, stable, consumer] = expression.elements;
    const key = stylesCall.exec(styled?.getText() ?? "")?.[1];
    const stableName = stringLiteralText(stable);
    const prefix = `solix-${name}-`;
    const part = stableName?.startsWith(prefix) ? stableName.slice(prefix.length) : undefined;
    if (!key || part === undefined || !partName.test(part)) {
      report(
        `start every class array with stylex.attrs(styles.<part>).class and the stable class "${prefix}<part>" (camelCase part).`,
      );
      continue;
    }
    if (key !== part)
      report(
        `the style "styles.${key}" and the stable class "${stableName}" must name the same part.`,
      );
    parts.push(part);

    const opening = attribute.parent.parent;
    const element = ts.isJsxOpeningElement(opening) ? opening.parent : opening;
    const isRootElement = descendants(fn).some(
      (node) =>
        ts.isReturnStatement(node) &&
        node.expression !== undefined &&
        (ts.isParenthesizedExpression(node.expression)
          ? node.expression.expression
          : node.expression) === element,
    );
    if (part === "root" || isRootElement) {
      rootAttributes += 1;
      if (!isRootElement || part !== "root") {
        report(`put "solix-${name}-root" on the returned root element, and only there.`);
      }
      if (expression.elements.length !== 3 || consumer?.getText() !== "props.class") {
        report(
          "end the root element's class array with props.class, so the consumer's class sits next to the library's.",
        );
      }
      const attributeNames = attribute.parent.properties.map((property) =>
        ts.isJsxSpreadAttribute(property) ? property.expression.getText() : property.name.getText(),
      );
      const spreadAt = attributeNames.indexOf("rest");
      if (spreadAt === -1 || spreadAt > attributeNames.indexOf("class")) {
        report(
          "spread {...rest} on the root element before its class, so the library's class array is the one that applies.",
        );
      }
    } else if (expression.elements.length !== 2) {
      report(
        `a part's class array has exactly two items, but "${stableName}" has ${expression.elements.length}.`,
      );
    }
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

test("every public token is named --solix-*, and is used by a component and defined once", () => {
  for (const { source } of libraries) {
    const definitions = parse(join(source, "tokens.stylex.ts"));
    const defined = descendants(definitions)
      .filter(
        (node): node is ts.PropertyAssignment =>
          ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name),
      )
      .map((node) => (node.name as ts.StringLiteral).text);
    const used = components
      .filter(({ file }) => file.startsWith(source))
      .flatMap(({ file }) =>
        [...readFileSync(file, "utf8").matchAll(/tokens\["([^"]+)"\]/g)].map(([, name]) => name),
      );

    expect(
      defined.filter((name) => !tokenName.test(name)),
      "token names",
    ).toEqual([]);
    expect(new Set(defined).size, "a token is defined twice").toBe(defined.length);
    expect(
      defined.filter((name) => !used.includes(name)),
      "tokens no component uses",
    ).toEqual([]);
    expect(
      used.filter((name) => !defined.includes(name)),
      "tokens used but not defined",
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
