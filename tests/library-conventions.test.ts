import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { expect, test } from "vite-plus/test";
import { stylePropKeys, stylePropTable } from "../packages/core/src/style-prop-table";
import { allowedRuntimeDependencies, loads } from "../scripts/runtime-dependencies";
import { tokenValues } from "../scripts/tokens";
import {
  calledDeclaration,
  descendants,
  exportsOf,
  fileOf,
  findAncestor,
  openProgram,
  parse,
  parseAll,
  parseText,
  staticPropertyName,
  ts,
} from "../scripts/syntax";
import { moduleSpecifierOf } from "./support/module-specifiers";
import { componentLibraries, repositoryRoot, scriptFiles } from "./support/workspace";

const componentFile = /^[A-Z][A-Za-z0-9]*\.tsx$/;
const helperFile =
  /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts|[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.stylex\.ts|index\.ts)$/;
const tokenName = /^--solix-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stylesVariable = "styles";
const stylesFactory = "stylex.create";
const partsHelper = "createParts";
const partsHelperFile = "packages/core/src/parts.ts";
const partsModule = "parts.ts";
const partsImport = "./parts";
const libraryEntry = /(?:^|\/)src\/index$/;
const displayPropsRefused = "Partial<Record<DisplayPropName, never>>";
const rootBinding = "root";
const partBinding = "part";
const stylesApiTypeArgument = `typeof ${stylesVariable}`;
const childrenProp = "children";
const stylexModule = "@stylexjs/stylex";
const stylexRuntimeFunctions = ["attrs", "props"];
const intrinsicElement = /^[a-z][a-z0-9-]*$/;
const elementPropsType = "ElementProps";
const polymorphicPropsType = "PolymorphicProps";
const featureDirectory = join(repositoryRoot, ".agents/skills/verify-playground/features");
const stylePropTableFile = "packages/core/src/style-prop-table.ts";
const builtLibraryFile = "packages/core/tests/built-library.ts";
const fixturesFile = "packages/core/tests/fixtures.ts";
const testDirectory = "tests";
const libraryCode = ["*.{ts,tsx,mjs,js}", "src/**/*.{ts,tsx,mjs,js}"];
const importedThroughASeam = allowedRuntimeDependencies().flatMap(({ dependency, seam }) =>
  seam === undefined ? [] : [{ dependency, seam }],
);
const seams = [...new Set(importedThroughASeam.map(({ seam }) => seam))];
const behaviourType = "Behaviour";
const behaviourBinder = "bind";

const libraries = componentLibraries.map(({ directory, manifest }) => ({
  name: manifest.name ?? directory,
  source: join(directory, "src"),
}));

type Component = { name: string; file: string; source: ts.SourceFile };

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function relativePath(file: string): string {
  return relative(repositoryRoot, file);
}

const librarySourceFiles = libraries.flatMap(({ source }) =>
  globSync("**/*.{ts,tsx}", { cwd: source }).map((entry) => join(source, entry)),
);
const librarySources = openProgram(librarySourceFiles);

function typedSource(file: string): ts.SourceFile {
  const source = librarySources.sourceFile(file);
  if (!source) throw new Error(`${relativePath(file)}: TypeScript could not read this file.`);
  return source;
}

const components: Component[] = libraries.flatMap(({ source }) =>
  readdirSync(source)
    .filter((entry) => componentFile.test(entry))
    .sort()
    .map((entry) => ({
      name: basename(entry, ".tsx"),
      file: join(source, entry),
      source: typedSource(join(source, entry)),
    })),
);

function bindsABehaviour(call: ts.CallExpression): boolean {
  const declared = calledDeclaration(librarySources, call);
  const member = declared?.parent;
  return (
    declared !== undefined &&
    member !== undefined &&
    seams.includes(relativePath(fileOf(declared))) &&
    ts.isPropertySignatureDeclaration(member) &&
    member.name.getText() === behaviourBinder &&
    findAncestor(member, ts.isTypeAliasDeclaration)?.name.text === behaviourType
  );
}

