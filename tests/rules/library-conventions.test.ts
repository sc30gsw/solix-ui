import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "vite-plus/test";
import { builtComponents, compiledClassesOf } from "#/packages/core/tests/built-library.ts";
import {
  componentsIn,
  librarySources as librarySourcesOf,
  openLibraryProgram,
} from "#/scripts/component-props.ts";
import { fileNamedBy } from "#/scripts/subpath.ts";
import {
  calledDeclaration,
  declarationsOfSymbol,
  declaredDefaultsIn,
  descendants,
  literalTypeAt,
  exportsOf,
  fileOf,
  findAncestor,
  firstLine,
  memberDeclarations,
  staticPropertyName,
  symbolOf,
  ts,
} from "#/scripts/syntax.ts";
import {
  type Component,
  components,
  definedVariablesOf,
  isConst,
  libraries,
  librarySourceFiles,
  librarySources,
  libraryStyleModule,
  lineOf,
  partsHelper,
  partsHelperFile,
  partsModule,
  relativePath,
  seams,
  stylesVariable,
  typedSource,
  unwrapped,
  variablesDefiner,
  variablesFileOf,
} from "#/tests/support/library-sources.ts";

const stylesFactory = "stylex.create";
const containerPart = "container";
const variablesOption = "variables";
const keepOption = "keep";
const displayPropsRefused = "Partial<Record<DisplayPropName, never>>";
const colorPropsType = "ColorProps";
const colorPropsFile = "packages/core/src/colors.ts";
const colorOption = "color";
const rootBinding = "root";
const partBinding = "part";
const stylesApiTypeArgument = `typeof ${stylesVariable}`;
const childrenProp = "children";
const intrinsicElement = /^[a-z][a-z0-9-]*$/;
const elementPropsType = "ElementProps";
const polymorphicPropsType = "PolymorphicProps";
const behaviourType = "Behaviour";
const behaviourBinder = "bind";

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

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

function takesItsVariables(argument: ts.Expression, name: string, fn: ts.Node): boolean {
  const ownVariables = join(dirname(fileOf(fn)), variablesFileOf(name));
  if (!existsSync(ownVariables)) return ts.isStringLiteral(argument) && argument.text === name;
  const declaration = symbolOf(librarySources, argument)?.declarations?.[0]?.resolve();
  return (
    declaration !== undefined &&
    fileOf(declaration) === ownVariables &&
    definedVariablesOf(declaration) === name
  );
}

function variableNamed(node: ts.Node, name: string): ts.VariableDeclaration | undefined {
  return descendants(node).find(
    (found): found is ts.VariableDeclaration =>
      ts.isVariableDeclaration(found) && ts.isIdentifier(found.name) && found.name.text === name,
  );
}

function tagOf(node: ts.Node): JsxTag | undefined {
  if (ts.isJsxElement(node)) return node.openingElement;
  return ts.isJsxSelfClosingElement(node) ? node : undefined;
}

function rendered(children: readonly ts.JsxChild[]): ts.JsxChild[] {
  return children.filter((child) => !ts.isJsxText(child) || child.text.trim() !== "");
}

