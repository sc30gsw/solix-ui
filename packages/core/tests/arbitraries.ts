import fc from "fast-check";
import { tokenValues } from "../../../scripts/tokens";
import { LIBRARY_CLASS_PREFIX } from "#/build-pipeline.mjs";
import {
  baseKey,
  breakpoints,
  canonicalOf,
  responsiveKeys,
  stylePropClass,
  type StylePropName,
  stylePropNames,
  stylePropTable,
} from "#/src/style-prop-table.ts";
import {
  classProp,
  type ConsumerStyle,
  type Declaration,
  type DeclaredStyleProp,
  type DrawnDeclaration,
  type PartClassToken,
  type StylePropCase,
} from "#/tests/consumer-props.ts";

type Drawn = { value: string | number | null; kept: boolean };

const consumerOverride = "7px";
const stylesOverride = "9px";

function customPropertyOf(name: StylePropName): string {
  return `--${stylePropClass(canonicalOf(name), baseKey)}`;
}

const consumerToken = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,8}$/)
  .filter((token) => !token.startsWith(LIBRARY_CLASS_PREFIX) && !token.startsWith("solix"));

const writtenAs = fc.constantFrom("string", "array item", "object key");

export const classTokens = fc.uniqueArray(
  fc.record({ token: consumerToken, applied: fc.boolean(), writtenAs }),
  { maxLength: 6, selector: ({ token }) => token },
);

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

const valueOfAConsumerDeclaration = {
  color: fc.constantFrom("red", "blue", "green"),
  "margin-top": fc.integer({ min: 1, max: 9 }).map((pixels) => `${pixels}px`),
  "--consumer-gap": fc.integer({ min: 1, max: 9 }).map((pixels) => `${pixels}px`),
};

function consumerDeclarations(absentValues: boolean): fc.Arbitrary<DrawnDeclaration[]> {
  return fc
    .tuple(
      ...Object.entries(valueOfAConsumerDeclaration).map(([property, value]) =>
        fc.option(
          (absentValues ? fc.oneof(value, fc.constantFrom(undefined, null)) : value).map(
            (written): DrawnDeclaration => [property, written],
          ),
          { nil: undefined },
        ),
      ),
    )
    .map((declarations) => declarations.filter((found) => found !== undefined));
}

export function declarationsByPart(
  parts: string[],
): fc.Arbitrary<Record<string, DrawnDeclaration[]>> {
  return fc
    .tuple(
      ...parts.map((part) =>
        fc.option(
          consumerDeclarations(true).map((declarations): [string, DrawnDeclaration[]] => [
            part,
            declarations,
          ]),
          { nil: undefined },
        ),
      ),
    )
    .map((entries) => Object.fromEntries(entries.filter((entry) => entry !== undefined)));
}

export const consumerStyles: fc.Arbitrary<ConsumerStyle> = fc.option(
  fc.oneof(
    consumerDeclarations(true).map((declarations) => ({
      declarations,
      writtenAs: "object" as const,
    })),
    consumerDeclarations(false).map((declarations) => ({
      declarations,
      writtenAs: "string" as const,
    })),
  ),
  { nil: undefined },
);

const tokens = tokenValues();
const passedThrough = ["inherit", "initial", "unset", "revert", "3px"];

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

const declaredStyleProp: fc.Arbitrary<DeclaredStyleProp> = fc.oneof(
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

export const stylePropCases: fc.Arbitrary<StylePropCase> = fc
  .record({
    styleProps: fc
      .uniqueArray(fc.constantFrom(...stylePropNames), { maxLength: 8 })
      .chain((names) =>
        fc.tuple(
          ...names.map((name) =>
            declaredStyleProp.map((declared): [StylePropName, DeclaredStyleProp] => [
              name,
              declared,
            ]),
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
    consumerStyle: consumerStyles,
    unstyled: fc.boolean(),
  })
  .chain((generated) =>
    fc
      .record({
        overrides: fc.subarray(
          generated.styleProps.map(([name]): Declaration => [
            customPropertyOf(name),
            consumerOverride,
          ]),
        ),
        stylesRoot: fc
          .tuple(
            consumerDeclarations(true),
            fc
              .subarray(generated.styleProps.map(([name]) => customPropertyOf(name)))
              .chain((properties) =>
                fc.tuple(
                  ...properties.map((property) =>
                    fc
                      .constantFrom(stylesOverride, undefined, null)
                      .map((written): DrawnDeclaration => [property, written]),
                  ),
                ),
              ),
          )
          .map(([declarations, overrides]) => [...declarations, ...overrides]),
      })
      .map(({ overrides, stylesRoot }) => ({
        ...generated,
        consumerStyle: generated.consumerStyle && {
          ...generated.consumerStyle,
          declarations: [...generated.consumerStyle.declarations, ...overrides],
        },
        stylesRoot,
      })),
  );

export const elementsToRender = fc.option(
  fc.constantFrom("div", "section", "article", "span", "a"),
  { nil: undefined },
);