function behaviourBindings(node: ts.Node): ts.CallExpression[] {
  return descendants(node).filter(
    (found): found is ts.CallExpression => ts.isCallExpression(found) && bindsABehaviour(found),
  );
}

function exportedNames(source: ts.SourceFile): string[] {
  const { functions, types, others } = exportsOf(source);
  return [...functions, ...types, ...others];
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

function isDynamicRoot(initializer: ts.Expression | undefined, element: string): boolean {
  if (!initializer || !ts.isCallExpression(initializer)) return false;
  const [factory, ...others] = initializer.arguments;
  if (initializer.expression.getText() !== "dynamic" || !factory || others.length > 0) return false;
  if (!ts.isArrowFunction(factory) || factory.parameters.length > 0) return false;
  return factory.body.getText() === `props.component ?? "${element}"`;
}

type PropsShape = {
  kind: string;
  element: string | undefined;
  stylesApi: ts.TypeNode | undefined;
  ownProps: ts.TypeNode | undefined;
  alias: ts.TypeAliasDeclaration;
};

function importedFromParts(source: ts.SourceFile, name: string): boolean {
  return source.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== partsImport
    ) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    return (
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) =>
          element.name.text === name && (element.propertyName ?? element.name).text === name,
      )
    );
  });
}

function propsShapeOf(alias: ts.TypeAliasDeclaration | undefined): PropsShape | undefined {
  const type = alias?.type;
  if (!alias || !type || !ts.isTypeReferenceNode(type)) return undefined;
  const kind = type.typeName.getText();
  if (kind !== elementPropsType && kind !== polymorphicPropsType) return undefined;
  if (!importedFromParts(alias.getSourceFile(), kind)) return undefined;
  const [target, stylesApi, ownProps] = type.typeArguments ?? [];
  const element =
    kind === elementPropsType
      ? target && ts.isLiteralTypeNode(target) && ts.isStringLiteral(target.literal)
        ? target.literal.text
        : undefined
      : undefined;
  return { kind, element, stylesApi, ownProps, alias };
}

type OwnPropNames = { names: string[]; unread: string[] };

function ownPropNames(ownProps: ts.TypeNode | undefined): OwnPropNames {
  const members = !ownProps
    ? []
    : ts.isIntersectionTypeNode(ownProps)
      ? [...ownProps.types]
      : [ownProps];
  const literalMembers = members.filter(ts.isTypeLiteralNode).flatMap((literal) => literal.members);
  return {
    names: literalMembers.flatMap((member) => staticPropertyName(member) ?? []),
    unread: [
      ...members.filter(
        (member) => !ts.isTypeLiteralNode(member) && member.getText() !== displayPropsRefused,
      ),
      ...literalMembers.filter((member) => staticPropertyName(member) === undefined),
    ].map((member) => member.getText()),
  };
}

function keptOffRootProblems(
  name: string,
  fn: ts.FunctionDeclaration,
  call: ts.CallExpression,
  shape: PropsShape,
): string[] {
  const kept = call.arguments
    .slice(3)
    .flatMap((argument) => (ts.isStringLiteral(argument) ? [argument.text] : []));
  const readsChildren = descendants(fn).some(
    (node) => ts.isPropertyAccessExpression(node) && node.getText() === `props.${childrenProp}`,
  );
  const { names, unread } = ownPropNames(shape.ownProps);
  const handledByTheComponent = [...names, ...(readsChildren ? [childrenProp] : [])];
  return [
    ...unread.map(
      (member) =>
        `write ${member} in the own props of ${name}Props as an inline type literal, such as { label: string }, so this check reads each key it declares and requires it off the root. Only ${displayPropsRefused} may stand on its own.`,
    ),
    ...handledByTheComponent
      .filter((prop) => !kept.includes(prop))
      .map(
        (prop) =>
          `pass "${prop}" to ${partsHelper} after props, so it stays off the root: ${prop === childrenProp ? `${name} renders props.${childrenProp} itself` : `${name}Props declares it in its own props type`}.`,
      ),
  ];
}

