import { expectTypeOf, test } from "vite-plus/test";
import type { buttonSpec } from "#/spec/Button.ts";
import type {
  About,
  Fixture,
  FunctionSpec,
  FunctionStatus,
  LookFixture,
  LookSpec,
  LookStatus,
  Missing,
  Rendered,
} from "#/spec/format.ts";
import type { behaviourGapItems, GapItem, Section } from "#/spec/gaps.ts";
import type { Registered, registry, Slot } from "#/spec/registry.ts";
import type { SharedPromise, SharedSuite } from "#/spec/shared.ts";

type ButtonReference = (typeof buttonSpec)["reference"];
type ButtonAbout = About<ButtonReference>;
type ButtonProp = keyof NonNullable<Fixture<"Button">["props"]>;
type NoVariables = { props: []; parts: []; variables: []; exports: [] };

test("a status that holds carries no gap item, and a pending one names a gap item that exists", () => {
  expectTypeOf<"holds">().toExtend<FunctionStatus>();
  expectTypeOf<{ until: "Button 3"; fails: "data-variant: expected" }>().toExtend<FunctionStatus>();
  expectTypeOf<{ holds: true; until: "Button 3" }>().not.toExtend<FunctionStatus>();
  expectTypeOf<{
    until: "Button 99";
    fails: "data-variant: expected";
  }>().not.toExtend<FunctionStatus>();
});

test("a function entry's pin is a labelled assertion or a missing export, part or attribute", () => {
  expectTypeOf<{ until: "Button 3"; fails: { part: "inner" } }>().toExtend<FunctionStatus>();
  expectTypeOf<{ until: "Button 3"; fails: "" }>().not.toExtend<FunctionStatus>();
  expectTypeOf<{ until: "Button 3"; fails: "expected null" }>().not.toExtend<FunctionStatus>();
  expectTypeOf<{ until: "Button 3"; fails: "differs" }>().not.toExtend<FunctionStatus>();
});

test('a look entry\'s pin is "differs" or a missing export, part or attribute, never an assertion', () => {
  expectTypeOf<{ until: "Button 22"; fails: "differs" }>().toExtend<LookStatus>();
  expectTypeOf<{ until: "Button 22"; fails: "color: expected" }>().not.toExtend<LookStatus>();
});

test("a missing pin names one of an export, a part or an attribute", () => {
  expectTypeOf<{ export: "Button.Group" }>().toExtend<Missing>();
  expectTypeOf<{ of: "TabsTab"; part: "tabSection" }>().toExtend<Missing>();
  expectTypeOf<{ export: "Button.Group"; part: "inner" }>().not.toExtend<Missing>();
  expectTypeOf<{
    attribute: "data-variant";
    value: "white";
    part: "root";
  }>().not.toExtend<Missing>();
});

test("an entry is about a prop, part, variable or export its reference lists, or a shared promise", () => {
  expectTypeOf<"prop variant">().toExtend<ButtonAbout>();
  expectTypeOf<"export Button.Group">().toExtend<ButtonAbout>();
  expectTypeOf<"shared mod">().toExtend<ButtonAbout>();
  expectTypeOf<"prop varient">().not.toExtend<ButtonAbout>();
  expectTypeOf<"part inenr">().not.toExtend<ButtonAbout>();
  expectTypeOf<"variable --button-bgg">().not.toExtend<ButtonAbout>();
  expectTypeOf<"export Button.Groop">().not.toExtend<ButtonAbout>();
  expectTypeOf<"shared mood">().not.toExtend<ButtonAbout>();
  expectTypeOf<"behaviour">().not.toExtend<ButtonAbout>();
});

test("an entry cannot act as a user, so a sequence of actions is a model's to specify", () => {
  expectTypeOf<Rendered>().not.toHaveProperty("user");
});

test("a shared suite states the status of every shared promise its reference takes", () => {
  type Statuses = SharedSuite<ButtonReference>["statuses"];
  expectTypeOf<Record<SharedPromise, "holds">>().toExtend<Statuses>();
  expectTypeOf<Omit<Record<SharedPromise, "holds">, "mod">>().not.toExtend<Statuses>();
  expectTypeOf<"vars">().not.toExtend<keyof SharedSuite<NoVariables>["statuses"]>();
  expectTypeOf<"static varsResolver">().not.toExtend<keyof SharedSuite<NoVariables>["statuses"]>();
});

test("a behaviour gap item is never a parity gap item an entry can wait on", () => {
  expectTypeOf<Extract<keyof typeof behaviourGapItems, GapItem>>().toBeNever();
});

test("a fixture's props are the built component's own, and a prop the build does not take goes in unbuilt", () => {
  expectTypeOf<"variant">().toExtend<ButtonProp>();
  expectTypeOf<"varient">().not.toExtend<ButtonProp>();
  expectTypeOf<{ component: "Button"; props: { variant: "filled" } }>().toExtend<Fixture>();
  expectTypeOf<{ component: "Button"; props: { variant: "white" } }>().not.toExtend<Fixture>();
  expectTypeOf<{ component: "Button"; unbuilt: { variant: "white" } }>().toExtend<Fixture>();
  expectTypeOf<{
    component: "Button";
    props: { variant: "filled" };
    unbuilt: { loading: true };
  }>().not.toExtend<Fixture>();
});

test("a look fixture's provider takes no colour-scheme prop, which only the entry's scheme sets", () => {
  expectTypeOf<{
    component: "Button";
    provider: { props: { theme: {} } };
  }>().toExtend<LookFixture>();
  expectTypeOf<{
    component: "Button";
    provider: { props: { forceColorScheme: "dark" } };
  }>().not.toExtend<LookFixture>();
  expectTypeOf<{
    component: "Button";
    provider: { unbuilt: { defaultColorScheme: "dark" } };
  }>().not.toExtend<LookFixture>();
  expectTypeOf<{
    component: "Button";
    provider: { props: { defaultColorScheme: "dark" } };
  }>().toExtend<Fixture>();
});

test("a look spec is not a function spec", () => {
  expectTypeOf<LookSpec>().not.toExtend<FunctionSpec>();
});

test("a registry slot is written, or waits on the gap item that writes it, never both", () => {
  expectTypeOf<{ written: FunctionSpec; completedBy: "step 8" }>().toExtend<Slot<FunctionSpec>>();
  expectTypeOf<{ writtenBy: "step 1" }>().toExtend<Slot<FunctionSpec>>();
  expectTypeOf<{ written: FunctionSpec; writtenBy: "step 1" }>().not.toExtend<Slot<FunctionSpec>>();
  expectTypeOf<{ written: LookSpec }>().not.toExtend<Slot<FunctionSpec>>();
});

test("a section has its documents or the section whose spec covers it, never both", () => {
  expectTypeOf<{ coveredBy: "Tabs" }>().toExtend<Registered>();
  expectTypeOf<{
    function: { writtenBy: "step 1" };
    look: "draws none";
    coveredBy: "Tabs";
  }>().not.toExtend<Registered>();
});

test("the registry has a row for every section", () => {
  expectTypeOf<typeof registry>().toExtend<Record<Section, Registered>>();
  expectTypeOf<Omit<typeof registry, "foundations">>().not.toExtend<Record<Section, Registered>>();
});
