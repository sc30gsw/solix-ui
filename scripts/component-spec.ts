import {
  type ComponentProp,
  componentsIn,
  type LibraryComponent,
  libraryEntry,
  openLibraryProgram,
  sharedPropTypes,
} from "#/scripts/component-props.ts";
import { type Program, ts, virtualFile } from "#/scripts/syntax.ts";

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
const controlledPropsType = "ControlledProps";

function isCallable(prop: ComponentProp): boolean {
  return [...prop.kinds].every((kind) => kind === "function" || kind === "absent");
}

function controlledDeclarations(program: Program): Set<ts.Node> {
  const alias = program
    .sourceFile(sharedPropTypes)
    ?.statements.find(
      (statement) =>
        ts.isTypeAliasDeclaration(statement) && statement.name.text === controlledPropsType,
    );
  return new Set(
    alias && ts.isTypeAliasDeclaration(alias) && ts.isTypeLiteralNode(alias.type)
      ? alias.type.members
      : [],
  );
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
  const commonFile = virtualFile(commonPropsSource, ".tsx");
  const { program, elementFile } = openLibraryProgram(entry, [commonFile]);
  const [shared] = componentsIn(program, elementFile, commonFile);
  const common = new Set(shared?.props.flatMap(({ declarations }) => declarations));
  const controlled = controlledDeclarations(program);
  const components = componentsIn(program, elementFile, entry).map((component) => ({
    ...component,
    props: specOf(component.props, common, controlled),
  }));
  return { program, components };
}
