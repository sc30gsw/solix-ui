import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString, type ValidComponent } from "@solidjs/web";
import fc from "fast-check";
import postcss from "postcss";
import ts from "typescript";
import { expect, expectTypeOf, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX, STYLE_PROP_LAYER } from "../build-pipeline.mjs";
import type * as Library from "../src/index";
import {
  canonicalOf,
  type DisplayPropName,
  displayPropNames,
  stylePropNames,
  visibilityPropNames,
} from "../src/style-prop-table";
import {
  boxCases,
  classesPropsFrom,
  classProp,
  classTokens,
  classValueFrom,
  declarationsByPart,
  declarationSetWithAbsentValues,
  displayPropCases,
  elsewhere,
  type PartClassToken,
  partClassTokens,
  presentDeclarations,
  stringAttributes,
  type StylePropCase,
  stylePropCases,
  stylePropPropsOf,
  styleWritten,
} from "./arbitraries";
import { builtComponents } from "./built-components";
import { type ConsumerProps, library, partPropKeys, renderBuilt, rootPart } from "./built-library";
import { fixtures, polymorphicComponents } from "./fixtures";
import {
  classesOf,
  declarationsIn,
  type Element,
  elementsOf,
  partsOn,
  rootElementOf,
  valuesOf,
} from "./markup";

const dist = join(import.meta.dirname, "../dist");
const generatedRuns = 300;
const repositoryRoot = join(import.meta.dirname, "../../..");
const contractSkill = ".agents/skills/verify-component-contract/SKILL.md";
const stableRootClass = /^solix-[A-Za-z0-9]+-root$/;

type Refuses<Props, Key extends PropertyKey> = Key extends keyof Props
  ? [NonNullable<Props[Key]>] extends [never]
    ? true
    : false
  : false;

const components = Object.entries(fixtures);

function render(name: string, props: ConsumerProps): string {
  return renderBuilt(name, { ...fixtures[name as keyof typeof fixtures].props, ...props });
}

function inStylePropLayer(node: postcss.Node): boolean {
  const parent = node.parent;
  if (!(parent instanceof postcss.AtRule)) return false;
  return (
    (parent.name === "layer" && parent.params === STYLE_PROP_LAYER) || inStylePropLayer(parent)
  );
}

function styleXClassesInTheStylesheet(): Set<string> {
  const found = new Set<string>();
  postcss.parse(readFileSync(join(dist, "styles.css"), "utf8")).walkRules((rule) => {
    if (inStylePropLayer(rule)) return;
    for (const [, name] of rule.selector.matchAll(/\.([\w-]+)/g)) found.add(name);
  });
  return found;
}

const styleXClasses = styleXClassesInTheStylesheet();

function emitsStyleXClass(component: string): boolean {
  return [...readFileSync(join(dist, `${component}.jsx`), "utf8").matchAll(/[\w-]+/g)].some(
    ([word]) => styleXClasses.has(word),
  );
}

function partsOf(component: string): string[] {
  return elementsOf(renderBuilt(component, {})).flatMap((element) => partsOn(component, element));
}

const partsByComponent = new Map(builtComponents.map((name) => [name, partsOf(name)]));

function partsOfBuilt(component: string): string[] {
  return partsByComponent.get(component) ?? [];
}

function styledPartsInTheBuild(component: string): string[] {
  const file = join(dist, `${component}.jsx`);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  return source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) =>
      statement.declarationList.declarations.flatMap((declaration) =>
        declaration.name.getText() === "styles" &&
        declaration.initializer !== undefined &&
        ts.isObjectLiteralExpression(declaration.initializer)
          ? declaration.initializer.properties.flatMap((property) =>
              property.name && ts.isIdentifier(property.name) ? [property.name.text] : [],
            )
          : [],
      ),
    );
}

function isPartProp(attribute: string): boolean {
  return partPropKeys.some((key) => key.toLowerCase() === attribute.toLowerCase());
}

