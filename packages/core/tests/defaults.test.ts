import { expectTypeOf, test } from "vite-plus/test";
import type { ControlledProps, Defaults, defaultsOf, withDefaults } from "#/src/parts.ts";

type Props = ControlledProps<string | null> & { loop?: boolean; label?: string };
type Indexed = ControlledProps<string | null> & { [key: string]: unknown; loop?: boolean };

declare const ofProps: ReturnType<typeof defaultsOf<Props>>;
declare const ofIndexed: ReturnType<typeof defaultsOf<Indexed>>;
type Taken<D extends object> = Parameters<typeof ofProps<D>>[0];
type TakenBesideAnIndexSignature<D extends object> = Parameters<typeof ofIndexed<D>>[0];
type Made<D extends object> = ReturnType<typeof ofProps<D>>;
type TakenAsDefaults<Given> = typeof withDefaults extends (defaults: Given, props: Props) => unknown
  ? true
  : false;

test("defaultsOf refuses a default for value and defaultValue, even in a props type with an index signature", () => {
  expectTypeOf<{ value: "inbox" }>().not.toExtend<Taken<{ value: "inbox" }>>();
  expectTypeOf<{ defaultValue: "inbox" }>().not.toExtend<Taken<{ defaultValue: "inbox" }>>();
  expectTypeOf<{ value: "inbox" }>().not.toExtend<
    TakenBesideAnIndexSignature<{ value: "inbox" }>
  >();
  expectTypeOf<{ defaultValue: "inbox" }>().not.toExtend<
    TakenBesideAnIndexSignature<{ defaultValue: "inbox" }>
  >();
});

test("defaultsOf refuses a key that is not a prop, a literal the prop's type does not take, a widened value, and onChange, since no literal is a function", () => {
  expectTypeOf<{ size: "md" }>().not.toExtend<Taken<{ size: "md" }>>();
  expectTypeOf<{ loop: "yes" }>().not.toExtend<Taken<{ loop: "yes" }>>();
  expectTypeOf<{ label: string }>().not.toExtend<Taken<{ label: string }>>();
  expectTypeOf<{ onChange: () => void }>().not.toExtend<Taken<{ onChange: () => void }>>();
});

test("defaultsOf takes one literal for a prop, beside an index signature too", () => {
  expectTypeOf<{ loop: true; label: "Mail" }>().toExtend<Taken<{ loop: true; label: "Mail" }>>();
  expectTypeOf<{ loop: true }>().toExtend<TakenBesideAnIndexSignature<{ loop: true }>>();
});

test("withDefaults takes only defaults that defaultsOf made: not an object literal, a plain object or a Defaults whose type widens a value, and no value can be read from a Defaults", () => {
  expectTypeOf<TakenAsDefaults<Made<{ loop: true; label: "Mail" }>>>().toEqualTypeOf<true>();
  expectTypeOf<TakenAsDefaults<{ readonly loop: true }>>().toEqualTypeOf<false>();
  expectTypeOf<TakenAsDefaults<{ loop: boolean }>>().toEqualTypeOf<false>();
  expectTypeOf<TakenAsDefaults<Partial<Props>>>().toEqualTypeOf<false>();
  expectTypeOf<TakenAsDefaults<Defaults<Props, Partial<Props>>>>().toEqualTypeOf<false>();
  expectTypeOf<TakenAsDefaults<Defaults<Props, { loop: boolean }>>>().toEqualTypeOf<false>();
  expectTypeOf<Made<{ loop: true }>>().not.toHaveProperty("loop");
});
