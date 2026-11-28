import { expectTypeOf, test } from "vite-plus/test";
import type { spec as button } from "#/spec/Button.ts";
import type {
  About,
  Fixture,
  FunctionSpec,
  FunctionStatus,
  LookFixture,
  LookSpec,
  LookStatus,
  Missing,
} from "#/spec/format.ts";

type ButtonAbout = About<(typeof button)["reference"]>;
type ButtonProp = keyof NonNullable<Fixture<"Button">["props"]>;

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

test("an entry is about a prop, part or variable its reference lists", () => {
  expectTypeOf<"prop variant">().toExtend<ButtonAbout>();
  expectTypeOf<"prop varient">().not.toExtend<ButtonAbout>();
  expectTypeOf<"part inenr">().not.toExtend<ButtonAbout>();
  expectTypeOf<"variable --button-bgg">().not.toExtend<ButtonAbout>();
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
