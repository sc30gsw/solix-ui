import type { JSX } from "@solidjs/web";
import fc from "fast-check";
import { tokenValues } from "../../../scripts/tokens";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import {
  baseKey,
  breakpoints,
  canonicalOf,
  type DisplayPropName,
  displayPropNames,
  responsiveKeys,
  stylePropClass,
  type StylePropName,
  stylePropNames,
  stylePropTable,
  visibilityClass,
  visibilityPropNames,
} from "../src/style-prop-table";
import type { ConsumerProps } from "./built-library";

export type ClassToken = { token: string; applied: boolean; writtenAs: string };
export type PartClassToken = ClassToken & { target: string };
export type Declaration = [property: string, value: string];
export type DrawnDeclaration = [property: string, value: string | null | undefined];
type Drawn = { value: string | number | null; kept: boolean };
type Declared = { written: unknown; keptKeys: string[] };

export const classProp = "the class prop";
export const consumerOverride = "7px";
export const elsewhere = "/elsewhere";

export const own = (suffix: string) => `${LIBRARY_CLASS_PREFIX}-${suffix}`;

export const consumerToken = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,8}$/)
  .filter((token) => !token.startsWith(LIBRARY_CLASS_PREFIX) && !token.startsWith("solix"));

const writtenAs = fc.constantFrom("string", "array item", "object key");

export const classTokens = fc.uniqueArray(
  fc.record({ token: consumerToken, applied: fc.boolean(), writtenAs }),
  { maxLength: 6, selector: ({ token }) => token },
);

export function classValueFrom(tokens: ClassToken[]): JSX.ClassValue {
  const written = (shape: string) => tokens.filter(({ writtenAs: as }) => as === shape);
  const asString = written("string")
    .filter(({ applied }) => applied)
    .map(({ token }) => token)
    .join(" ");
  const asArrayItems = written("array item").map(({ token, applied }) => applied && token);
  const asObject = Object.fromEntries(
    written("object key").map(({ token, applied }) => [token, applied]),
  );
  return [asString, asArrayItems, asObject];
}

export const stringAttributes = fc.record(
  {
    id: consumerToken,
    title: consumerToken,
    "aria-label": consumerToken,
    "data-state": consumerToken,
  },
  { requiredKeys: [] },
);

export function partClassTokens(parts: string[]): fc.Arbitrary<PartClassToken[]> {
  return fc.uniqueArray(
    fc.record({
      target: fc.constantFrom(...parts, classProp),
      token: consumerToken,
      applied: fc.boolean(),
      writtenAs,
    }),
    { maxLength: 12, selector: ({ token }) => token },
  );
}

export function classesPropsFrom(parts: string[], tokens: PartClassToken[]): ConsumerProps {
  const of = (target: string) => tokens.filter((token) => token.target === target);
  return {
    classes: Object.fromEntries(
      parts.filter((part) => of(part).length > 0).map((part) => [part, classValueFrom(of(part))]),
    ),
    class: classValueFrom(of(classProp)),
  };
}

const consumerValues = {
  color: fc.constantFrom("red", "blue", "green"),
  "margin-top": fc.integer({ min: 1, max: 9 }).map((pixels) => `${pixels}px`),
  "--consumer-gap": fc.integer({ min: 1, max: 9 }).map((pixels) => `${pixels}px`),
};

function declarationsOf<Value>(
  valueOf: (value: fc.Arbitrary<string>) => fc.Arbitrary<Value>,
): fc.Arbitrary<[string, Value][]> {
  return fc
    .tuple(
      ...Object.entries(consumerValues).map(([property, value]) =>
        fc.option(
          valueOf(value).map((written): [string, Value] => [property, written]),
          { nil: undefined },
        ),
      ),
    )
    .map((declarations) => declarations.filter((found) => found !== undefined));
}

export const declarationSetWithAbsentValues: fc.Arbitrary<DrawnDeclaration[]> = declarationsOf(
  (value) => fc.oneof(value, fc.constantFrom(undefined, null)),
);

export function presentDeclarations(declarations: DrawnDeclaration[]): Declaration[] {
  return declarations.flatMap(([property, value]): Declaration[] =>
    value === undefined || value === null ? [] : [[property, value]],
  );
}

export function declarationsByPart(
  parts: string[],
): fc.Arbitrary<Record<string, DrawnDeclaration[]>> {
  return fc
    .tuple(
      ...parts.map((part) =>
        fc.option(
          declarationSetWithAbsentValues.map((declarations): [string, DrawnDeclaration[]] => [
            part,
            declarations,
          ]),
          { nil: undefined },
        ),
      ),
    )
    .map((entries) => Object.fromEntries(entries.filter((entry) => entry !== undefined)));
}

export function styleWritten(declarations: DrawnDeclaration[], as: string): ConsumerProps {
  if (as === "absent") return {};
  return {
    style:
      as === "string"
        ? presentDeclarations(declarations)
            .map(([property, value]) => `${property}: ${value}`)
            .join("; ")
        : Object.fromEntries(declarations),
  };
}

const displayValue = fc.constantFrom("flex", "grid", "block", "none");

