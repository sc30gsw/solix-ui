import type { FunctionSpec, GapItem, LookSpec, OneOf } from "#/spec/format.ts";
import type { Section } from "#/spec/gaps.ts";
import { buttonSpec } from "#/spec/Button.ts";
import { foundationsSpec } from "#/spec/foundations.ts";
import { buttonLook } from "#/spec/look/Button.ts";
import { foundationsLook } from "#/spec/look/foundations.ts";
import { modalSpec } from "#/spec/Modal.ts";
import { solixProviderSpec } from "#/spec/SolixProvider.ts";
import { tabsSpec } from "#/spec/Tabs.ts";
import { textInputSpec } from "#/spec/TextInput.ts";

export type Slot<D> = OneOf<
  { readonly written: D; readonly completedBy?: GapItem } | { readonly writtenBy: GapItem }
>;

export type Registered = OneOf<
  | { readonly function: Slot<FunctionSpec>; readonly look: Slot<LookSpec> | "draws none" }
  | { readonly coveredBy: Section }
>;

export type Named<D> = readonly (readonly [section: string, document: D])[];

export const registry = {
  foundations: { function: { written: foundationsSpec }, look: { written: foundationsLook } },
  Box: { function: { writtenBy: "step 1" }, look: "draws none" },
  Button: { function: { written: buttonSpec }, look: { written: buttonLook } },
  Center: { function: { writtenBy: "step 2" }, look: "draws none" },
  ColorSchemeScript: { function: { writtenBy: "step 2" }, look: "draws none" },
  Container: { function: { writtenBy: "step 2" }, look: "draws none" },
  Disclosure: { function: { writtenBy: "step 12" }, look: { writtenBy: "step 12" } },
  Flex: { function: { writtenBy: "step 2" }, look: "draws none" },
  Grid: { function: { writtenBy: "step 2" }, look: "draws none" },
  GridCol: { function: { writtenBy: "step 2" }, look: "draws none" },
  Group: { function: { writtenBy: "step 2" }, look: "draws none" },
  Modal: {
    function: { written: modalSpec, completedBy: "step 13" },
    look: { writtenBy: "step 13" },
  },
  SimpleGrid: { function: { writtenBy: "step 2" }, look: "draws none" },
  SolixProvider: {
    function: { written: solixProviderSpec, completedBy: "step 14" },
    look: "draws none",
  },
  Space: { function: { writtenBy: "step 2" }, look: "draws none" },
  Stack: { function: { writtenBy: "step 2" }, look: "draws none" },
  Tabs: { function: { written: tabsSpec, completedBy: "step 8" }, look: { writtenBy: "step 8" } },
  TabsList: { coveredBy: "Tabs" },
  TabsPanel: { coveredBy: "Tabs" },
  TabsTab: { coveredBy: "Tabs" },
  TextInput: {
    function: { written: textInputSpec, completedBy: "step 10" },
    look: { writtenBy: "step 10" },
  },
} as const satisfies Record<Section, Registered>;

const sections: Named<Registered> = Object.entries(registry);

export const functionSpecs: Named<FunctionSpec> = sections.flatMap(([section, registered]) =>
  registered.function !== undefined && registered.function.written !== undefined
    ? [[section, registered.function.written] as const]
    : [],
);

export const lookSpecs: Named<LookSpec> = sections.flatMap(([section, registered]) =>
  typeof registered.look === "object" && registered.look.written !== undefined
    ? [[section, registered.look.written] as const]
    : [],
);