function stylexRuntimeCalls(source: ts.SourceFile): string[] {
  const callees = source.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== stylexModule
    ) {
      return [];
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      return stylexRuntimeFunctions.map((runtime) => `${bindings.name.text}.${runtime}`);
    }
    return bindings && ts.isNamedImports(bindings)
      ? bindings.elements
          .filter(({ name, propertyName }) =>
            stylexRuntimeFunctions.includes((propertyName ?? name).text),
          )
          .map(({ name }) => name.text)
      : [];
  });
  return descendants(source).flatMap((node) =>
    ts.isCallExpression(node) && callees.includes(node.expression.getText())
      ? [node.expression.getText()]
      : [],
  );
}

function polymorphicDefault(
  declaration: ts.FunctionDeclaration | ts.TypeAliasDeclaration,
): string | undefined {
  const [parameter] = declaration.typeParameters ?? [];
  const fallback = parameter?.defaultType;
  return fallback && ts.isLiteralTypeNode(fallback) && ts.isStringLiteral(fallback.literal)
    ? fallback.literal.text
    : undefined;
}

function signatureOf(fn: ts.FunctionDeclaration): string {
  const [parameter] = fn.parameters;
  return [
    fn.typeParameters?.map((type) => type.getText()).join(", ") ?? "",
    parameter?.type?.getText() ?? "",
    fn.type?.getText() ?? "",
  ].join(" | ");
}

function overloadProblems(
  name: string,
  implementation: ts.FunctionDeclaration,
  overloads: ts.FunctionDeclaration[],
  shape: PropsShape,
): string[] {
  const propsType = `${name}Props`;
  if (shape.kind !== polymorphicPropsType) {
    return overloads.length === 0
      ? []
      : [`declare ${name} once, with no overload: its props type names one element.`];
  }
  const element = polymorphicDefault(implementation) ?? "<element>";
  const generic = `T extends ValidComponent = "${element}" | ${propsType}<T> | JSX.Element`;
  const byDefault = ` | ${propsType} | JSX.Element`;
  return overloads.map(signatureOf).join("\n") === [generic, byDefault].join("\n") &&
    polymorphicDefault(shape.alias) === element
    ? []
    : [
        `type ${propsType} as \`${propsType}<T extends ValidComponent = "${element}">\`, and declare \`export function ${name}<T extends ValidComponent = "${element}">(props: ${propsType}<T>): JSX.Element;\` and then \`export function ${name}(props: ${propsType}): JSX.Element;\` before the implementation, so ComponentProps<typeof ${name}> reads the props of a <${element}> instead of any.`,
      ];
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
  return callsOf(fn, partBinding).flatMap((call) => {
    const [argument, ...others] = call.arguments;
    const problems: string[] = [];
    if (!argument || !ts.isStringLiteral(argument) || others.length > 0) {
      problems.push(`name the part in ${call.getText()} with one string literal.`);
    }
    const holder = call.parent;
    if (!ts.isJsxSpreadAttribute(holder) || holder.expression !== call) {
      problems.push(
        `spread ${call.getText()} inline on the element it styles, as {...${call.getText()}}.`,
      );
      return problems;
    }
    const element = holder.parent.parent;
    const tag =
      ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)
        ? element.tagName.getText()
        : element.getText();
    if (!intrinsicElement.test(tag)) {
      problems.push(
        `spread {...${call.getText()}} on an element such as <div>, not on <${tag}>: a part is one element of the component's own markup.`,
      );
    }
    return problems;
  });
}