function isStyleElement(node: ts.Node): boolean {
  const tag = tagOf(ts.isParenthesizedExpression(node) ? unwrapped(node) : node);
  const declaration = tag && symbolOf(librarySources, tag.tagName)?.declarations?.[0]?.resolve();
  return declaration !== undefined && relativePath(fileOf(declaration)) === libraryStyleModule;
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
        `render nothing beside <${tag.tagName.getText()}> but, before it, one <Show> whose child is a LibraryStyle of its rules.`,
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

function isDynamicRoot(initializer: ts.Expression | undefined): boolean {
  if (!initializer || !ts.isCallExpression(initializer)) return false;
  const [factory, ...others] = initializer.arguments;
  if (initializer.expression.getText() !== "dynamic" || !factory || others.length > 0) return false;
  if (!ts.isArrowFunction(factory) || factory.parameters.length > 0) return false;
  return factory.body.getText() === "props.component ?? defaults.component";
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

function isColorProps(member: ts.TypeNode): boolean {
  if (!ts.isTypeReferenceNode(member)) return false;
  const declaration = symbolOf(librarySources, member.typeName)?.declarations?.[0]?.resolve();
  return (
    declaration !== undefined &&
    ts.isTypeAliasDeclaration(declaration) &&
    declaration.name.text === colorPropsType &&
    relativePath(fileOf(declaration)) === colorPropsFile
  );
}

const libraryFiles = new Set(librarySourceFiles);

type Given = ReadonlyMap<string, { readonly type: ts.TypeNode; readonly given: Given }>;

function aliasedMembers(member: ts.TypeNode, outer: Given): ts.TypeNode[] | undefined {
  if (!ts.isTypeReferenceNode(member) || isColorProps(member)) return undefined;
  const declaration = symbolOf(librarySources, member.typeName)?.declarations?.[0]?.resolve();
  if (
    declaration === undefined ||
    !ts.isTypeAliasDeclaration(declaration) ||
    !libraryFiles.has(fileOf(declaration))
  ) {
    return undefined;
  }
  const given = new Map(
    (declaration.typeParameters ?? []).flatMap((parameter, at) => {
      const argument = member.typeArguments?.[at] ?? parameter.defaultType;
      return argument ? [[parameter.name.text, { type: argument, given: outer }]] : [];
    }),
  );
  const aliased = typeMembers(declaration.type, given);
  return aliased.every(ts.isTypeLiteralNode) ? aliased : undefined;
}

function typeMembers(type: ts.TypeNode, given: Given = new Map()): ts.TypeNode[] {
  const parameter =
    ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)
      ? given.get(type.typeName.text)
      : undefined;
  if (parameter) return typeMembers(parameter.type, parameter.given);
  const aliased = aliasedMembers(type, given);
  if (aliased) return aliased;
  if (ts.isParenthesizedTypeNode(type)) return typeMembers(type.type, given);
  if (ts.isIntersectionTypeNode(type) || ts.isUnionTypeNode(type)) {
    return type.types.flatMap((part) => typeMembers(part, given));
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
        (member) =>
          !ts.isTypeLiteralNode(member) &&
          member.getText() !== displayPropsRefused &&
          !isColorProps(member),
      ),
      ...literalMembers.filter((member) => staticPropertyName(member) === undefined),
    ].map((member) => member.getText()),
  };
}

function optionOf(argument: ts.Expression, name: string): ts.Expression | undefined {
  if (!ts.isObjectLiteralExpression(argument)) return undefined;
  const option = argument.properties.find((property) => staticPropertyName(property) === name);
  return option && ts.isPropertyAssignment(option) ? option.initializer : undefined;
}

function propsKeptBy(argument: ts.Expression): string[] {
  const given = optionOf(argument, variablesOption);
  const kept = optionOf(argument, keepOption);
  return [
    ...(given && ts.isObjectLiteralExpression(given)
      ? given.properties.flatMap((property) =>
          ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)
            ? [property.initializer.text]
            : [],
        )
      : []),
    ...(kept && ts.isArrayLiteralExpression(kept)
      ? kept.elements.flatMap((element) => (ts.isStringLiteral(element) ? [element.text] : []))
      : []),
  ];
}

