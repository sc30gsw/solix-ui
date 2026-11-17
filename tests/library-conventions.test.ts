import { existsSync, globSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  stylePropKeys,
  stylePropTable,
  variableGroups,
  variableNames,
  variableRow,
} from "#/packages/core/src/style-prop-table.ts";
import {
  builtComponents,
  carriedComponents,
  compiledClassesOf,
} from "#/packages/core/tests/built-library.ts";
import { allowedRuntimeDependencies, loads } from "#/scripts/runtime-dependencies.ts";
import { fileNamedBy } from "#/scripts/subpath.ts";
import { tokenValues } from "#/scripts/tokens.ts";
import {
  calledDeclaration,
  descendants,
  exportsOf,
  fileOf,
  findAncestor,
  firstLine,
  memberDeclarations,
  moduleSpecifierOf,
  openProgram,
  parse,
  parseAll,
  parseText,
  staticPropertyName,
  symbolOf,
  ts,
} from "#/scripts/syntax.ts";
import { componentLibraries, repositoryRoot, scriptFiles } from "#/tests/support/workspace.ts";

const componentFile = /^[A-Z][A-Za-z0-9]*\.tsx$/;
const helperFile =
  /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts|[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.stylex\.ts|index\.ts)$/;
const tokenName = /^--solix-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stylesVariable = "styles";
const stylesFactory = "stylex.create";
const partsHelper = "createParts";
const containerPart = "container";
const variablesOption = "variables";
const partsHelperFile = "packages/core/src/parts.ts";
const partsModule = "parts.ts";
const libraryEntry = /(?:^|\/)src\/index\.ts$/;
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
const importedThroughASeam = allowedRuntimeDependencies();
const seams = [...new Set(importedThroughASeam.map(({ seam }) => seam))];
const behaviourType = "Behaviour";
const behaviourBinder = "bind";

