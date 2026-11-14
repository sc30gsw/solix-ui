import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ValidComponent } from "@solidjs/web";
import fc from "fast-check";
import { expect, expectTypeOf, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import type * as Library from "../src/index";
import { canonicalOf, type DisplayPropName, displayPropNames } from "../src/style-prop-table";
import {
  classTokens,
  declarationsByPart,
  consumerStyles,
  displayPropCases,
  elementsToRender,
  partClassTokens,
  stringAttributes,
  stylePropCases,
} from "./arbitraries";
import {
  builtComponents,
  dist,
  handledKeys,
  library,
  partsOf,
  rootPart,
  stableClass,
  styleXClasses,
} from "./built-library";
import {
  classesPropsFrom,
  classProp,
  classValueFrom,
  declaredBy,
  elsewhere,
  type PartClassToken,
  presentDeclarations,
  type StylePropCase,
  stylePropPropsOf,
  styleWritten,
} from "./consumer-props";
import { components, fixtures, polymorphicComponents, render } from "./fixtures";
import {
  classesOf,
  declarationsIn,
  type Element,
  elementsOf,
  rootElementOf,
  valuesOf,
} from "./markup";

const generatedRuns = 300;
const repositoryRoot = join(import.meta.dirname, "../../..");
const contractSkill = ".agents/skills/verify-component-contract/SKILL.md";
const consumedProps = handledKeys.filter((key) => key !== "class" && key !== "style");

type Refuses<Props, Key extends PropertyKey> = Key extends keyof Props
  ? [NonNullable<Props[Key]>] extends [never]
    ? true
    : false
  : false;

function partsOn(name: string, element: Element): string[] {
  const classes = classesOf(element);
  return partsOf(name).filter((part) => classes.includes(stableClass(name, part)));
}

function emitsStyleXClass(component: string): boolean {
  return [...readFileSync(join(dist, `${component}.jsx`), "utf8").matchAll(/[\w-]+/g)].some(
    ([word]) => styleXClasses.has(word),
  );
}

test("every component the library exports is held to the root contract", () => {
  const exportedComponents = Object.entries(library)
    .filter(([, exported]) => typeof exported === "function")
    .map(([name]) => name);

  expect(exportedComponents.sort()).toEqual(Object.keys(fixtures).sort());
  expect(builtComponents).toEqual(Object.keys(fixtures).sort());
});

test.each(components)(
  "%s puts every class and attribute a consumer passes on its root, next to its own classes, and its own stable root class and no other",
  (name, component) => {
    const hasDefaultStyles = emitsStyleXClass(name);
    const rootClasses = builtComponents.map((other) => stableClass(other, rootPart));
    fc.assert(
      fc.property(classTokens, stringAttributes, fc.boolean(), (tokens, attributes, flag) => {
        const root = rootElementOf(
          render(name, {
            class: classValueFrom(tokens),
            ...attributes,
            [component.booleanAttribute]: flag,
          }),
        );
        const classes = classesOf(root);

        expect(root.tag).toBe(component.tag);
        expect(valuesOf(root, "class")).toHaveLength(1);
        expect(
          classes.filter((found) => rootClasses.includes(found)),
          "the root carries one stable root class, its own",
        ).toEqual([stableClass(name, rootPart)]);
        expect(
          classes.some((found) => found.startsWith(LIBRARY_CLASS_PREFIX)),
          `the built ${name} ${hasDefaultStyles ? "emits" : "emits no"} StyleX class, so its root carries ${hasDefaultStyles ? "one" : "none"} of the library's style classes`,
        ).toBe(hasDefaultStyles);
        for (const { token, applied } of tokens) {
          expect(classes.includes(token), `class "${token}"`).toBe(applied);
        }
        for (const [attribute, value] of Object.entries(attributes)) {
          expect(valuesOf(root, attribute), attribute).toEqual([value]);
        }
        expect(valuesOf(root, component.booleanAttribute)).toEqual(flag ? [true] : []);
      }),
      { numRuns: generatedRuns },
    );
  },
);

test.each(builtComponents)(
  "%s renders, under its fixture, the root and every other key of its built styles object, each with its stable class on one element, the root first",
  (name) => {
    const parts = partsOf(name);
    const elements = elementsOf(render(name));
    const rendered = elements.flatMap((element) => partsOn(name, element));

    expect(partsOn(name, elements[0]), "the first element is the root").toEqual([rootPart]);
    expect(
      elements.filter((element) => partsOn(name, element).length > 1),
      "an element carries one part",
    ).toEqual([]);
    expect(
      [...rendered].sort(),
      `each key of the built styles object of ${name} is on one element of the markup its fixture renders`,
    ).toEqual([...parts].sort());
  },
);

function expectClassesOnTheirParts(name: string, html: string, tokens: PartClassToken[]): void {
  const given = tokens.map(({ token }) => token);
  for (const element of elementsOf(html)) {
    const [part] = partsOn(name, element);
    const where = part === undefined ? `<${element.tag}>, which is no part` : `the ${part} part`;
    const ownTokens = tokens.filter(({ target }) => target === part).map(({ token }) => token);
    const classTokensOnRoot = tokens
      .filter(({ target }) => part === rootPart && target === classProp)
      .map(({ token }) => token);
    const wanted = tokens.filter(
      ({ token, applied }) =>
        applied && (ownTokens.includes(token) || classTokensOnRoot.includes(token)),
    );
    const classes = classesOf(element);
    const rank = (found: string): number[] => {
      if (styleXClasses.has(found)) return [0];
      if (part !== undefined && found === stableClass(name, part)) return [1];
      if (ownTokens.includes(found)) return [2];
      return classTokensOnRoot.includes(found) ? [3] : [];
    };
    const ranks = classes.flatMap(rank);

    expect(
      classes.filter((found) => given.includes(found)).sort(),
      `the consumer's classes on ${where}`,
    ).toEqual(wanted.map(({ token }) => token).sort());
    expect(
      ranks,
      `on ${where}, the library's classes come first, then the stable class, then classes.${part}, and on the root the class prop last`,
    ).toEqual([...ranks].sort((before, after) => before - after));
  }
}

test.each(builtComponents)(
  "%s puts a class that classes names for a part on exactly that part's element, after the library's classes and the stable class, and the class prop after classes.root",
  (name) => {
    const parts = partsOf(name);
    fc.assert(
      fc.property(partClassTokens(parts), (tokens) => {
        expectClassesOnTheirParts(name, render(name, classesPropsFrom(parts, tokens)), tokens);
      }),
      { numRuns: generatedRuns },
    );
  },
);

test.each(builtComponents)(
  "%s puts the declarations styles names for a part in exactly that part's style, leaves out an undefined or null one, and puts the consumer's style after styles.root, where an undefined or null one replaces nothing",
  (name) => {
    fc.assert(
      fc.property(
        declarationsByPart(partsOf(name)),
        consumerStyles,
        fc.boolean(),
        (byPart, consumerStyle, unstyled) => {
          const html = render(name, {
            styles: Object.fromEntries(
              Object.entries(byPart).map(([part, declarations]) => [
                part,
                Object.fromEntries(declarations),
              ]),
            ),
            ...styleWritten(consumerStyle),
            unstyled,
          });

          for (const element of elementsOf(html)) {
            const [part] = partsOn(name, element);
            const wanted = [
              ...presentDeclarations((part === undefined ? undefined : byPart[part]) ?? []),
              ...(part === rootPart ? declaredBy(consumerStyle) : []),
            ];
            expect(valuesOf(element, "style").length).toBeLessThanOrEqual(1);
            expect(
              Object.fromEntries(declarationsIn(valuesOf(element, "style")[0])),
              part === undefined
                ? `<${element.tag}>, which is no part, has no style`
                : `the ${part} part's style holds styles.${part} without its undefined and null values${part === rootPart ? ", and then the consumer's style without its undefined and null values, which wins" : ""}`,
            ).toEqual(Object.fromEntries(wanted));
          }
        },
      ),
      { numRuns: generatedRuns },
    );
  },
);

test.each(builtComponents)(
  "%s with unstyled drops every class the stylesheet defines outside the style-props layer, from every part, and keeps every stable part class and every consumer class",
  (name) => {
    const parts = partsOf(name);
    const marked = elementsOf(render(name)).flatMap((element) => partsOn(name, element));
    fc.assert(
      fc.property(partClassTokens(parts), (tokens) => {
        const html = render(name, { ...classesPropsFrom(parts, tokens), unstyled: true });
        const elements = elementsOf(html);

        expect(
          elements.flatMap((element) =>
            classesOf(element)
              .filter((found) => styleXClasses.has(found))
              .map((found) => `${found} on <${element.tag}>`),
          ),
          "no library style class",
        ).toEqual([]);
        expect(
          elements.flatMap((element) => partsOn(name, element)),
          "every stable part class, on the same elements in the same order",
        ).toEqual(marked);
        expectClassesOnTheirParts(name, html, tokens);
      }),
      { numRuns: generatedRuns },
    );
  },
);

function takenBy(takesDisplay: boolean, generated: StylePropCase): StylePropCase {
  if (takesDisplay) return generated;
  return {
    ...generated,
    styleProps: generated.styleProps.filter(
      ([prop]) => !displayPropNames.some((display) => display === prop),
    ),
    visibility: {},
  };
}

function expectStylePropsOnRoot(name: string, root: Element, generated: StylePropCase): void {
  const { styleProps, visibility, classTokens: tokensOfClass } = generated;
  const classes = classesOf(root);
  const styleText = String(valuesOf(root, "style")[0] ?? "");
  const declared = new Map(declarationsIn(valuesOf(root, "style")[0]));
  const consumerGave = declaredBy(generated.consumerStyle);
  const consumerNames = consumerGave.map(([property]) => property);
  const keptPairs = new Set(
    styleProps.flatMap(([prop, { keptKeys }]) =>
      keptKeys.map((key) => `${canonicalOf(prop)} at ${key}`),
    ),
  );
  const visibilityGiven = Object.values(visibility).filter(
    (breakpoint) => breakpoint !== null && breakpoint !== undefined,
  ).length;
  const libraryClasses = classes.filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`));
  const readByAClass = libraryClasses.filter((found) => declared.has(`--${found}`));

  expect(valuesOf(root, "class")).toHaveLength(1);
  expect(classes).toContain(stableClass(name, rootPart));
  for (const { token, applied } of tokensOfClass) {
    expect(classes.includes(token), `class "${token}"`).toBe(applied);
  }
  expect(valuesOf(root, "style").length).toBeLessThanOrEqual(1);
  expect(styleText, "no value that holds a brace reaches style").not.toMatch(/[{}]/);
  expect(
    readByAClass.length,
    "one class and one custom property for each kept value of a style prop at a breakpoint, and none for null or a value that holds ;, { or }",
  ).toBe(keptPairs.size);
  expect(
    libraryClasses.length - readByAClass.length,
    "one class and no custom property for each of hiddenFrom and visibleFrom given",
  ).toBe(visibilityGiven);
  expect(
    [...declared.keys()].filter(
      (property) =>
        !consumerNames.includes(property) && !libraryClasses.includes(property.slice(2)),
    ),
    "a style prop writes only the custom property its own class reads",
  ).toEqual([]);
  expect(
    consumerGave.filter(([property, value]) => declared.get(property) !== value),
    "the consumer's style keeps every declaration it sets, a --sx- one included",
  ).toEqual([]);
  expect(
    root.attributes.filter(([attribute]) =>
      consumedProps.some((consumed) => consumed.toLowerCase() === attribute.toLowerCase()),
    ),
    `${name}'s consumed props never reach the element as attributes`,
  ).toEqual([]);
}