function problemsWith({ name, file, source }: Component): string[] {
  const where = relativePath(file);
  const problems: string[] = [];
  const report = (message: string) => problems.push(`${where}: ${message}`);

  const propsType = `${name}Props`;
  const exported = exportedNames(source);
  if (exported.filter((found) => found !== name).join() !== propsType || !exported.includes(name)) {
    report(
      `export one function named "${name}", its props type "${propsType}", and nothing else (found: ${exported.join(", ") || "nothing"}).`,
    );
  }

  const declarations = source.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  const fn = declarations.find((declaration) => declaration.body !== undefined);
  if (!fn?.body) {
    report(`declare "export function ${name}(props ...)" and nothing that replaces it.`);
    return problems;
  }

  const parameter = fn.parameters[0];
  if (fn.parameters.length !== 1 || parameter.name.getText() !== "props") {
    report('take one parameter named "props".');
  }
  const typeParameter = fn.typeParameters?.[0]?.name.text;
  const parameterType = typeParameter === undefined ? propsType : `${propsType}<${typeParameter}>`;
  if (parameter?.type?.getText() !== parameterType) {
    report(`type props as ${parameterType}.`);
  }
  const shape = propsShapeOf(
    source.statements.find(
      (statement): statement is ts.TypeAliasDeclaration =>
        ts.isTypeAliasDeclaration(statement) && statement.name.text === propsType,
    ),
  );
  if (!shape) {
    report(
      `declare \`export type ${propsType}\` as ${polymorphicPropsType}<T, ${stylesApiTypeArgument}, OwnProps> for a root that \`component\` picks, or as ${elementPropsType}<"element", ${stylesApiTypeArgument}, OwnProps> for a root that is always one element, both from ${partsHelperFile}.`,
    );
    return problems;
  }
  if (shape.stylesApi?.getText() !== stylesApiTypeArgument) {
    report(
      `pass ${stylesApiTypeArgument} as the second type argument of ${shape.kind}, so classes and styles name exactly the parts of ${stylesVariable}.`,
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
  const holder = call?.parent;
  const binding =
    holder !== undefined &&
    ts.isCallExpression(holder) &&
    holder.arguments[0] === call &&
    bindsABehaviour(holder)
      ? holder
      : undefined;
  const declaration = (binding ?? call)?.parent;
  const bound =
    declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    isConst(declaration) &&
    ts.isObjectBindingPattern(declaration.name)
      ? declaration.name.elements.map((element) => element.getText())
      : [];
  const [componentName, compiled, consumer] = call?.arguments ?? [];
  const statement = declaration?.parent.parent;
  if (
    calls.length !== 1 ||
    statement?.parent !== fn.body ||
    !bound.includes(rootBinding) ||
    bound.some((binding) => binding !== rootBinding && binding !== partBinding) ||
    !componentName ||
    !ts.isStringLiteral(componentName) ||
    componentName.text !== name ||
    compiled?.getText() !== stylesVariable ||
    consumer?.getText() !== "props"
  ) {
    report(
      `call ${partsHelper} once, in a statement of the component's own body, as \`const { ${rootBinding}, ${partBinding} } = ${partsHelper}("${name}", ${stylesVariable}, props, ...keptOffRoot)\` from ${partsHelperFile}, or as \`const { ${rootBinding}, ${partBinding} } = behaviour.${behaviourBinder}(${partsHelper}(...), { ... })\` with a behaviour from ${seams.join(" or ")}, so each bound part takes its slot there and none inline in JSX.`,
    );
    return problems;
  }
  for (const stray of behaviourBindings(source).filter((found) => found !== binding)) {
    report(
      `give ${stray.expression.getText()} the component's one ${partsHelper} call as its first argument, written there, and bind every part in that one call: line ${source.getLineAndCharacterOfPosition(stray.getStart()).line + 1} binds something else.`,
    );
  }

  return [
    ...problems,
    ...[
      ...overloadProblems(
        name,
        fn,
        declarations.filter((declaration) => declaration !== fn),
        shape,
      ),
      ...keptOffRootProblems(name, fn, call, shape),
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

test("every component is written the one way: one function, and its root and every other part from one createParts call, which a behaviour binds only as the first argument of its bind", () => {
  const componentFiles = components.map(({ file }) => file);
  const boundElsewhere = librarySourceFiles
    .filter((file) => !componentFiles.includes(file))
    .flatMap((file) =>
      behaviourBindings(typedSource(file)).map(
        (call) =>
          `${relativePath(file)}: ${call.getText().split("\n")[0]} binds a behaviour outside a component. Only a component binds one, to its own ${partsHelper} call.`,
      ),
    );

  expect(components.filter(({ source }) => behaviourBindings(source).length > 0)).not.toEqual([]);
  expect([...components.flatMap(problemsWith), ...boundElsewhere]).toEqual([]);
});

function loadsOutsideTheSeam(file: string, source: ts.SourceFile): string[] {
  return descendants(source).flatMap((node) => {
    const specifier = moduleSpecifierOf(node);
    if (!specifier || !ts.isStringLiteralLikeNode(specifier)) return [];
    return importedThroughASeam
      .filter(({ dependency, seam }) => loads(dependency, specifier.text) && file !== seam)
      .map(
        ({ dependency, seam }) =>
          `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.getText().split("\n")[0]} loads ${dependency}. Only ${seam} imports it; take what you need from that module.`,
      );
  });
}

test("no file but its seam loads a runtime dependency the allow-list names with one, by an import, an export, a dynamic import, a require or an import type", () => {
  const sources = parseAll(scriptFiles.map((file) => join(repositoryRoot, file)));
  const violations = scriptFiles.flatMap((file, index) =>
    loadsOutsideTheSeam(file, sources[index]),
  );
  const [{ dependency }] = importedThroughASeam;
  const flagged = loadsOutsideTheSeam(
    "packages/core/src/Elsewhere.tsx",
    parseText(
      [
        `import { tabs } from "${dependency}/tabs";`,
        `import type { Primitive } from "${dependency}";`,
        `export { usePrimitive } from "${dependency}/primitive";`,
        `const later = await import("${dependency}");`,
        `const required = require("${dependency}");`,
        `type Handle = import("${dependency}/primitive").PrimitiveHandle<never>;`,
        'import { createBehaviour } from "./headless";',
        `const named = "${dependency}";`,
        `import { other } from "${dependency}-and-more";`,
      ].join("\n"),
      ".tsx",
    ),
  ).map((violation) => /^[^:]+:(\d+):/.exec(violation)?.[1]);

  for (const { dependency: imported, seam } of importedThroughASeam) {
    expect(
      descendants(parse(join(repositoryRoot, seam))).some((node) => {
        const specifier = moduleSpecifierOf(node);
        return (
          specifier !== undefined &&
          ts.isStringLiteralLikeNode(specifier) &&
          loads(imported, specifier.text)
        );
      }),
      `${seam} imports ${imported}`,
    ).toBe(true);
  }
  expect(violations).toEqual([]);
  expect(flagged).toEqual(["1", "2", "3", "4", "5", "6"]);
});

test("no source file of the library but parts.ts calls stylex.attrs or stylex.props", () => {
  const files = libraries.flatMap(({ source }) =>
    globSync("**/*.{ts,tsx}", { cwd: source })
      .filter((entry) => entry !== partsModule)
      .map((entry) => join(source, entry)),
  );
  const sources = parseAll(files);
  const violations = files.flatMap((file, index) =>
    stylexRuntimeCalls(sources[index]).map(
      (callee) =>
        `${relativePath(file)}: call no ${callee}. ${partsHelper} in ${partsHelperFile} gives each part the classes of its ${stylesVariable} entry, and no other file calls the StyleX runtime.`,
    ),
  );

  expect(files.length).toBeGreaterThan(components.length);
  expect(violations).toEqual([]);
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

test("the barrel exports every component and its props type once, in alphabetical order, and nothing else", () => {
  for (const { source } of libraries) {
    const names = components
      .filter(({ file }) => file.startsWith(source))
      .map(({ name }) => name)
      .sort();
    const expected = names.map((name) => `export { ${name}, type ${name}Props } from "./${name}";`);
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

function kebabCase(name: string): string {
  return name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, "-").toLowerCase();
}

test("every component is described by a feature file, its own or that of the component whose name its own starts with", () => {
  const features = readdirSync(featureDirectory);
  const violations = components.flatMap(({ name }) => {
    const described = components
      .filter((other) => name.startsWith(other.name))
      .map((other) => kebabCase(other.name));
    return features.some((feature) =>
      described.some((kebab) => feature === `${kebab}.md` || feature.startsWith(`${kebab}-`)),
    )
      ? []
      : [
          `${relativePath(featureDirectory)}: add ${kebabCase(name)}.md describing ${name} for the verify-playground skill.`,
        ];
  });

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
      ts.isStringLiteralLikeNode(item) && names.includes(item.text) ? [item.text] : [],
    );
    if (listed.length < 2) return [];
    return [{ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, listed }];
  });
}

test("no array or argument list outside the style-prop table names two or more style props", () => {
  const names: string[] = stylePropKeys;
  const violations = componentLibraries.flatMap(({ directory }) =>
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

function libraryNamespaces(source: ts.SourceFile): string[] {
  return source.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !libraryEntry.test(statement.moduleSpecifier.text)
    ) {
      return [];
    }
    const bindings = statement.importClause?.namedBindings;
    return bindings && ts.isNamespaceImport(bindings) ? [bindings.name.text] : [];
  });
}

function keysOfTheLibrary(type: ts.TypeNode, source: ts.SourceFile): boolean {
  if (
    ts.isTypeOperatorNode(type) &&
    type.operator === ts.SyntaxKind.KeyOfKeyword &&
    ts.isTypeQueryNode(type.type)
  ) {
    return libraryNamespaces(source).includes(type.type.exprName.getText());
  }
  if (!ts.isTypeReferenceNode(type)) return false;
  const alias = source.statements.find(
    (statement): statement is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === type.typeName.getText(),
  );
  return alias !== undefined && keysOfTheLibrary(alias.type, source);
}

function mappedOverTheLibrary(literal: ts.ObjectLiteralExpression, source: ts.SourceFile): boolean {
  const holder = literal.parent;
  const type =
    ts.isVariableDeclaration(holder) || ts.isSatisfiesExpression(holder) ? holder.type : undefined;
  const constraint = type && ts.isMappedTypeNode(type) ? type.typeParameter.constraint : undefined;
  return constraint !== undefined && keysOfTheLibrary(constraint, source);
}

function componentListsIn(
  source: ts.SourceFile,
  names: string[],
): { line: number; listed: string[]; kind: string }[] {
  return descendants(source).flatMap((node) => {
    const listed = ts.isArrayLiteralExpression(node)
      ? node.elements.flatMap((item) => (ts.isStringLiteralLikeNode(item) ? [item.text] : []))
      : ts.isObjectLiteralExpression(node) && !mappedOverTheLibrary(node, source)
        ? node.properties.flatMap((property) => staticPropertyName(property) ?? [])
        : [];
    if (listed.length === 0 || listed.some((text) => !names.includes(text))) return [];
    return [
      {
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        listed,
        kind: ts.isArrayLiteralExpression(node) ? "array" : "object",
      },
    ];
  });
}

test("no array or object in a test file lists the components by hand, unless the object is typed as a mapped type over the keys of the library's exports", () => {
  const names = components.map(({ name }) => name);
  const testFiles = scriptFiles.filter((file) => file.split("/").includes(testDirectory));
  const sources = parseAll(testFiles.map((file) => join(repositoryRoot, file)));
  const violations = testFiles.flatMap((file, index) =>
    componentListsIn(sources[index], names).map(
      ({ line, listed, kind }) =>
        `${file}:${line}: this ${kind} lists the components ${listed.join(", ")} by hand. Read the components from the build with builtComponents in ${builtLibraryFile}, and write a per-component table as a mapped type over the library's exports, as fixtures does in ${fixturesFile}, so a flag in it says what sets the ones a test picks out apart.`,
    ),
  );

  expect(names.length).toBeGreaterThan(0);
  expect(testFiles.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