const libraries = componentLibraries.map(({ directory, manifest }) => ({
  name: manifest.name ?? directory,
  directory,
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

function isTheBinder(member: ts.Node | undefined): boolean {
  return (
    member !== undefined &&
    seams.includes(relativePath(fileOf(member))) &&
    ts.isPropertySignatureDeclaration(member) &&
    member.name.getText() === behaviourBinder &&
    findAncestor(member, ts.isTypeAliasDeclaration)?.name.text === behaviourType
  );
}

function bindsABehaviour(call: ts.CallExpression): boolean {
  return isTheBinder(calledDeclaration(librarySources, call)?.parent);
}

function behaviourBindings(node: ts.Node): ts.CallExpression[] {
  return descendants(node).filter(
    (found): found is ts.CallExpression => ts.isCallExpression(found) && bindsABehaviour(found),
  );
}

function referencesToTheBinder(node: ts.Node): ts.Node[] {
  return descendants(node).filter((found) =>
    memberDeclarations(librarySources, found).some(isTheBinder),
  );
}

function lineOf(node: ts.Node): number {
  return node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
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

function tagOf(node: ts.Node): JsxTag | undefined {
  if (ts.isJsxElement(node)) return node.openingElement;
  return ts.isJsxSelfClosingElement(node) ? node : undefined;
}

function rendered(children: readonly ts.JsxChild[]): ts.JsxChild[] {
  return children.filter((child) => !ts.isJsxText(child) || child.text.trim() !== "");
}

function isStyleElement(node: ts.Node): boolean {
  const shown = ts.isParenthesizedExpression(node) ? unwrapped(node) : node;
  return tagOf(shown)?.tagName.getText() === "style";
}

function isShowOfRules(child: ts.JsxChild): boolean {
  if (!ts.isJsxElement(child) || child.openingElement.tagName.getText() !== "Show") return false;
  const [only, ...others] = rendered(child.children);
  if (only === undefined || others.length > 0) return false;
  if (isStyleElement(only)) return true;
  const shown = ts.isJsxExpression(only) ? only.expression : undefined;
  return shown !== undefined && ts.isArrowFunction(shown) && isStyleElement(shown.body);
}

function besideProblems(tag: JsxTag): string[] {
  const element = ts.isJsxOpeningElement(tag) ? tag.parent : tag;
  const holder = element.parent;
  if (!ts.isJsxFragment(holder) && !ts.isJsxElement(holder)) return [];
  const children = rendered(holder.children);
  const at = children.findIndex((child) => child === element);
  const before = children.slice(0, at);
  return at === children.length - 1 && before.length <= 1 && before.every(isShowOfRules)
    ? []
    : [
        `render nothing beside <${tag.tagName.getText()}> but, before it, one <Show> whose child is a <style> of its rules.`,
      ];
}

function rootAfterItsRules(fragment: ts.JsxFragment): JsxTag[] {
  const root = tagOf(rendered(fragment.children).at(-1) ?? fragment);
  return root && intrinsicElement.test(root.tagName.getText()) ? [root] : [];
}

function returnedRoots(fn: ts.FunctionDeclaration): JsxTag[] {
  return descendants(fn).flatMap((node): JsxTag[] => {
    if (!ts.isReturnStatement(node) || !node.expression) return [];
    const returned = unwrapped(node.expression);
    if (ts.isJsxFragment(returned)) return rootAfterItsRules(returned);
    const tag = tagOf(returned);
    return tag ? [tag] : [];
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
  const partsFile = join(dirname(source.fileName), partsModule);
  return source.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      fileNamedBy(source.fileName, statement.moduleSpecifier.text) !== partsFile
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

function typeMembers(type: ts.TypeNode): ts.TypeNode[] {
  if (ts.isParenthesizedTypeNode(type)) return typeMembers(type.type);
  if (ts.isIntersectionTypeNode(type) || ts.isUnionTypeNode(type)) {
    return type.types.flatMap(typeMembers);
  }
  return [type];
}

function ownPropNames(ownProps: ts.TypeNode | undefined): OwnPropNames {
  const members = ownProps ? typeMembers(ownProps) : [];
  const literalMembers = members.filter(ts.isTypeLiteralNode).flatMap((literal) => literal.members);
  return {
    names: [...new Set(literalMembers.flatMap((member) => staticPropertyName(member) ?? []))],
    unread: [
      ...members.filter(
        (member) => !ts.isTypeLiteralNode(member) && member.getText() !== displayPropsRefused,
      ),
      ...literalMembers.filter((member) => staticPropertyName(member) === undefined),
    ].map((member) => member.getText()),
  };
}

function propsGivenToVariables(argument: ts.Expression): string[] {
  if (!ts.isObjectLiteralExpression(argument)) return [];
  const option = argument.properties.find(
    (property) => staticPropertyName(property) === variablesOption,
  );
  const given = option && ts.isPropertyAssignment(option) ? option.initializer : undefined;
  return given && ts.isObjectLiteralExpression(given)
    ? given.properties.flatMap((property) =>
        ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)
          ? [property.initializer.text]
          : [],
      )
    : [];
}

function keptOffRootProblems(
  name: string,
  fn: ts.FunctionDeclaration,
  call: ts.CallExpression,
  shape: PropsShape,
): string[] {
  const kept = call.arguments
    .slice(3)
    .flatMap((argument) =>
      ts.isStringLiteral(argument) ? [argument.text] : propsGivenToVariables(argument),
    );
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

function rootProblems(name: string, fn: ts.FunctionDeclaration, shape: PropsShape): string[] {
  const rootSpreads = jsxTags(fn).filter((tag) => spreadsOn(tag).includes(rootBinding));
  const wrapped = builtComponents.includes(name) && containerPart in compiledClassesOf(name);
  const roots = wrapped ? rootSpreads : returnedRoots(fn);
  const [root] = roots;
  const problems: string[] = [];
  if (roots.length !== 1) {
    return [
      wrapped
        ? `spread {...${rootBinding}} from ${partsHelper} on one element. Where it renders it, inside its ${containerPart} part or not, the component contract checks from the markup.`
        : `return one root element, and spread {...${rootBinding}} from ${partsHelper} on it.`,
    ];
  }
  if (rootSpreads.length !== 1 || rootSpreads[0] !== root) {
    problems.push(
      `spread {...${rootBinding}} once, on the returned root element, so it takes the consumer's attributes, the style props and its class and style.`,
    );
  }
  const containers = jsxTags(fn).filter((found) =>
    spreadsOn(found).includes(`${partBinding}("${containerPart}")`),
  );
  problems.push(...[root, ...containers].flatMap(besideProblems));
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
  for (const stray of referencesToTheBinder(source).filter(
    (found) => found !== binding?.expression,
  )) {
    report(
      `call ${behaviourBinder} only as the component's one binding, with its ${partsHelper} call as the first argument, written there, and bind every part in that one call: line ${lineOf(stray)} refers to ${behaviourBinder} in ${stray.parent.getText().split("\n")[0]}.`,
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
      ...rootProblems(name, fn, shape),
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

test("every component is written the one way: one function, and its root and every other part from one createParts call, which a behaviour binds only as the first argument of its bind, and every reference to that bind is the callee of a component's one binding", () => {
  const componentFiles = components.map(({ file }) => file);
  const boundElsewhere = librarySourceFiles
    .filter((file) => !componentFiles.includes(file) && !seams.includes(relativePath(file)))
    .flatMap((file) =>
      referencesToTheBinder(typedSource(file)).map(
        (reference) =>
          `${relativePath(file)}:${lineOf(reference)}: ${reference.parent.getText().split("\n")[0]} refers to ${behaviourBinder} outside a component. Only a component binds a behaviour, to its own ${partsHelper} call.`,
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

function packageDirectoryOf(library: string, dependency: string): string {
  const owner = libraries.find(({ name }) => name === library);
  if (!owner) throw new Error(`${library}: no component library of this repository has this name.`);
  return realpathSync(join(owner.directory, "node_modules", dependency));
}

const seamDependencies = importedThroughASeam.map((entry) => ({
  ...entry,
  directory: packageDirectoryOf(entry.library, entry.dependency),
}));

function resolvesOutsideTheSeam(file: string): string[] {
  const source = typedSource(file);
  const where = (node: ts.Node) => `${relativePath(file)}:${lineOf(node)}: ${firstLine(node)}`;
  return descendants(source).flatMap((node) => {
    const specifier = moduleSpecifierOf(node);
    if (specifier === undefined) return [];
    if (!ts.isStringLiteralLikeNode(specifier)) {
      return [`${where(node)} loads a module it names at run time. Name it with a string literal.`];
    }
    const resolved = symbolOf(librarySources, specifier)?.declarations?.[0]?.resolve();
    if (resolved === undefined) {
      return [
        `${where(node)} names a module that resolves to no file, so nothing tells which package it loads. Import a module the library's program resolves, from a package its manifest names.`,
      ];
    }
    const resolvedFile = realpathSync(fileOf(resolved));
    return seamDependencies
      .filter(
        ({ directory, seam }) =>
          resolvedFile.startsWith(`${directory}/`) && relativePath(file) !== seam,
      )
      .map(
        ({ dependency, seam, directory }) =>
          `${where(node)} resolves to ${relative(directory, resolvedFile)} of ${dependency}. Only ${seam} loads it; take what you need from that module.`,
      );
  });
}

test("every module a source of a library loads resolves to a file, no source but its seam loads one that resolves inside a runtime dependency the allow-list names with one, however the specifier is spelt, and no source of a library loads a module it names at run time", () => {
  expect(librarySourceFiles.flatMap(resolvesOutsideTheSeam)).toEqual([]);
});

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
        'import { createBehaviour } from "#/src/headless.ts";',
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
    const barrel = join(source, "index.ts");
    const exportLine = (name: string, file: string | undefined) =>
      `export { ${name}, type ${name}Props } from ${file ? relativePath(file) : "no file"};`;
    const expected = components
      .filter(({ file }) => file.startsWith(source))
      .sort((left, right) => (left.name < right.name ? -1 : 1))
      .map(({ name, file }) => exportLine(name, file));
    const actual = readFileSync(barrel, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const [, name, specifier] =
          /^export \{ (\w+), type \1Props \} from "([^"]+)";$/.exec(line) ?? [];
        return name && specifier ? exportLine(name, fileNamedBy(barrel, specifier)) : line;
      });

    expect(actual, `${relativePath(barrel)}`).toEqual(expected);
  }
});

test("every public token is named --solix-*, is used by a component or the scale of a style prop or a variable, and is defined once", () => {
  const scalesOfStyleProps = [
    ...Object.values(stylePropTable),
    ...variableNames.map(variableRow),
  ].flatMap((row) => ("scale" in row && row.scale !== undefined ? [row.scale] : []));
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
      `tokens in ${tokensFile} that no component uses and no scale of a style prop or a variable covers`,
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

test("every component is described by a feature file, its own or that of the export that carries it as a static member", () => {
  const features = readdirSync(featureDirectory);
  const violations = components.flatMap(({ name }) => {
    const carrier = carriedComponents[name]?.carrier;
    const described = [name, ...(carrier === undefined ? [] : [carrier])].map(kebabCase);
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

test("each group of the variable table is named for a component, so createParts takes it by that component's name", () => {
  const names = components.map(({ name }) => name);

  expect(variableGroups.length).toBeGreaterThan(0);
  expect(variableGroups.filter((group) => !names.includes(group))).toEqual([]);
});
