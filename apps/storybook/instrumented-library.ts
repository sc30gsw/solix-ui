import { join } from "node:path";
import type { Plugin } from "vite-plus";
import {
  type ComponentProp,
  libraryComponentProps,
  libraryStaticParts,
} from "../../scripts/component-props.ts";
import { behaviourProps } from "../../scripts/component-spec.ts";
import { libraryModule } from "../../scripts/story-controls.ts";

const instrumentedModule = `\0instrumented:${libraryModule}`;
const recorder = join(import.meta.dirname, "story-records.ts");
const testMode = "test";

function takesALiteralAndNoElement({ kinds }: ComponentProp): boolean {
  return kinds.has("literal") && !kinds.has("function");
}

function takesAnElement({ kinds }: ComponentProp): boolean {
  return (
    kinds.has("function") && [...kinds].some((kind) => kind !== "function" && kind !== "absent")
  );
}

function instrumentedSource(): string {
  const behaviour = behaviourProps();
  const read = Object.fromEntries(
    Object.entries(libraryComponentProps()).map(([name, props]) => [
      name,
      {
        values: props.filter(takesALiteralAndNoElement).map((prop) => prop.name),
        elements: props.filter(takesAnElement).map((prop) => prop.name),
        substitutes: Object.fromEntries(
          props.flatMap(({ name: prop, substitute }) =>
            substitute !== undefined && behaviour[name]?.includes(prop) ? [[prop, substitute]] : [],
          ),
        ),
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
    buildStart() {
      behaviourProps();
    },
    resolveId(source, importer) {
      if (source === instrumentedModule) return instrumentedModule;
      if (source !== libraryModule || importer === instrumentedModule) return undefined;
      return instrumentedModule;
    },
    load: (id) => (id === instrumentedModule ? instrumentedSource() : undefined),
  };
}
