import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import ts from "typescript";
import { expect, test } from "vite-plus/test";
import {
  stylePropNames,
  stylePropTable,
  visibilityPropNames,
} from "../packages/core/src/style-props";
import { tokenValues } from "../scripts/tokens.mjs";
import { libraryPackages, packages, repositoryRoot } from "./support/workspace";

const componentFile = /^[A-Z][A-Za-z0-9]*\.tsx$/;
const helperFile =
  /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts|[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.stylex\.ts|index\.ts)$/;
const partName = /^[a-z][A-Za-z0-9]*$/;
const tokenName = /^--solix-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stylesCall = /^stylex\.attrs\(styles\.(\w+)\)\.class$/;
const featureDirectory = join(repositoryRoot, ".agents/skills/verify-playground/features");
const contractSkill = join(repositoryRoot, ".agents/skills/verify-component-contract/SKILL.md");
const stylePropTableFile = "packages/core/src/style-props.ts";
const polymorphicComponents = ["Box"];
const polymorphicRoot = 'dynamic(() => props.component ?? "div")';
const libraryCode = ["*.{ts,tsx,mjs,js}", "src/**/*.{ts,tsx,mjs,js}"];

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

function attributeNamesOf(attribute: ts.JsxAttribute): string[] {
  return attribute.parent.properties.map((property) =>
    ts.isJsxSpreadAttribute(property) ? property.expression.getText() : property.name.getText(),
  );
}

function polymorphicRootProblems(
  name: string,
  fn: ts.FunctionDeclaration,
  classAttribute: ts.JsxAttribute,
  classes: ts.ArrayLiteralExpression,
): string[] {
  const problems: string[] = [];
  const opening = classAttribute.parent.parent;
  const tag = opening.tagName.getText();
  const tagDeclaration = descendants(fn).find(
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) && node.name.getText() === tag,
  );
  if (tagDeclaration?.initializer?.getText() !== polymorphicRoot) {
    problems.push(
      `render the root as a component made by \`const ${tag} = ${polymorphicRoot}\`, the dynamic() of @solidjs/web.`,
    );
  }
  const [stable, styleProps, consumer, ...extra] = classes.elements;
  if (
    stringLiteralText(stable) !== `solix-${name}-root` ||
    !styleProps?.getText().endsWith(".classes") ||
    consumer?.getText() !== "props.class" ||
    extra.length > 0
  ) {
    problems.push(
      `write the root class array as ["solix-${name}-root", <resolved style props>.classes, props.class], so the style-prop classes sit before the consumer's class.`,
    );
  }
  const style = classAttribute.parent.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === "style",
  );
  const styleValue =
    style?.initializer && ts.isJsxExpression(style.initializer)
      ? style.initializer.expression
      : undefined;
  const merged = styleValue && ts.isCallExpression(styleValue) ? styleValue.arguments : undefined;
  if (
    merged?.length !== 2 ||
    !merged[0].getText().endsWith(".style") ||
    merged[1].getText() !== "props.style"
  ) {
    problems.push(
      "set style to a merge of the resolved style props' custom properties first and props.style after, so the consumer's style wins.",
    );
  }
  const names = attributeNamesOf(classAttribute);
  const spreadAt = names.indexOf("rest");
  if (spreadAt === -1 || spreadAt > names.indexOf("class") || spreadAt > names.indexOf("style")) {
    problems.push(
      "spread {...rest} on the root element before its class and style, so the library's merged values are the ones that apply.",
    );
  }
  return problems;
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

  const polymorphic = polymorphicComponents.includes(name);
  const parameter = fn.parameters[0];
  if (fn.parameters.length !== 1 || parameter.name.getText() !== "props") {
    report('take one parameter named "props".');
  }
  const propsType = parameter?.type?.getText() ?? "";
  if (polymorphic && !propsType.startsWith("PolymorphicProps<")) {
    report(
      "type props as PolymorphicProps<T, Own>, so the attributes of the element `component` names are the component's attributes.",
    );
  }
  if (!polymorphic && !propsType.includes('ComponentProps<"')) {
    report(
      "type props from ComponentProps<\"element\"> in @solidjs/web, so the root element's attributes are the component's attributes.",
    );
  }

  const imports = source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.getText());
  if (!polymorphic && !imports.includes('import * as stylex from "@stylexjs/stylex";')) {
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
  if (polymorphic && (!omitted.includes('"style"') || !omitted.includes('"component"'))) {
    report(
      'omit "style" and "component" too, so the consumer\'s style is merged and `component` never reaches the element.',
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
    if (polymorphic && isRootElement) {
      rootAttributes += 1;
      problems.push(
        ...polymorphicRootProblems(name, fn, attribute, expression).map(
          (problem) => `${where}: ${problem}`,
        ),
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
      const attributeNames = attributeNamesOf(attribute);
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

function namesListedIn(file: string, names: string[]): { line: number; name: string }[] {
  const source = parse(file);
  const found: { line: number; name: string }[] = [];
  const listedName = (node: ts.Node): string | undefined => {
    if (ts.isStringLiteralLike(node)) return node.text;
    const parent = node.parent;
    const namesAProperty =
      parent &&
      (ts.isPropertyAssignment(parent) ||
        ts.isShorthandPropertyAssignment(parent) ||
        ts.isPropertySignature(parent) ||
        ts.isPropertyDeclaration(parent)) &&
      parent.name === node;
    return namesAProperty && ts.isIdentifier(node) ? node.text : undefined;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText() === "stylex.create") return;
    const name = listedName(node);
    if (name !== undefined && names.includes(name)) {
      found.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, name });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("the style-prop table is the only place in the library that lists a style prop", () => {
  const names = [...stylePropNames, ...visibilityPropNames];
  const violations = libraryPackages.flatMap(({ directory }) =>
    globSync(libraryCode, { cwd: directory })
      .map((path) => join(directory, path))
      .filter((file) => relativePath(file) !== stylePropTableFile)
      .flatMap((file) =>
        namesListedIn(file, names).map(
          ({ line, name }) =>
            `${relativePath(file)}:${line}: "${name}" is a style prop. List it only in the table in ${stylePropTableFile} and read it from there.`,
        ),
      ),
  );

  expect(names.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
