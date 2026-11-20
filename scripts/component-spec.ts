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

const stateTypes = ["ControlledProps<string>", "OpenedProps"];

const probesSource = `import type { JSX } from "@solidjs/web";
import type { ControlledProps, ElementProps, OpenedProps } from ${JSON.stringify(sharedPropTypes)};

function Common(props: ElementProps<"div", { root: object }>): JSX.Element {
  return <div />;
}

${stateTypes
  .map(
    (
      type,
      at,
    ) => `function State${at}(props: ElementProps<"div", { root: object }, ${type}>): JSX.Element {
  return <div />;
}`,
  )
  .join("\n\n")}

export { Common, ${stateTypes.map((_, at) => `State${at}`).join(", ")} };
`;

function isCallable(prop: ComponentProp): boolean {
  return [...prop.kinds].every((kind) => kind === "function" || kind === "absent");
}

function declarationsOf(props: readonly ComponentProp[] | undefined): Set<ts.Node> {
  return new Set(props?.flatMap(({ declarations }) => declarations));
}

function declares(prop: ComponentProp, declarations: ReadonlySet<ts.Node>): boolean {
  return prop.declarations.some((declaration) => declarations.has(declaration));
}

function stateDeclarations(
  probes: readonly LibraryComponent[],
  common: ReadonlySet<ts.Node>,
): Set<ts.Node> {
  return new Set(
    stateTypes.flatMap((type, at) => {
      const own = (probes[at]?.props ?? []).filter((prop) => !declares(prop, common));
      if (own.length === 0) {
        throw new Error(
          `${sharedPropTypes}: a component whose own props are ${type} takes no prop beyond those every element component shares, so the spec cannot tell which props ${type} declares. Export it from that file as the props a component's state is given by.`,
        );
      }
      return [...declarationsOf(own)];
    }),
  );
}

function statefulComponents(
  components: readonly LibraryComponent[],
  drivesState: (prop: ComponentProp) => boolean,
): Set<LibraryComponent> {
  const stateful = new Set(components.filter(({ props }) => props.some(drivesState)));
  const isPartOf = (part: LibraryComponent, owner: LibraryComponent) =>
    part.declarations.some((declaration) => owner.partDeclarations.includes(declaration));
  let grown = true;
  while (grown) {
    const parts = components.filter(
      (part) => !stateful.has(part) && [...stateful].some((owner) => isPartOf(part, owner)),
    );
    for (const part of parts) stateful.add(part);
    grown = parts.length > 0;
  }
  return stateful;
}

function specOf(
  components: readonly LibraryComponent[],
  common: ReadonlySet<ts.Node>,
  state: ReadonlySet<ts.Node>,
): SpecComponent[] {
  const drivesState = (prop: ComponentProp) => isCallable(prop) || declares(prop, state);
  const stateful = statefulComponents(components, drivesState);
  const isBehaviour = (component: LibraryComponent, prop: ComponentProp) =>
    drivesState(prop) ||
    (!declares(prop, common) && prop.values !== undefined && stateful.has(component));
  const behaviour = new Set(
    components.flatMap((component) =>
      component.props
        .filter((prop) => isBehaviour(component, prop))
        .flatMap(({ declarations }) => declarations),
    ),
  );
  return components.map((component) => ({
    ...component,
    props: component.props.map((prop) => ({
      ...prop,
      common: declares(prop, common),
      behaviour: declares(prop, behaviour),
    })),
  }));
}

export function openSpecProgram(entry: string = libraryEntry): {
  program: Program;
  components: SpecComponent[];
} {
  const probesFile = virtualFile(probesSource, ".tsx");
  const { program, elementFile } = openLibraryProgram(entry, [probesFile]);
  const [shared, ...stateProbes] = componentsIn(program, elementFile, probesFile);
  const common = declarationsOf(shared?.props);
  const state = stateDeclarations(stateProbes, common);
  return { program, components: specOf(componentsIn(program, elementFile, entry), common, state) };
}
