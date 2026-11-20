import { join } from "node:path";
import type { Plugin } from "vite-plus";
import {
  type ComponentProp,
  type Control,
  libraryComponentProps,
} from "#/scripts/component-props.ts";
import { storybookAppManifest } from "#/scripts/release-sources.ts";
import { repositoryRoot } from "#/scripts/repository.ts";

export type StoryControl = {
  readonly control: false | { readonly type: Exclude<Control["type"], false> };
  readonly options?: readonly unknown[];
};

export type GeneratedArgType = StoryControl & {
  readonly type: { readonly name: "other"; readonly value: string; readonly required: boolean };
  readonly table: { readonly category: string; readonly type: { readonly summary: string } };
};

export const storyControlsModule = "virtual:story-controls";
export const libraryModule = "@solix/core";

const resolvedStoryControlsModule = `\0${storyControlsModule}`;
const storybookManifest = join(repositoryRoot, storybookAppManifest);

export function storyControlOf({ control }: ComponentProp): StoryControl {
  if (control.type === false) return { control: false };
  if (control.type === "select") return { control: { type: "select" }, options: control.options };
  return { control: { type: control.type } };
}

function argTypeOf(prop: ComponentProp): GeneratedArgType {
  return {
    ...storyControlOf(prop),
    type: { name: "other", value: prop.type, required: prop.required },
    table: { category: prop.declaredBy, type: { summary: prop.type } },
  };
}

export function argTypesOfEachComponent(): Record<string, Record<string, GeneratedArgType>> {
  return Object.fromEntries(
    Object.entries(libraryComponentProps()).map(([component, props]) => [
      component,
      Object.fromEntries(props.map((prop) => [prop.name, argTypeOf(prop)])),
    ]),
  );
}

function storyControlsSource(library: string): string {
  return `import * as library from ${JSON.stringify(library)};

const argTypesOfEachComponent = ${JSON.stringify(argTypesOfEachComponent())};

export function argTypesOf(component) {
  const name = Object.keys(argTypesOfEachComponent).find((exported) => library[exported] === component);
  if (name === undefined) {
    throw new Error(${JSON.stringify(`argTypesOf takes a component that ${libraryModule} exports.`)});
  }
  return structuredClone(argTypesOfEachComponent[name]);
}
`;
}

export function storyControls(): Plugin {
  return {
    name: "solix:story-controls",
    resolveId: (id) => (id === storyControlsModule ? resolvedStoryControlsModule : undefined),
    async load(id) {
      if (id !== resolvedStoryControlsModule) return undefined;
      const library = await this.resolve(libraryModule, storybookManifest);
      if (!library)
        throw new Error(`${storybookManifest}: ${libraryModule} does not resolve here.`);
      return storyControlsSource(library.id);
    },
  };
}