test.each(components)(
  "%s gives every kept style-prop value it takes one class and the one custom property that class reads, drops null and every value that holds ;, { or }, keeps the consumer's class and style on top, renders the element component names, and renders the same markup twice",
  (name, { tag, takesDisplay, polymorphic }) => {
    fc.assert(
      fc.property(
        stylePropCases,
        polymorphic ? elementsToRender : fc.constant(undefined),
        (generated, component) => {
          const props = {
            ...stylePropPropsOf(generated),
            ...(component === undefined ? {} : { component }),
          };
          const html = render(name, props);
          const root = rootElementOf(html);

          expect(render(name, props), "a second render gives the same markup").toBe(html);
          expect(root.tag).toBe(component ?? tag);
          expectStylePropsOnRoot(name, root, takenBy(takesDisplay, generated));
        },
      ),
      { numRuns: generatedRuns },
    );
  },
);

type DisclosureProps = Parameters<typeof Library.Disclosure>[0];
type BoxPropsFor<T extends ValidComponent> = Parameters<typeof Library.Box<T>>[0];
type ButtonPropsFor<T extends ValidComponent> = Parameters<typeof Library.Button<T>>[0];
type PartsOf<Props extends { classes?: object }> = keyof NonNullable<Props["classes"]>;

test("Disclosure's classes take summary, a key of its stylex.create block, and not label", () => {
  expectTypeOf<"summary">().toExtend<PartsOf<DisclosureProps>>();
  expectTypeOf<"label">().not.toExtend<PartsOf<DisclosureProps>>();
});

