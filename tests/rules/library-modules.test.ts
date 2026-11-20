import { globSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { expect, test } from "vite-plus/test";
import { VARIABLES_MODULE } from "#/packages/core/build-pipeline.mjs";
import { stylePropKeys, stylePropTable } from "#/packages/core/src/style-prop-table.ts";
import { scaleOfThemeKey, variableRows } from "#/packages/core/tests/built-library.ts";
import { loads } from "#/scripts/runtime-dependencies.ts";
import { fileNamedBy } from "#/scripts/subpath.ts";
import { tokenValues } from "#/scripts/tokens.ts";
import {
  constructedClass,
  descendants,
  exportsOf,
  fileOf,
  firstLine,
  isDomLibraryFile,
  isTypeOnlyImport,
  memberDeclarations,
  nameOf,
  moduleSpecifierOf,
  parse,
  parseAll,
  parseText,
  staticPropertyName,
  stringsIn,
  symbolOf,
  ts,
} from "#/scripts/syntax.ts";
import { layoutMembers } from "#/tests/support/primitive-rules/layout-reads.ts";
import { componentLibraries, repositoryRoot, scriptFiles } from "#/tests/support/workspace.ts";
import {
  componentFile,
  components,
  definedVariablesOf,
  importedThroughASeam,
  libraries,
  librarySourceFiles,
  librarySources,
  libraryStyleModule,
  lineOf,
  partsHelper,
  partsHelperFile,
  partsModule,
  relativePath,
  stylePropTableFile,
  stylesVariable,
  typedSource,
  unwrapped,
  variablesDefiner,
  variablesFile,
} from "#/tests/support/library-sources.ts";

const stylexModule = "@stylexjs/stylex";
const stylexRuntimeFunctions = ["attrs", "props"];

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

const helperFile =
  /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.tsx?|[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.stylex\.ts|index\.ts)$/;
const tokenName = /^--solix-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const libraryEntry = /(?:^|\/)src\/index\.ts$/;
const builtLibraryFile = "packages/core/tests/built-library.ts";
const fixturesFile = "packages/core/tests/fixtures.ts";
const testDirectory = "tests";
const libraryCode = ["*.{ts,tsx,mjs,js}", "src/**/*.{ts,tsx,mjs,js}"];

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

const styleElement = "style";
const styleSheetClass = "CSSStyleSheet";
const adoptedStyleSheets = "adoptedStyleSheets";
const elementNameAt: Record<string, number> = { createElement: 0, createElementNS: 1 };

function domMembersOf(node: ts.Node): string[] {
  return memberDeclarations(librarySources, node).flatMap((declaration) =>
    ts.isBindingElement(declaration)
      ? domMembersOf(declaration)
      : isDomLibraryFile(fileOf(declaration))
        ? [nameOf(declaration)]
        : [],
  );
}

function writesAStyle(node: ts.Node): boolean {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    return node.tagName.getText() === styleElement;
  }
  if (domMembersOf(node).includes(adoptedStyleSheets)) return true;
  if (
    constructedClass(librarySources, node).some(
      ({ name, file }) => name === styleSheetClass && isDomLibraryFile(file),
    )
  ) {
    return true;
  }
  if (!ts.isCallExpression(node)) return false;
  return domMembersOf(unwrapped(node.expression)).some((member) =>
    stringsIn(librarySources, node.arguments[elementNameAt[member] ?? -1]).some(
      (name) => name.toLowerCase() === styleElement,
    ),
  );
}

function styleWritesIn(file: string, source: ts.SourceFile): string[] {
  return descendants(source)
    .filter(writesAStyle)
    .map(
      (node) =>
        `${relativePath(file)}:${lineOf(node)}: ${firstLine(node)} writes a style element or a style sheet. Render LibraryStyle from ${libraryStyleModule}.`,
    );
}

test("no source of a library but library-style.tsx renders a <style>, creates a style element, or constructs or adopts a style sheet", () => {
  expect(
    librarySourceFiles
      .filter((file) => relativePath(file) !== libraryStyleModule)
      .flatMap((file) => styleWritesIn(file, typedSource(file))),
  ).toEqual([]);
  expect(
    styleWritesIn(libraryStyleModule, typedSource(join(repositoryRoot, libraryStyleModule))),
  ).toHaveLength(1);
});

const layoutReadsAtTheEvent: readonly { file: string; reason: string }[] = [
  {
    file: "packages/core/src/light-dismiss.ts",
    reason: "it reads the dialog's box at each press, to tell a press outside it",
  },
  {
    file: "packages/core/src/step-over-disabled.ts",
    reason: "it reads the list's direction at each key, to tell which arrow moves forward",
  },
];

function layoutReadsIn(file: string): string[] {
  return descendants(typedSource(file))
    .filter((node) => domMembersOf(node).some((member) => layoutMembers.includes(member)))
    .map(
      (node) =>
        `${relativePath(file)}:${lineOf(node)}: ${firstLine(node)} reads layout, and keeps what it read when a stylesheet or a resize changes the layout later. Read it at the event that needs it, in a module of layoutReadsAtTheEvent with its reason.`,
    );
}

test("no source of a library reads a layout member but the modules that read it at the event that needs it, each with its reason, and each of those reads one", () => {
  const atTheEvent = layoutReadsAtTheEvent.map(({ file }) => file);

  expect(
    librarySourceFiles
      .filter((file) => !atTheEvent.includes(relativePath(file)))
      .flatMap(layoutReadsIn),
  ).toEqual([]);
  for (const { file, reason } of layoutReadsAtTheEvent) {
    expect(
      layoutReadsIn(join(repositoryRoot, file)),
      `${file} is listed because ${reason}, so it reads a layout member, or its entry goes`,
    ).not.toEqual([]);
  }
});