function drawnDisplayProp(name: DisplayPropName): fc.Arbitrary<[DisplayPropName, string, string]> {
  const visibility = visibilityPropNames.find((found) => found === name);
  if (visibility !== undefined) {
    return fc
      .constantFrom(...breakpoints)
      .map((breakpoint) => [name, breakpoint, visibilityClass(visibility, breakpoint)]);
  }
  const styleProp = stylePropNames.find((found) => found === name) ?? "display";
  return displayValue.map((value) => [
    name,
    value,
    stylePropClass(canonicalOf(styleProp), baseKey),
  ]);
}

export const displayPropCases = fc
  .subarray([...displayPropNames], { minLength: 1 })
  .chain((names) => fc.tuple(...names.map(drawnDisplayProp)))
  .map((drawn) => ({
    given: Object.fromEntries(drawn.map(([name, value]) => [name, value])),
    classes: drawn.map(([, , className]) => className),
  }));

const tokens = tokenValues();
const passedThrough = ["inherit", "initial", "unset", "revert", "3px"];
const consumerDeclarations: Declaration[] = [
  ["color", "red"],
  ["margin-top", "3px"],
  ["--consumer-gap", "2px"],
];

const scaleKeys = [
  ...new Set(Object.values(stylePropTable).flatMap((row) => ("scale" in row ? [row.scale] : []))),
].flatMap((scale) =>
  Object.keys(tokens)
    .filter((token) => token.startsWith(`--solix-${scale}-`))
    .map((token) => token.slice(`--solix-${scale}-`.length)),
);

const valueThatEndsADeclaration = fc
  .tuple(
    fc.constantFrom("", "1px", "red"),
    fc.constantFrom(";", "{", "}"),
    fc.constantFrom("", " color: blue", "--injected: 1", ".x{color:blue"),
  )
  .map((parts) => parts.join(""));

const drawnValue: fc.Arbitrary<Drawn> = fc.oneof(
  {
    arbitrary: fc
      .oneof(fc.constantFrom(...passedThrough, ...scaleKeys), fc.integer({ min: 0, max: 96 }))
      .map((value) => ({ value, kept: true })),
    weight: 3,
  },
  { arbitrary: fc.constant({ value: null, kept: false }), weight: 1 },
  { arbitrary: valueThatEndsADeclaration.map((value) => ({ value, kept: false })), weight: 1 },
);

const declaredStyleProp: fc.Arbitrary<Declared> = fc.oneof(
  drawnValue.map(({ value, kept }) => ({ written: value, keptKeys: kept ? [baseKey] : [] })),
  fc
    .record(Object.fromEntries(responsiveKeys.map((key) => [key, drawnValue])), {
      requiredKeys: [],
    })
    .map((byKey) => {
      const entries = Object.entries(byKey).flatMap(([key, drawn]): [string, Drawn][] =>
        drawn === undefined ? [] : [[key, drawn]],
      );
      return {
        written: Object.fromEntries(entries.map(([key, { value }]) => [key, value])),
        keptKeys: entries.flatMap(([key, { kept }]) => (kept ? [key] : [])),
      };
    }),
);

export const stylePropCases = fc
  .record({
    styleProps: fc
      .uniqueArray(fc.constantFrom(...stylePropNames), { maxLength: 8 })
      .chain((names) =>
        fc.tuple(
          ...names.map((name) =>
            declaredStyleProp.map((declared): [StylePropName, Declared] => [name, declared]),
          ),
        ),
      ),
    visibility: fc.record(
      {
        hiddenFrom: fc.option(fc.constantFrom(...breakpoints), { nil: null }),
        visibleFrom: fc.option(fc.constantFrom(...breakpoints), { nil: null }),
      },
      { requiredKeys: [] },
    ),
    classTokens,
    styleWrittenAs: fc.constantFrom("object", "string", "absent"),
    unstyled: fc.boolean(),
  })
  .chain((generated) =>
    fc
      .subarray([
        ...consumerDeclarations,
        ...generated.styleProps.map(([name]): Declaration => [`--${own(name)}`, consumerOverride]),
      ])
      .map((consumerStyle) => ({ ...generated, consumerStyle })),
  );

export type StylePropCase = typeof stylePropCases extends fc.Arbitrary<infer Case> ? Case : never;

export const boxCases = fc.record({
  generated: stylePropCases,
  component: fc.option(fc.constantFrom("div", "section", "article", "span", "a"), {
    nil: undefined,
  }),
});

export function stylePropPropsOf(generated: StylePropCase): ConsumerProps {
  const { styleProps, visibility, styleWrittenAs, consumerStyle, unstyled } = generated;
  const style =
    styleWrittenAs === "string"
      ? consumerStyle.map(([name, value]) => `${name}: ${value}`).join("; ")
      : Object.fromEntries(consumerStyle);
  return {
    ...Object.fromEntries(styleProps.map(([name, { written: value }]) => [name, value])),
    ...visibility,
    class: classValueFrom(generated.classTokens),
    ...(styleWrittenAs === "absent" ? {} : { style }),
    unstyled,
  };
}
