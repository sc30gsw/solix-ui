import { join } from "node:path";
import type { Plugin } from "vite-plus";
import {
  type ComponentProp,
  libraryComponentProps,
  libraryStaticParts,
} from "../../scripts/component-props.ts";
import { libraryModule } from "../../scripts/story-controls.ts";

const instrumentedModule = `\0instrumented:${libraryModule}`;
const recorder = join(import.meta.dirname, "story-records.ts");

function takesALiteralAndNoElement({ kinds }: ComponentProp): boolean {
  return kinds.has("literal") && !kinds.has("function");
}

function instrumentedSource(): string {
  const valuesRead = Object.fromEntries(
    Object.entries(libraryComponentProps()).map(([name, props]) => [
      name,
      props.filter(takesALiteralAndNoElement).map((prop) => prop.name),
    ]),
  );
  const components = Object.keys(valuesRead);
  return [
    `import * as library from ${JSON.stringify(libraryModule)};`,
    `import { instrumented } from ${JSON.stringify(recorder)};`,
    `export * from ${JSON.stringify(libraryModule)};`,
    `const recorded = instrumented(library, ${JSON.stringify(valuesRead)}, ${JSON.stringify(libraryStaticParts())});`,
    ...components.map((name) => `export const ${name} = recorded[${JSON.stringify(name)}];`),
    "",
  ].join("\n");
}

export function instrumentedLibrary(): Plugin {
  return {
    name: "solix:instrumented-library",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === instrumentedModule) return instrumentedModule;
      if (source !== libraryModule || importer === instrumentedModule) return undefined;
      return instrumentedModule;
    },
    load: (id) => (id === instrumentedModule ? instrumentedSource() : undefined),
  };
}