function keptOffRootProblems(
  name: string,
  fn: ts.FunctionDeclaration,
  call: ts.CallExpression,
  shape: PropsShape,
): string[] {
  const kept = call.arguments.slice(3).flatMap(propsKeptBy);
  const readsChildren = descendants(fn).some(
    (node) => ts.isPropertyAccessExpression(node) && node.getText() === `props.${childrenProp}`,
  );
  const { names, unread } = ownPropNames(shape.ownProps);
  const handledByTheComponent = [...names, ...(readsChildren ? [childrenProp] : [])];
  return [
    ...unread.map(
      (member) =>
        `write ${member} in the own props of ${name}Props as an inline type literal, such as { label: string }, so this check reads each key it declares and requires it off the root. Only ${displayPropsRefused} and ${colorPropsType}, whose members the ${colorOption} option that ${partsHelper} requires for them by type keeps off the root, may stand on their own. A type alias the library declares for a type literal, or for an intersection or union of them, reads as what it aliases.`,
    ),
    ...handledByTheComponent
      .filter((prop) => !kept.includes(prop))
      .map(
        (prop) =>
          `name "${prop}" in the ${keepOption} option of ${partsHelper}, so it stays off the root: ${prop === childrenProp ? `${name} renders props.${childrenProp} itself` : `${name}Props declares it in its own props type`}.`,
      ),
  ];
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
    if (!isDynamicRoot(variableNamed(fn, tag)?.initializer)) {
      problems.push(
        `render the root as \`const ${tag} = dynamic(() => props.component ?? defaults.component)\`, the dynamic() of @solidjs/web, with \`component: "${element}"\`, the element the type parameter defaults to, in \`const defaults = { ... } satisfies Partial<Props>\`.`,
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
    !takesItsVariables(componentName, name, fn) ||
    compiled?.getText() !== stylesVariable ||
    consumer?.getText() !== "props"
  ) {
    report(
      `call ${partsHelper} once, in a statement of the component's own body, as \`const { ${rootBinding}, ${partBinding} } = ${partsHelper}(<"${name}", or the variables ${variablesDefiner}("${name}", ...) gives in ${variablesFileOf(name)} when that file exists>, ${stylesVariable}, props, ...keptOffRoot)\` from ${partsHelperFile}, or as \`const { ${rootBinding}, ${partBinding} } = behaviour.${behaviourBinder}(${partsHelper}(...), { ... })\` with a behaviour from ${seams.join(" or ")}, so each bound part takes its slot there and none inline in JSX.`,
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

function callsCreateParts(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const called = calledDeclaration(librarySources, node);
  return (
    called !== undefined &&
    relativePath(fileOf(called)) === partsHelperFile &&
    ts.isFunctionDeclaration(called) &&
    called.name?.text === partsHelper
  );
}

test("only a Component.tsx calls createParts, so a module that renders a styled element is held to the component checks", () => {
  const componentFiles = components.map(({ file }) => file);
  const violations = librarySourceFiles
    .filter((file) => !componentFiles.includes(file))
    .flatMap((file) =>
      descendants(typedSource(file))
        .filter(callsCreateParts)
        .map(
          (call) =>
            `${relativePath(file)}:${lineOf(call)}: ${firstLine(call)} styles an element outside a component. Move it into a Component.tsx of its own.`,
        ),
    );

  expect(components.some(({ source }) => descendants(source).some(callsCreateParts))).toBe(true);
  expect(violations).toEqual([]);
});

test("a prop that falls back with ?? to a literal falls back to its component's declared default: the same prop of a defaults object that satisfies Partial of a props type, the one place the controls read a default from", () => {
  const { program, elementFile } = openLibraryProgram();
  try {
    const propDeclarations = new Set(
      componentsIn(program, elementFile).flatMap(({ props }) =>
        props.flatMap(({ declarations }) => declarations),
      ),
    );
    const sources = librarySourcesOf().flatMap((file) => program.sourceFile(file) ?? []);
    const defaultsObjects = new Set<ts.Node>(
      declaredDefaultsIn(program, sources).map(({ variable }) => variable),
    );
    const readsADefault = (fallback: ts.Expression, prop: string) =>
      ts.isPropertyAccessExpression(fallback) &&
      fallback.name.text === prop &&
      declarationsOfSymbol(symbolOf(program, fallback.expression)).some((declaration) =>
        defaultsObjects.has(declaration),
      );
    const problems = sources.flatMap((source) =>
      descendants(source).flatMap((node) => {
        if (
          !ts.isBinaryExpression(node) ||
          node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken ||
          !ts.isPropertyAccessExpression(node.left) ||
          !declarationsOfSymbol(symbolOf(program, node.left.name)).some((declaration) =>
            propDeclarations.has(declaration),
          )
        ) {
          return [];
        }
        const prop = node.left.name.text;
        if (literalTypeAt(program, node.right) === undefined || readsADefault(node.right, prop)) {
          return [];
        }
        return [
          `${relativePath(source.fileName)}:${lineOf(node)}: ${node.getText()} falls back to a literal the controls cannot read. Declare it as ${prop} in the component's \`const defaults = { ... } satisfies Partial<Props>\` and fall back to defaults.${prop}.`,
        ];
      }),
    );

    expect(defaultsObjects.size).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  } finally {
    program.dispose();
  }
});
