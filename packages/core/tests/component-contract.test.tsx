import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { JSX } from "@solidjs/web";
import fc from "fast-check";
import { expect, expectTypeOf, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import type * as Library from "../src/index";
import type { PolymorphicProps } from "../src/parts";
import {
  breakpoints,
  canonicalOf,
  canonicalStylePropNames,
  type DisplayPropName,
  displayPropNames,
  responsiveKeys,
  stylePropClass,
  visibilityClass,
  visibilityPropNames,
} from "../src/style-prop-table";
import {
  classTokens,
  declarationsByPart,
  consumerStyles,
  elementsToRender,
  partClassTokens,
  stringAttributes,
  stylePropCases,
} from "./arbitraries";
import {
  builtComponents,
  compiledClassesOf,
  library,
  rootPart,
  stableClass,
  stylesheet,
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
import { components, fixtures, polymorphicComponents, render, type TakesDisplay } from "./fixtures";
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
const styleOverride = new RegExp(`^--${LIBRARY_CLASS_PREFIX}-`);
const registeredCustomProperties = new Set(
  [...stylesheet.matchAll(/@property\s+(--[\w-]+)/g)].map(([, property]) => property),
);
const compiled: Record<string, Record<string, string[]>> = Object.fromEntries(
  builtComponents.map((name) => [name, compiledClassesOf(name)]),
);

type TestStyles = { root: object };

const stylePropClasses = new Set([
  ...canonicalStylePropNames.flatMap((name) =>
    responsiveKeys.map((key) => stylePropClass(name, key)),
  ),
  ...visibilityPropNames.flatMap((name) =>
    breakpoints.map((breakpoint) => visibilityClass(name, breakpoint)),
  ),
]);

function partsOf(name: string): string[] {
  return Object.keys(compiled[name]);
}

function partsOn(name: string, element: Element): string[] {
  const classes = classesOf(element);
  return partsOf(name).filter((part) => classes.includes(stableClass(name, part)));
}

function expectCompiledClassesFirst(name: string, part: string, element: Element): void {
  const own = compiled[name][part];
  expect(
    classesOf(element).slice(0, own.length + 1),
    `the ${part} part of ${name} starts with exactly the classes of its compiled styles, then its stable class`,
  ).toEqual([...own, stableClass(name, part)]);
}

test("every component the library exports is held to the root contract", () => {
  const exportedComponents = Object.entries(library)
    .filter(([, exported]) => typeof exported === "function")
    .map(([name]) => name);

  expect(exportedComponents.sort()).toEqual(Object.keys(fixtures).sort());
  expect(builtComponents).toEqual(Object.keys(fixtures).sort());
});

test.each(components)(
  "%s starts its root with exactly the classes of its compiled root styles and then its own stable root class, its only one, and puts every class and attribute a consumer passes on it",
  (name, component) => {
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
        expectCompiledClassesFirst(name, rootPart, root);
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
  "%s renders, under its fixture, the root and every other key of its built styles object, each on one element that starts with exactly that key's compiled classes and then its stable class, the root first",
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
    for (const element of elements) {
      for (const part of partsOn(name, element)) expectCompiledClassesFirst(name, part, element);
    }
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
      if (part !== undefined && compiled[name][part].includes(found)) return [0];
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
  "%s puts the declarations styles names for a part in exactly that part's style, beside the custom property of each of its own variables, leaves out an undefined or null one, and puts the consumer's style after styles.root, where an undefined or null one replaces nothing",
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
            const ownVariables = classesOf(element)
              .filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`))
              .filter((found) => !stylePropClasses.has(found))
              .map((found) => `--${found}`);
            expect(valuesOf(element, "style").length).toBeLessThanOrEqual(1);
            expect(
              Object.fromEntries(
                declarationsIn(valuesOf(element, "style")[0]).filter(
                  ([property]) => !ownVariables.includes(property),
                ),
              ),
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
  "%s with unstyled drops every class of its compiled styles from every part, and keeps every stable part class and every consumer class",
  (name) => {
    const parts = partsOf(name);
    const everyCompiledClass = Object.values(compiled[name]).flat();
    const marked = elementsOf(render(name)).flatMap((element) => partsOn(name, element));
    fc.assert(
      fc.property(partClassTokens(parts), (tokens) => {
        const html = render(name, { ...classesPropsFrom(parts, tokens), unstyled: true });
        const elements = elementsOf(html);

        expect(
          elements.flatMap((element) =>
            classesOf(element)
              .filter((found) => everyCompiledClass.includes(found))
              .map((found) => `${found} on <${element.tag}>`),
          ),
          "no class of the compiled styles",
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
  const stylesRootGave = presentDeclarations(
    Object.entries(Object.fromEntries(generated.stylesRoot)),
  );
  const writtenByTheConsumer = [...consumerNames, ...stylesRootGave.map(([property]) => property)];
  const keptPairs = new Set(
    styleProps.flatMap(([prop, { keptKeys }]) =>
      keptKeys.map((key) => `${canonicalOf(prop)} at ${key}`),
    ),
  );
  const visibilityGiven = Object.values(visibility).filter(
    (breakpoint) => breakpoint !== null && breakpoint !== undefined,
  ).length;
  const libraryClasses = classes.filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`));
  const styleClasses = libraryClasses.filter((found) => stylePropClasses.has(found));
  const readByAClass = styleClasses.filter((found) => declared.has(`--${found}`));

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
    styleClasses.length - readByAClass.length,
    "one class and no custom property for each of hiddenFrom and visibleFrom given",
  ).toBe(visibilityGiven);
  expect(
    libraryClasses.filter((found) => !stylePropClasses.has(found) && !declared.has(`--${found}`)),
    "each class of the component's own variables reads its custom property",
  ).toEqual([]);
  expect(
    [...declared.keys()].filter(
      (property) =>
        !writtenByTheConsumer.includes(property) && !libraryClasses.includes(property.slice(2)),
    ),
    "a style prop writes only the custom property its own class reads",
  ).toEqual([]);
  expect(
    consumerGave.filter(([property, value]) => declared.get(property) !== value),
    "the consumer's style keeps every declaration it sets, a --sx- one included",
  ).toEqual([]);
  expect(
    stylesRootGave.filter(
      ([property, value]) => !consumerNames.includes(property) && declared.get(property) !== value,
    ),
    "styles.root keeps every declaration it sets that the consumer's style does not replace, a --sx- one included",
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
type PartsOf<Props extends { classes?: object }> = keyof NonNullable<Props["classes"]>;

function RefusesDisplay(props: { label: string } & Partial<Record<DisplayPropName, never>>) {
  return <section>{props.label}</section>;
}

function TakesTone(props: { tone: "calm" | "loud" }) {
  return <section>{props.tone}</section>;
}

test("Disclosure's classes take summary, a key of its stylex.create block, and not label", () => {
  expectTypeOf<"summary">().toExtend<PartsOf<DisclosureProps>>();
  expectTypeOf<"label">().not.toExtend<PartsOf<DisclosureProps>>();
});

test("PolymorphicProps takes the attributes of the element component names and the props of the component it names, refuses every style prop that component declares never, and refuses a prop neither declares, such as nonsense", () => {
  expectTypeOf<"href">().toExtend<keyof PolymorphicProps<"a", TestStyles>>();
  expectTypeOf<"href">().not.toExtend<keyof PolymorphicProps<"div", TestStyles>>();
  expectTypeOf<"tone">().toExtend<keyof PolymorphicProps<typeof TakesTone, TestStyles>>();
  expectTypeOf<"nonsense">().not.toExtend<keyof PolymorphicProps<typeof TakesTone, TestStyles>>();
  expectTypeOf<
    TakesDisplay<PolymorphicProps<typeof TakesTone, TestStyles>>
  >().toEqualTypeOf<true>();
  expectTypeOf<
    TakesDisplay<PolymorphicProps<typeof RefusesDisplay, TestStyles>>
  >().toEqualTypeOf<false>();
});

test.each(polymorphicComponents)(
  "%s renders the element its component prop names, with that element's attributes",
  (name) => {
    const root = rootElementOf(render(name, { component: "a", href: elsewhere }));

    expect(root.tag).toBe("a");
    expect(valuesOf(root, "href")).toEqual([elsewhere]);
    expect(classesOf(root)).toContain(stableClass(name, rootPart));
  },
);

function Card(props: JSX.HTMLAttributes<HTMLElement>) {
  return <section {...props} />;
}

test.each(polymorphicComponents)(
  "%s resolves every style prop, display ones included, for a function component its component prop names, which gets the sx- classes and custom properties and no display or hiddenFrom attribute",
  (name) => {
    const root = rootElementOf(
      render(name, { component: Card, display: "flex", hiddenFrom: "sm", p: 4 }),
    );

    expect(root.tag).toBe("section");
    expect(
      classesOf(root)
        .filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`))
        .sort(),
    ).toEqual(["sx-display", "sx-hidden-from-sm", "sx-p"]);
    expect(Object.fromEntries(declarationsIn(valuesOf(root, "style")[0]))).toEqual({
      "--sx-display": "flex",
      "--sx-p": "0.25rem",
    });
    expect(
      root.attributes.filter(([attribute]) =>
        ["display", "hiddenfrom"].includes(attribute.toLowerCase()),
      ),
    ).toEqual([]);
  },
);

test("Box passes unstyled to the Button its component prop names, so the Button carries none of its compiled classes, and starts with them without it", () => {
  const rootOf = (props: Record<string, unknown>) =>
    rootElementOf(render("Box", { component: library.Button, ...props }));
  const buttonClasses = compiled.Button[rootPart];

  expectCompiledClassesFirst("Button", rootPart, rootOf({}));
  expect(
    classesOf(rootOf({ unstyled: true })).filter((found) => buttonClasses.includes(found)),
  ).toEqual([]);
});

test("every --sx- declaration the generator draws for a consumer's style or styles.root is a custom property that a style-prop class reads, aliases included", () => {
  fc.assert(
    fc.property(stylePropCases, (generated) => {
      const drawn = [...(generated.consumerStyle?.declarations ?? []), ...generated.stylesRoot]
        .map(([property]) => property)
        .filter((property) => styleOverride.test(property));

      expect(drawn.filter((property) => !registeredCustomProperties.has(property))).toEqual([]);
    }),
    { numRuns: generatedRuns },
  );
});

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
