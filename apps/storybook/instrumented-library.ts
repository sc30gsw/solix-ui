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
const countedExpect = join(import.meta.dirname, "counted-expect.ts");
const testModule = "storybook/test";
const testMode = "test";

function takesALiteralAndNoElement({ kinds }: ComponentProp): boolean {
  return kinds.has("literal") && !kinds.has("function");
}

function isStoryCode(importer: string | undefined): boolean {
  return (
    importer !== undefined && importer !== countedExpect && !importer.includes("/node_modules/")
  );
}

function takesAnElement({ kinds }: ComponentProp): boolean {
  return (
    kinds.has("function") && [...kinds].some((kind) => kind !== "function" && kind !== "absent")
  );
}

function instrumentedSource(): string {
  const read = Object.fromEntries(
    Object.entries(libraryComponentProps()).map(([name, props]) => [
      name,
      {
        values: props.filter(takesALiteralAndNoElement).map((prop) => prop.name),
        elements: props.filter(takesAnElement).map((prop) => prop.name),
      },
    ]),
  );
  const components = Object.keys(read);
  return [
    `import * as library from ${JSON.stringify(libraryModule)};`,
    `import { instrumented } from ${JSON.stringify(recorder)};`,
    `export * from ${JSON.stringify(libraryModule)};`,
    `const recorded = instrumented(library, ${JSON.stringify(read)}, ${JSON.stringify(libraryStaticParts())});`,
    ...components.map((name) => `export const ${name} = recorded[${JSON.stringify(name)}];`),
    "",
  ].join("\n");
}

export function instrumentedLibrary(): Plugin {
  return {
    name: "solix:instrumented-library",
    enforce: "pre",
    apply: (_, { mode }) => mode === testMode,
    resolveId(source, importer) {
      if (source === instrumentedModule) return instrumentedModule;
      if (source === testModule && isStoryCode(importer)) return countedExpect;
      if (source !== libraryModule || importer === instrumentedModule) return undefined;
      return instrumentedModule;
    },
    load: (id) => (id === instrumentedModule ? instrumentedSource() : undefined),
  };
}
