import { join } from "node:path";
import type { Plugin } from "vite-plus";
import { libraryComponentProps } from "../../scripts/component-props.ts";
import { libraryModule } from "../../scripts/story-controls.ts";

const instrumentedModule = `\0instrumented:${libraryModule}`;
const recorder = join(import.meta.dirname, "story-records.ts");

function instrumentedSource(): string {
  const components = Object.keys(libraryComponentProps());
  return [
    `import * as library from ${JSON.stringify(libraryModule)};`,
    `import { instrumented } from ${JSON.stringify(recorder)};`,
    `export * from ${JSON.stringify(libraryModule)};`,
    `const recorded = instrumented(library, ${JSON.stringify(components)});`,
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
