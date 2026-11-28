import type { ComponentName, FunctionSpec, GapItem, LookSpec } from "#/spec/format.ts";
import { spec as buttonSpec } from "#/spec/Button.ts";
import { spec as foundationsSpec } from "#/spec/foundations.ts";
import { look as buttonLook } from "#/spec/look/Button.ts";
import { look as foundationsLook } from "#/spec/look/foundations.ts";
import { spec as modalSpec } from "#/spec/Modal.ts";
import { spec as solixProviderSpec } from "#/spec/SolixProvider.ts";
import { spec as tabsSpec } from "#/spec/Tabs.ts";
import { spec as textInputSpec } from "#/spec/TextInput.ts";

export const drawsNoLook = "draws no look of its own";

export type Registered =
  | {
      readonly spec: FunctionSpec | GapItem;
      readonly look: LookSpec | GapItem | typeof drawsNoLook;
      readonly until?: GapItem;
    }
  | { readonly coveredBy: ComponentName };

export const specs = {
  Box: { spec: "step 1", look: drawsNoLook },
  Button: { spec: buttonSpec, look: buttonLook },
  Center: { spec: "step 2", look: drawsNoLook },
  ColorSchemeScript: { spec: "step 2", look: drawsNoLook },
  Container: { spec: "step 2", look: drawsNoLook },
  Disclosure: { spec: "step 12", look: "step 12" },
  Flex: { spec: "step 2", look: drawsNoLook },
  Grid: { spec: "step 2", look: drawsNoLook },
  GridCol: { spec: "step 2", look: drawsNoLook },
  Group: { spec: "step 2", look: drawsNoLook },
  Modal: { spec: modalSpec, look: "step 13", until: "step 13" },
  SimpleGrid: { spec: "step 2", look: drawsNoLook },
  SolixProvider: { spec: solixProviderSpec, look: drawsNoLook, until: "step 14" },
  Space: { spec: "step 2", look: drawsNoLook },
  Stack: { spec: "step 2", look: drawsNoLook },
  Tabs: { spec: tabsSpec, look: "step 8", until: "step 8" },
  TabsList: { coveredBy: "Tabs" },
  TabsPanel: { coveredBy: "Tabs" },
  TabsTab: { coveredBy: "Tabs" },
  TextInput: { spec: textInputSpec, look: "step 10", until: "step 10" },
} as const satisfies Record<ComponentName, Registered>;

export const foundations = { spec: foundationsSpec, look: foundationsLook } as const;

type Named<S> = readonly (readonly [name: string, spec: S])[];

function written<S>(
  pick: (entry: Registered) => unknown,
  isOne: (value: unknown) => value is S,
): Named<S> {
  return Object.entries(specs).flatMap(([name, entry]: [string, Registered]) => {
    const found = pick(entry);
    return isOne(found) ? [[name, found] as const] : [];
  });
}

function isObject<S>(value: unknown): value is S {
  return typeof value === "object" && value !== null;
}

export const functionSpecs: Named<FunctionSpec> = [
  ["foundations", foundations.spec],
  ...written<FunctionSpec>((entry) => ("spec" in entry ? entry.spec : undefined), isObject),
];

export const lookSpecs: Named<LookSpec> = [
  ["foundations", foundations.look],
  ...written<LookSpec>((entry) => ("look" in entry ? entry.look : undefined), isObject),
];
