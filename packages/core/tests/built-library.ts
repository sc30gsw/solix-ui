import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createComponent, renderToString } from "@solidjs/web";
import postcss from "postcss";
import type { Component } from "solid-js";
import ts from "typescript";
import type * as Library from "../src/index";
import type * as Parts from "../src/parts";
import { inStylePropLayer } from "./cascade-layers";

export type ConsumerProps = Record<string, unknown>;

export const dist = join(import.meta.dirname, "../dist");

const builtComponentFile = /^[A-Z][A-Za-z0-9]*\.jsx$/;

export const builtComponents: string[] = readdirSync(dist)
  .filter((file) => builtComponentFile.test(file))
  .map((file) => basename(file, ".jsx"))
  .sort();

if (builtComponents.length === 0) {
  throw new Error(`${dist}: build the library first; it holds no <Name>.jsx component.`);
}

export const library = (await import(join(dist, "index.js"))) as typeof Library;

export const { handledKeys, rootPart, stableClass, stylesApiPropKeys } = (await import(
  join(dist, "parts.js")
)) as typeof Parts;

const builtByName: Record<string, unknown> = library;

export function renderBuilt(name: string, props: ConsumerProps): string {
  const built = builtByName[name];
  if (typeof built !== "function") {
    throw new Error(`packages/core/dist/index.js: export the component ${name}.`);
  }
  const Built = built as Component<ConsumerProps>;
  return renderToString(() => createComponent(Built, props));
}

function classesOutsideTheStylePropLayer(): Set<string> {
  const found = new Set<string>();
  postcss.parse(readFileSync(join(dist, "styles.css"), "utf8")).walkRules((rule) => {
    if (inStylePropLayer(rule)) return;
    for (const [, name] of rule.selector.matchAll(/\.([\w-]+)/g)) found.add(name);
  });
  return found;
}

export const styleXClasses = classesOutsideTheStylePropLayer();

export function partsOf(component: string): string[] {
  const file = join(dist, `${component}.jsx`);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  return source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) =>
      statement.declarationList.declarations.flatMap((declaration) =>
        declaration.name.getText() === "styles" &&
        declaration.initializer !== undefined &&
        ts.isObjectLiteralExpression(declaration.initializer)
          ? declaration.initializer.properties.flatMap((property) =>
              property.name && ts.isIdentifier(property.name) ? [property.name.text] : [],
            )
          : [],
      ),
    );
}
