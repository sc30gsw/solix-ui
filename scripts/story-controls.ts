import { dirname, join } from "node:path";
import type { Plugin, ViteDevServer } from "vite-plus";
import {
  type ComponentProp,
  type Control,
  type Option,
  forgetComponentProps,
  libraryComponentProps,
  libraryEntry,
  librarySources,
} from "#/scripts/component-props.ts";
import { assertBuiltFromItsSources } from "#/scripts/source-digest.ts";
import { insideOf } from "#/scripts/subpath.ts";
import { storybookAppManifest } from "#/scripts/release-sources.ts";
import { repositoryRoot } from "#/scripts/repository.ts";

export type StoryControl = {
  readonly control: false | { readonly type: Exclude<Control["type"], false> };
  readonly options?: readonly Option[];
};

type Summary = { readonly summary: string };

export type GeneratedArgType = StoryControl & {
  readonly description: string;
  readonly type: { readonly name: "other"; readonly value: string; readonly required: boolean };
  readonly table: {
    readonly category: string;
    readonly type: Summary;
    readonly defaultValue?: Summary;
  };
};

export const storyControlsModule = "virtual:story-controls";
export const libraryModule = "@solix/core";

const resolvedStoryControlsModule = `\0${storyControlsModule}`;
const storybookManifest = join(repositoryRoot, storybookAppManifest);

function storyControlOf({ control }: ComponentProp): StoryControl {
  if (control.type === false) return { control: false };
  if (control.type === "select") return { control: { type: "select" }, options: control.options };
  return { control: { type: control.type } };
}

function argTypeOf(prop: ComponentProp): GeneratedArgType {
  return {
    ...storyControlOf(prop),
    description: prop.description,
    type: { name: "other", value: prop.type, required: prop.required },
    table: {
      category: prop.declaredBy,
      type: { summary: prop.type },
      ...(prop.defaultValue === undefined ? {} : { defaultValue: { summary: prop.defaultValue } }),
    },
  };
}

export function argTypesOfEachComponent(
  entry: string = libraryEntry,
): Record<string, Record<string, GeneratedArgType>> {
  return Object.fromEntries(
    Object.entries(libraryComponentProps(entry)).map(([component, props]) => [
      component,
      Object.fromEntries(props.map((prop) => [prop.name, argTypeOf(prop)])),
    ]),
  );
}

function storyControlsSource(library: string, entry: string): string {
  return `import * as library from ${JSON.stringify(library)};

const argTypesOfEachComponent = ${JSON.stringify(argTypesOfEachComponent(entry))};

export function argTypesOf(component) {
  const name = Object.keys(argTypesOfEachComponent).find((exported) => library[exported] === component);
  if (name === undefined) {
    throw new Error(${JSON.stringify(`argTypesOf takes a component that ${libraryModule} exports.`)});
  }
  return structuredClone(argTypesOfEachComponent[name]);
}
`;
}

export function storyControls(entry: string = libraryEntry): Plugin {
  const isLibrarySource = (file: string) => insideOf(dirname(entry), file);
  let server: ViteDevServer | undefined;
  return {
    name: "solix:story-controls",
    configureServer(started) {
      server = started;
    },
    resolveId: (id) => (id === storyControlsModule ? resolvedStoryControlsModule : undefined),
    async load(id) {
      if (id !== resolvedStoryControlsModule) return undefined;
      assertBuiltFromItsSources(dirname(entry));
      const library = await this.resolve(libraryModule, storybookManifest);
      if (!library)
        throw new Error(`${storybookManifest}: ${libraryModule} does not resolve here.`);
      for (const source of librarySources(entry)) this.addWatchFile(source);
      return storyControlsSource(library.id, entry);
    },
    watchChange(id) {
      if (!isLibrarySource(id)) return;
      forgetComponentProps([id]);
      for (const environment of Object.values(server?.environments ?? {})) {
        const served = environment.moduleGraph.getModuleById(resolvedStoryControlsModule);
        if (served) environment.moduleGraph.invalidateModule(served);
      }
    },
  };
}
