import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createComponent, renderToString } from "@solidjs/web";
import type { Component } from "solid-js";
import type * as Library from "../src/index";
import type * as Parts from "../src/parts";
import type * as StableClass from "../src/stable-class";
import type * as StyleProps from "../src/style-props";
import { parse, staticPropertyName, ts } from "../../../scripts/syntax";
import { memberMarkupOf } from "./markup";

export type ConsumerProps = Record<string, unknown>;

export const dist = join(import.meta.dirname, "../dist");

const builtComponentFile = /^[A-Z][A-Za-z0-9]*\.jsx$/;
const compiledStylesVariable = "styles";
const compiledStylesMarker = "$$css";

export const builtComponents: string[] = readdirSync(dist)
  .filter((file) => builtComponentFile.test(file))
  .map((file) => basename(file, ".jsx"))
  .sort();

if (builtComponents.length === 0) {
  throw new Error(`${dist}: build the library first; it holds no <Name>.jsx component.`);
}

export const library = (await import(join(dist, "index.js"))) as typeof Library;

export const { handledKeys, rootPart, stylesApiPropKeys } = (await import(
  join(dist, "parts.js")
)) as typeof Parts;

export const { stableClass } = (await import(join(dist, "stable-class.js"))) as typeof StableClass;

export const { resolveVariables } = (await import(
  join(dist, "style-props.js")
)) as typeof StyleProps;

export const stylesheet = readFileSync(join(dist, "styles.css"), "utf8");

export function builtSource(name: string): string {
  return readFileSync(join(dist, `${name}.jsx`), "utf8");
}

const builtByName: Record<string, unknown> = library;

function builtNamed(name: string): Component<ConsumerProps> {
  const built = builtByName[name];
  if (typeof built !== "function") {
    throw new Error(`packages/core/dist/index.js: export the component ${name}.`);
  }
  return built as Component<ConsumerProps>;
}

export type Carried = { carrier: string; member: string };

export const carriedComponents: Record<string, Carried> = Object.fromEntries(
  builtComponents.flatMap((carrier) =>
    Object.entries(builtNamed(carrier)).flatMap(([member, carried]) =>
      builtComponents
        .filter((name) => name !== carrier && builtByName[name] === carried)
        .map((name): [string, Carried] => [name, { carrier, member }]),
    ),
  ),
);

export type Around = { carrier: string; props: ConsumerProps };

function created(name: string, props: ConsumerProps, around: Around | undefined) {
  if (around === undefined) return createComponent(builtNamed(name), props);
  return createComponent(builtNamed(around.carrier), {
    ...around.props,
    get children() {
      return createComponent(builtNamed(name), props);
    },
  });
}

export function renderBuilt(name: string, props: ConsumerProps): string {
  return renderToString(() => created(name, props, undefined));
}

export function renderBuiltWithin(around: Around, name: string, props: ConsumerProps): string {
  return memberMarkupOf(
    renderToString(() => created(name, props, around)),
    stableClass(around.carrier, ""),
  );
}

export function renderBuiltTwice(
  name: string,
  props: ConsumerProps,
  around: Around | undefined,
): string {
  return renderToString(() => [created(name, props, around), created(name, props, around)]);
}

function keyOf(property: ts.ObjectLiteralElementLike, where: string): string {
  const name = staticPropertyName(property);
  if (name !== undefined) return name;
  throw new Error(`${where}: write every key of the compiled styles as a name or a string.`);
}

function compiledStylesOf(name: string, where: string): ts.ObjectLiteralExpression {
  const source = parse(join(dist, `${name}.jsx`));
  const initializer = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => declaration.name.getText() === compiledStylesVariable)?.initializer;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    throw new Error(
      `${where}: compile the styles to \`const ${compiledStylesVariable} = { ... }\`.`,
    );
  }
  return initializer;
}

function classesIn(entry: ts.ObjectLiteralElementLike, where: string): string[] {
  if (keyOf(entry, where) === compiledStylesMarker) return [];
  if (!ts.isPropertyAssignment(entry)) {
    throw new Error(`${where}: write each compiled style as \`key: "classes"\`.`);
  }
  if (entry.initializer.kind === ts.SyntaxKind.NullKeyword) return [];
  if (!ts.isStringLiteral(entry.initializer)) {
    throw new Error(`${where}: compile ${entry.getText()} to a string of class names.`);
  }
  return entry.initializer.text.split(/\s+/).filter((found) => found !== "");
}

export function compiledClassesOf(name: string): Record<string, string[]> {
  const where = `packages/core/dist/${name}.jsx`;
  return Object.fromEntries(
    compiledStylesOf(name, where).properties.map((part): [string, string[]] => {
      if (!ts.isPropertyAssignment(part) || !ts.isObjectLiteralExpression(part.initializer)) {
        throw new Error(`${where}: compile ${part.getText()} to an object of class names.`);
      }
      return [
        keyOf(part, where),
        part.initializer.properties.flatMap((entry) => classesIn(entry, where)),
      ];
    }),
  );
}