test("every other source file is the barrel, a component's variables, a StyleX definition, or a kebab-case module, with JSX or without", () => {
  const violations = libraries.flatMap(({ source }) =>
    readdirSync(source)
      .filter(
        (entry) =>
          !componentFile.test(entry) && !helperFile.test(entry) && !VARIABLES_MODULE.test(entry),
      )
      .map(
        (entry) =>
          `${relativePath(join(source, entry))}: name it Component.tsx for a component, Component.variables.ts for its variables, kebab-case.ts or kebab-case.tsx for a module, or name.stylex.ts for StyleX variables.`,
      ),
  );

  expect(violations).toEqual([]);
});

const barrelLine = /^export \{ [^}]+ \} from "([^"]+)";$/;

function moduleNameOf(file: string): string {
  return basename(file).replace(/\.tsx?$/, "");
}

test("the barrel exports every component and its props type once, and by name what other modules give consumers, one line per module in the order of the module names, and nothing else", () => {
  for (const { source } of libraries) {
    const barrel = join(source, "index.ts");
    const where = relativePath(barrel);
    const names = components
      .filter(({ file }) => file.startsWith(source))
      .map(({ name }) => name)
      .sort();
    const lines = readFileSync(barrel, "utf8").trim().split("\n");
    const files = lines.map((line) => {
      const specifier = barrelLine.exec(line)?.[1];
      return specifier === undefined ? undefined : fileNamedBy(barrel, specifier);
    });
    const modules = files.map((file) => (file === undefined ? undefined : moduleNameOf(file)));
    const notModules = files.filter(
      (file) =>
        file !== undefined &&
        (dirname(file) !== source ||
          (!names.includes(moduleNameOf(file)) && !helperFile.test(basename(file)))),
    );

    expect(
      lines.filter((_, index) => files[index] === undefined),
      `${where}: write each line as export { names } from "<specifier of a module in src>";`,
    ).toEqual([]);
    expect(modules, `${where}: order the lines by module name`).toEqual(
      modules.toSorted(
        (one, other) => Number((one ?? "") > (other ?? "")) - Number((one ?? "") < (other ?? "")),
      ),
    );
    expect(new Set(modules).size, `${where}: re-export each module on one line`).toBe(
      modules.length,
    );
    expect(
      notModules.map((file) => (file === undefined ? "" : relativePath(file))),
      `${where}: re-export only components and kebab-case modules of src`,
    ).toEqual([]);
    expect(
      lines.flatMap((line, index) => {
        const module = modules[index];
        return module !== undefined && names.includes(module) ? [[module, line]] : [];
      }),
      where,
    ).toEqual(
      names.map((name) => [
        name,
        expect.stringMatching(
          new RegExp(`^export \\{ ${name}, type ${name}Props \\} from "[^"]+";$`),
        ),
      ]),
    );
  }
});

test("every public token is named --solix-*, is used by a component or the scale of a style prop, a variable or a theme key, and is defined once", () => {
  const scalesOfStyleProps = [
    ...[...Object.values(stylePropTable), ...variableRows.map(({ row }) => row)].flatMap((row) =>
      "scale" in row && row.scale !== undefined ? [row.scale] : [],
    ),
    ...Object.values(scaleOfThemeKey),
  ];
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
      `tokens in ${tokensFile} that no component uses and no scale of a style prop, a variable or a theme key covers`,
    ).toEqual([]);
    expect(
      used.filter((name) => !defined.includes(name)),
      `tokens used but not defined in ${tokensFile}`,
    ).toEqual([]);
  }
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

test("each Component.variables.ts sits beside its Component.tsx, imports at run time only the variables module, and exports one constant, the variables that defineVariables gives for that component", () => {
  const variablesFiles = libraries.flatMap(({ source }) =>
    readdirSync(source)
      .filter((entry) => VARIABLES_MODULE.test(entry))
      .map((entry) => join(source, entry)),
  );
  const violations = variablesFiles.flatMap((file) => {
    const name = basename(file, ".variables.ts");
    const source = typedSource(file);
    const { functions, types, others } = exportsOf(source);
    const runTimeImports = source.statements.filter((statement) => {
      const specifier = moduleSpecifierOf(statement);
      return (
        ts.isImportDeclaration(statement) &&
        !isTypeOnlyImport(statement.importClause) &&
        (!specifier ||
          !ts.isStringLiteralLikeNode(specifier) ||
          fileNamedBy(file, specifier.text) !== join(repositoryRoot, variablesFile))
      );
    });
    const defined = source.statements.flatMap((statement) =>
      ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.map(definedVariablesOf)
        : [],
    );
    return [
      ...(components.some((component) => component.file === join(dirname(file), `${name}.tsx`))
        ? []
        : [`name it for a component beside it, as ${name}.tsx is no component`]),
      ...(defined.length === 1 &&
      defined[0] === name &&
      functions.length + types.length + others.length === 1
        ? []
        : [
            `export one constant, \`${variablesDefiner}("${name}", { ... })\` from ${variablesFile}, and nothing else`,
          ]),
      ...runTimeImports.map(
        (statement) =>
          `import only ${variablesFile} at run time, so build.mjs loads this module in plain Node: ${firstLine(statement)}`,
      ),
    ].map((problem) => `${relativePath(file)}: ${problem}.`);
  });

  expect(variablesFiles.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
