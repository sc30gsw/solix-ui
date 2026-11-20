import {
  type ComponentProp,
  componentsIn,
  type LibraryComponent,
  libraryEntry,
  openLibraryProgram,
  sharedPropTypes,
} from "#/scripts/component-props.ts";
import { type ts, type Program, virtualFile } from "#/scripts/syntax.ts";

export type SpecProp = ComponentProp & { readonly common: boolean; readonly behaviour: boolean };

export type SpecComponent = Omit<LibraryComponent, "props"> & {
  readonly props: readonly SpecProp[];
};

const probesSource = `import type { JSX } from "@solidjs/web";
import type { ControlledProps, ElementProps } from ${JSON.stringify(sharedPropTypes)};

function Common(props: ElementProps<"div", { root: object }>): JSX.Element {
  return <div />;
}

function Controlled(props: ElementProps<"div", { root: object }, ControlledProps<string>>): JSX.Element {
  return <div />;
}

export { Common, Controlled };
`;

function isCallable(prop: ComponentProp): boolean {
  return [...prop.kinds].every((kind) => kind === "function" || kind === "absent");
}

function declarationsOf(props: readonly ComponentProp[] | undefined): Set<ts.Node> {
  return new Set(props?.flatMap(({ declarations }) => declarations));
}

function controlledDeclarations(
  controlled: readonly ComponentProp[] | undefined,
  common: ReadonlySet<ts.Node>,
): Set<ts.Node> {
  const own = (controlled ?? []).filter(
    ({ declarations }) => !declarations.some((declaration) => common.has(declaration)),
  );
  if (own.length === 0) {
    throw new Error(
      `${sharedPropTypes}: a component whose own props are ControlledProps<string> takes no prop beyond those every element component shares, so the spec cannot tell which props ControlledProps declares. Export ControlledProps from it as the props of a controlled component.`,
    );
  }
  return declarationsOf(own);
}

function specOf(
  props: readonly ComponentProp[],
  common: ReadonlySet<ts.Node>,
  controlled: ReadonlySet<ts.Node>,
): SpecProp[] {
  const drivesState = (prop: ComponentProp) =>
    isCallable(prop) || prop.declarations.some((declaration) => controlled.has(declaration));
  const stateful = props.some(drivesState);
  return props.map((prop) => {
    const shared = prop.declarations.some((declaration) => common.has(declaration));
    const own = !shared && prop.values !== undefined && (stateful || prop.required);
    return { ...prop, common: shared, behaviour: drivesState(prop) || own };
  });
}

export function openSpecProgram(entry: string = libraryEntry): {
  program: Program;
  components: SpecComponent[];
} {
  const probesFile = virtualFile(probesSource, ".tsx");
  const { program, elementFile } = openLibraryProgram(entry, [probesFile]);
  const [shared, controlledProbe] = componentsIn(program, elementFile, probesFile);
  const common = declarationsOf(shared?.props);
  const controlled = controlledDeclarations(controlledProbe?.props, common);
  const components = componentsIn(program, elementFile, entry).map((component) => ({
    ...component,
    props: specOf(component.props, common, controlled),
  }));
  return { program, components };
}