test.each(polymorphicComponents)(
  "%s takes the attributes of the element its component prop names, and renders that element",
  (name) => {
    expectTypeOf<"href">().toExtend<keyof BoxPropsFor<"a">>();
    expectTypeOf<"href">().not.toExtend<keyof BoxPropsFor<"div">>();
    expectTypeOf<"href">().toExtend<keyof ButtonPropsFor<"a">>();
    expectTypeOf<"href">().not.toExtend<keyof ButtonPropsFor<"button">>();

    const root = rootElementOf(render(name, { component: "a", href: elsewhere }));

    expect(root.tag).toBe("a");
    expect(valuesOf(root, "href")).toEqual([elsewhere]);
    expect(classesOf(root)).toContain(stableClass(name, rootPart));
  },
);

test("a polymorphic component wrapping Modal refuses every display prop Modal refuses, and wrapping Button or Box takes only that component's props", () => {
  expectTypeOf<
    Refuses<Library.BoxProps<typeof Library.Modal>, DisplayPropName>
  >().toEqualTypeOf<true>();
  expectTypeOf<
    Refuses<Library.ButtonProps<typeof Library.Modal>, DisplayPropName>
  >().toEqualTypeOf<true>();
  expectTypeOf<
    Refuses<Library.BoxProps<typeof Library.Box>, DisplayPropName>
  >().toEqualTypeOf<false>();
  expectTypeOf<"nonsense">().not.toExtend<keyof Library.BoxProps<typeof Library.Button>>();
  expectTypeOf<"nonsense">().not.toExtend<keyof Library.ButtonProps<typeof Library.Box>>();
  expectTypeOf<"type">().toExtend<keyof Library.BoxProps<typeof Library.Button>>();
});