function partPropsOn(html: string): string[] {
  return elementsOf(html).flatMap(({ tag, attributes }) =>
    attributes.filter(([name]) => isPartProp(name)).map(([name]) => `<${tag}> ${name}`),
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
    fc.assert(
      fc.property(classTokens, stringAttributes, fc.boolean(), (tokens, attributes, flag) => {
        const html = render(name, {
          class: classValueFrom(tokens),
          ...attributes,
          [component.booleanAttribute]: flag,
        });
        const root = rootElementOf(html);
        const classes = classesOf(root);

        expect(root.tag).toBe(component.tag);
        expect(valuesOf(root, "class")).toHaveLength(1);
        expect(
          classes.filter((found) => stableRootClass.test(found)),
          "the root carries one stable root class, its own",
        ).toEqual([`solix-${name}-${rootPart}`]);
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
  "%s marks the root and each part its built styles object names with one stable class on one element, the root first",
  (name) => {
    const elements = elementsOf(renderBuilt(name, {}));
    const parts = partsOfBuilt(name);

    expect(partsOn(name, elements[0]), "the first element is the root").toEqual([rootPart]);
    expect(
      elements.filter((element) => partsOn(name, element).length > 1),
      "an element carries one part",
    ).toEqual([]);
    expect(parts, "a part names one element").toEqual([...new Set(parts)]);
    expect(
      [...parts].sort(),
      `every part the built styles object of ${name} styles, and the root, is rendered with its stable class`,
    ).toEqual([...new Set([rootPart, ...styledPartsInTheBuild(name)])].sort());
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
      if (found === `solix-${name}-${part}`) return [1];
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
  expect(partPropsOn(html), "classes, styles and unstyled reach no element").toEqual([]);
}

test.each(builtComponents)(
  "%s puts a class that classes names for a part on exactly that part's element, after the library's classes and the stable class, and the class prop after classes.root",
  (name) => {
    const parts = partsOfBuilt(name);
    fc.assert(
      fc.property(partClassTokens(parts), (tokens) => {
        const html = renderBuilt(name, classesPropsFrom(parts, tokens));

        expect(partsOf(name)).toEqual(parts);
        expectClassesOnTheirParts(name, html, tokens);
      }),
      { numRuns: generatedRuns },
    );
  },
);

test.each(builtComponents)(
  "%s puts the declarations styles names for a part in exactly that part's style, leaves out an undefined or null one, and puts the consumer's style after styles.root",
  (name) => {
    const parts = partsOfBuilt(name);
    fc.assert(
      fc.property(
        declarationsByPart(parts),
        declarationSetWithAbsentValues,
        fc.constantFrom("object", "string", "absent"),
        fc.boolean(),
        (byPart, consumerStyle, styleAs, unstyled) => {
          const html = renderBuilt(name, {
            styles: Object.fromEntries(
              Object.entries(byPart).map(([part, declarations]) => [
                part,
                Object.fromEntries(declarations),
              ]),
            ),
            ...styleWritten(consumerStyle, styleAs),
            unstyled,
          });
          const consumerGave = styleAs === "absent" ? [] : presentDeclarations(consumerStyle);

          for (const element of elementsOf(html)) {
            const [part] = partsOn(name, element);
            const wanted = [
              ...presentDeclarations((part === undefined ? undefined : byPart[part]) ?? []),
              ...(part === rootPart ? consumerGave : []),
            ];
            expect(valuesOf(element, "style").length).toBeLessThanOrEqual(1);
            expect(
              Object.fromEntries(declarationsIn(valuesOf(element, "style")[0])),
              part === undefined
                ? `<${element.tag}>, which is no part, has no style`
                : `the ${part} part's style holds styles.${part} without its undefined and null values${part === rootPart ? ", and then the consumer's style without its undefined and null values, which wins" : ""}`,
            ).toEqual(Object.fromEntries(wanted));
          }
          expect(partPropsOn(html), "classes, styles and unstyled reach no element").toEqual([]);
        },
      ),
      { numRuns: generatedRuns },
    );
  },
);

test.each(builtComponents)(
  "%s with unstyled drops every class the stylesheet defines outside the style-props layer, from every part, and keeps every stable part class and every consumer class",
  (name) => {
    const parts = partsOfBuilt(name);
    fc.assert(
      fc.property(partClassTokens(parts), (tokens) => {
        const html = renderBuilt(name, { ...classesPropsFrom(parts, tokens), unstyled: true });
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
        ).toEqual(parts);
        expectClassesOnTheirParts(name, html, tokens);
      }),
      { numRuns: generatedRuns },
    );
  },
);

const ownProps = [...stylePropNames, ...visibilityPropNames, "component", ...partPropKeys];

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
  const { styleProps, visibility, classTokens: tokensOfClass, styleWrittenAs } = generated;
  const classes = classesOf(root);
  const styleText = String(valuesOf(root, "style")[0] ?? "");
  const declared = new Map(declarationsIn(valuesOf(root, "style")[0]));
  const consumerGave = styleWrittenAs === "absent" ? [] : generated.consumerStyle;
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
  expect(classes).toContain(`solix-${name}-${rootPart}`);
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
      ownProps.some((ownProp) => ownProp.toLowerCase() === attribute.toLowerCase()),
    ),
    `${name}'s own props never reach the element as attributes`,
  ).toEqual([]);
}

test("Box gives every kept style-prop value one class and the one custom property that class reads, drops null and every value that holds ;, { or }, and keeps the consumer's class and style on top", () => {
  fc.assert(
    fc.property(boxCases, ({ generated, component }) => {
      const props = {
        ...stylePropPropsOf(generated),
        ...(component === undefined ? {} : { component }),
        ...(component === "a" ? { href: elsewhere } : {}),
      };
      const html = render("Box", props);
      const root = rootElementOf(html);

      expect(render("Box", props), "a second render gives the same markup").toBe(html);
      expect(root.tag).toBe(component ?? "div");
      expectStylePropsOnRoot("Box", root, generated);
      expect(valuesOf(root, "href")).toEqual(component === "a" ? [elsewhere] : []);
    }),
    { numRuns: generatedRuns },
  );
});

test.each(components)(
  "%s takes every style prop, hiddenFrom and visibleFrom on its root that its type takes, with unstyled or without, and keeps the consumer's class and style on top",
  (name, { takesDisplay }) => {
    fc.assert(
      fc.property(stylePropCases, (generated) => {
        const props = stylePropPropsOf(generated);
        const html = renderBuilt(name, props);

        expect(renderBuilt(name, props), "a second render gives the same markup").toBe(html);
        expectStylePropsOnRoot(name, rootElementOf(html), takenBy(takesDisplay, generated));
      }),
      { numRuns: generatedRuns },
    );
  },
);

type DisclosureProps = Parameters<typeof Library.Disclosure>[0];
type ButtonPropsFor<T extends ValidComponent> = Parameters<typeof Library.Button<T>>[0];
type PartsOf<Props extends { classes?: object }> = keyof NonNullable<Props["classes"]>;

test("Disclosure's classes take summary, a key of its stylex.create block, and not label", () => {
  expectTypeOf<"summary">().toExtend<PartsOf<DisclosureProps>>();
  expectTypeOf<"label">().not.toExtend<PartsOf<DisclosureProps>>();
});

test("Button takes the attributes of the element its component prop names, and renders that element", () => {
  expectTypeOf<"href">().toExtend<keyof ButtonPropsFor<"a">>();
  expectTypeOf<"href">().not.toExtend<keyof ButtonPropsFor<"button">>();

  const html = renderToString(() => (
    <library.Button component="a" href={elsewhere}>
      Link
    </library.Button>
  ));

  expect(rootElementOf(html).tag).toBe("a");
  expect(rootElementOf(html).attributes).toContainEqual(["href", elsewhere]);
  expect(classesOf(rootElementOf(html))).toContain(`solix-Button-${rootPart}`);
});

test("a polymorphic component wrapping Modal refuses the display props Modal refuses, and wrapping Button takes only Button's props", () => {
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

test("the contract skill names each component's root tag and boolean attribute as fixtures does", () => {
  const rows = readFileSync(join(repositoryRoot, contractSkill), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("|"));
  const violations = components.flatMap(([name, { tag, booleanAttribute }]) => {
    const file = `packages/core/src/${name}.tsx`;
    const row = rows.find((line) => line.includes(`\`${file}\``));
    if (!row) return [`${contractSkill}: add a covered-code row for \`${file}\`.`];
    return [`<${tag}>`, `\`${booleanAttribute}\``]
      .filter((fact) => !row.includes(fact))
      .map((fact) => `${contractSkill}: say ${fact} in the row for \`${file}\`, as fixtures does.`);
  });

  expect(violations).toEqual([]);
});
