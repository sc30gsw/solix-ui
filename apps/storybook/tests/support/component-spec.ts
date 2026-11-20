import {
  type ComponentProp,
  componentsIn,
  type LibraryComponent,
  libraryEntry,
  openLibraryProgram,
  sharedPropTypes,
} from "../../../../scripts/component-props.ts";
import { type Program, virtualFile } from "../../../../scripts/syntax.ts";

export type SpecProp = ComponentProp & { readonly common: boolean; readonly behaviour: boolean };

export type SpecComponent = Omit<LibraryComponent, "props"> & {
  readonly props: readonly SpecProp[];
};

const commonPropsSource = `import type { JSX } from "@solidjs/web";
import type { ElementProps } from ${JSON.stringify(sharedPropTypes)};

function Common(props: ElementProps<"div", { root: object }>): JSX.Element {
  return <div />;
}

export { Common };
`;
const uncontrolledPrefix = "default";

function isCallable(prop: ComponentProp): boolean {
  return [...prop.kinds].every((kind) => kind === "function" || kind === "absent");
}

function inAPair(prop: ComponentProp, names: ReadonlySet<string>): boolean {
  const capitalised = `${prop.name.charAt(0).toUpperCase()}${prop.name.slice(1)}`;
  const uncontrolled = prop.name.slice(uncontrolledPrefix.length);
  const controlled = `${uncontrolled.charAt(0).toLowerCase()}${uncontrolled.slice(1)}`;
  return (
    names.has(`${uncontrolledPrefix}${capitalised}`) ||
    (prop.name.startsWith(uncontrolledPrefix) && names.has(controlled))
  );
}

function specOf(props: readonly ComponentProp[], common: ReadonlySet<unknown>): SpecProp[] {
  const names = new Set(props.map(({ name }) => name));
  const drivesState = (prop: ComponentProp) => isCallable(prop) || inAPair(prop, names);
  const stateful = props.some(drivesState);
  return props.map((prop) => {
    const shared = prop.declarations.some((declaration) => common.has(declaration));
    const own = !shared && prop.control.type === "boolean" && (stateful || prop.required);
    return { ...prop, common: shared, behaviour: drivesState(prop) || own };
  });
}

export function openSpecProgram(
  files: readonly string[],
  entry: string = libraryEntry,
): {
  program: Program;
  components: SpecComponent[];
} {
  const commonFile = virtualFile(commonPropsSource, ".tsx");
  const { program, elementFile } = openLibraryProgram(entry, [commonFile, ...files]);
  const [shared] = componentsIn(program, elementFile, commonFile);
  const common = new Set(shared?.props.flatMap(({ declarations }) => declarations));
  const components = componentsIn(program, elementFile, entry).map((component) => ({
    ...component,
    props: specOf(component.props, common),
  }));
  return { program, components };
}