test.each(polymorphicComponents)(
  "%s passes display, hiddenFrom and visibleFrom to a component its component prop names unresolved, so Modal leaves them off its <dialog> and Box resolves them once",
  (name) => {
    fc.assert(
      fc.property(displayPropCases, ({ given, classes }) => {
        const dialog = rootElementOf(
          render(name, { ...fixtures.Modal.props, component: library.Modal, ...given }),
        );
        const box = rootElementOf(render(name, { component: library.Box, ...given }));
        const styleProps = (element: Element) =>
          classesOf(element).filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`));

        expect(dialog.tag).toBe("dialog");
        expect(styleProps(dialog), "no style-prop class on the dialog").toEqual([]);
        expect(declarationsIn(valuesOf(dialog, "style")[0]), "no custom property").toEqual([]);
        expect(
          dialog.attributes.filter(([attribute]) =>
            displayPropNames.some((display) => display.toLowerCase() === attribute.toLowerCase()),
          ),
          "no display prop as an attribute",
        ).toEqual([]);
        expect(styleProps(box).sort(), "the wrapped Box resolves each one, once").toEqual(
          [...classes].sort(),
        );
      }),
      { numRuns: generatedRuns },
    );
  },
);

test("the contract skill has a row for each component that names its root tag and boolean attribute as fixtures does", () => {
  const rows = readFileSync(join(repositoryRoot, contractSkill), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("|"));
  const violations = components.flatMap(([name, { tag, booleanAttribute }]) => {
    const file = `packages/core/src/${name}.tsx`;
    const row = rows.find((line) => line.includes(`\`${file}\`: \`${name}\``));
    if (!row) return [`${contractSkill}: add a covered-code row for \`${file}\`: \`${name}\`.`];
    return [`<${tag}>`, `\`${booleanAttribute}\``]
      .filter((fact) => !row.includes(fact))
      .map((fact) => `${contractSkill}: say ${fact} in the row for \`${file}\`, as fixtures does.`);
  });

  expect(violations).toEqual([]);
});
