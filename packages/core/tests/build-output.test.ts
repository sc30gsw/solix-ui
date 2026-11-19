import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import {
  BEHAVIOUR_SDK_LAYER,
  behaviourSdkHiddenRule,
  HIDDEN_LAYER,
  LIBRARY_CASCADE_LAYER,
  LIBRARY_CLASS_PREFIX,
  LIBRARY_CLASS_PREFIXES,
  sdkHiddenRuleSource,
  STYLE_PROP_LAYER,
} from "#/build-pipeline.mjs";
import {
  colorLayer,
  colorSchemeLayer,
  componentLayer,
  containerQueryLayer,
  layerOrder,
  libraryLayerOrder,
  libraryLayers,
} from "#/src/layers.ts";
import { paletteToken, primaryName, shades } from "#/src/color-table.ts";
import { builtComponents, builtSource, dist } from "#/tests/built-library.ts";
import { schemeValues, tokenKind, tokenValues } from "../../../scripts/tokens";
import { layersAroundDeclaration, nestedLayerOrder } from "#/tests/cascade-layers.ts";
import { rulesThatStyleThePage } from "#/tests/page-rules.ts";

import {
  stylesheet,
  realHiddenRule,
  libraryPartCondition,
  ownerColorSchemes,
  ownerAttribute,
  whereSchemeIs,
  stylePropClass,
  ownerSchemeHiding,
  ownerDefaultScheme,
  pageRoot,
  type PlacedRule,
  libraryLayer,
  placedRules,
  depthAfterEachCharacter,
  sdkSelectors,
  sdkWhoseHiddenWriterIs,
  colorSchemeLayerRules,
} from "#/tests/built-stylesheet.ts";

test("the stylesheet first orders the behaviour SDK's layer before the library's, then holds the rule the SDK writes at run time to keep a hidden part hidden, read from the SDK's package and narrowed to an element with a class that starts with the stable class prefix, and then every other rule inside the one library cascade layer", () => {
  const [selector, ...others] = sdkSelectors();
  const narrowed = realHiddenRule.replace(selector, `${selector}${libraryPartCondition}`);
  const order = `@layer ${BEHAVIOUR_SDK_LAYER}, ${LIBRARY_CASCADE_LAYER};\n${narrowed}\n`;
  const layer = stylesheet.slice(order.length);

  expect(others).toEqual([]);
  expect(stylesheet.startsWith(order)).toBe(true);
  expect(layer.startsWith(`@layer ${LIBRARY_CASCADE_LAYER} {`)).toBe(true);

  const depths = depthAfterEachCharacter(layer);
  const firstBrace = layer.indexOf("{");
  const positionsBackAtTopLevel = depths
    .map((depth, position) => (position >= firstBrace && depth === 0 ? position : -1))
    .filter((position) => position !== -1);

  expect(positionsBackAtTopLevel).toEqual([layer.length - 1]);
});

test("every class name carries one of the library's own prefixes", () => {
  const classNames = stylesheet.match(/\.[A-Za-z_][\w-]*/g) ?? [];

  const stylexDefaultPrefix = "x";

  expect(LIBRARY_CLASS_PREFIXES).toContain(LIBRARY_CLASS_PREFIX);
  expect(LIBRARY_CLASS_PREFIXES.filter((prefix) => prefix.startsWith(stylexDefaultPrefix))).toEqual(
    [],
  );
  expect(classNames.length).toBeGreaterThan(0);
  expect(
    classNames.filter(
      (name) => !LIBRARY_CLASS_PREFIXES.some((prefix) => name.startsWith(`.${prefix}`)),
    ),
  ).toEqual([]);
});

test("every declaration marked important sits in the SDK's layer and none in the library's layer, so no rule in `solix` can outrank a consumer", () => {
  const outsideTheSdkLayer: string[] = [];
  postcss.parse(stylesheet).walkDecls((declaration) => {
    const layers = layersAroundDeclaration(declaration);
    if (declaration.important && layers.at(-1) !== BEHAVIOUR_SDK_LAYER) {
      outsideTheSdkLayer.push(
        `${layers.toReversed().join(" > ") || "no layer"}: ${declaration.toString()}`,
      );
    }
  });

  expect(outsideTheSdkLayer).toEqual([]);
});

test("no selector of the stylesheet names an element type in its subject, and one that requires no class belongs to a rule that declares only custom properties and color-scheme, so the library sets nothing else on a page's own <html> and <body>", () => {
  expect(rulesThatStyleThePage(postcss.parse(stylesheet))).toEqual([]);
});

test.each([
  [
    "a rule built by concatenation",
    'const at = ":where([hidden])"; writeStyle(doc, "id", "@layer ui-sdk { " + at + " { display: none !important } }");',
  ],
  [
    "a rule built from a template with a substitution",
    'const at = ":where([hidden])"; writeStyle(doc, "id", `@layer ui-sdk { ${at} { display: none !important } }`);',
  ],
  [
    "two writes",
    'writeStyle(doc, "a", "@layer ui-sdk { a { display: none !important } }"); writeStyle(doc, "b", "@layer ui-sdk { b { display: none !important } }");',
  ],
  [
    "two rules in one layer",
    'writeStyle(doc, "id", "@layer ui-sdk { a { display: none !important } b { display: none !important } }");',
  ],
  [
    "a second declaration",
    'writeStyle(doc, "id", "@layer ui-sdk { :where([data-part][hidden]) { display: none !important; content-visibility: hidden !important } }");',
  ],
  [
    "a declaration that is not important",
    'writeStyle(doc, "id", "@layer ui-sdk { :where([hidden]) { display: none } }");',
  ],
  [
    "another layer",
    'writeStyle(doc, "id", "@layer other { :where([hidden]) { display: none !important } }");',
  ],
  ["no layer", 'writeStyle(doc, "id", ":where([hidden]) { display: none !important }");'],
  [
    "an unclosed layer",
    'writeStyle(doc, "id", "@layer ui-sdk { :where([hidden]) { display: none !important }");',
  ],
  ["nothing", "return doc;"],
])("the build refuses the SDK's hidden rule when its writer holds %s", (_, body) => {
  expect(() => behaviourSdkHiddenRule(sdkWhoseHiddenWriterIs(body))).toThrow(
    `${sdkHiddenRuleSource.writer} writes`,
  );
});

test("the build takes the SDK's hidden rule when its writer holds one closed layer block of one rule that declares only display none important, whatever its selector", () => {
  const rule = `@layer ${BEHAVIOUR_SDK_LAYER} { :where([data-part][hidden]) { display: none !important } }`;

  expect(
    behaviourSdkHiddenRule(
      sdkWhoseHiddenWriterIs(`writeStyle(doc, "id", ${JSON.stringify(rule)});`),
    ),
  ).toBe(rule);
  expect(realHiddenRule.startsWith(`@layer ${BEHAVIOUR_SDK_LAYER} {`)).toBe(true);
});

test("a token keeps its public custom property name", () => {
  expect(stylesheet).toContain("--solix-color-text:");
  expect(readFileSync(join(dist, "tokens.stylex.js"), "utf8")).toContain("var(--solix-color-text)");
});

test("open state compiles to a selector on the element's own open attribute", () => {
  expect(stylesheet).toMatch(new RegExp(`\\.${LIBRARY_CLASS_PREFIX}\\w+\\[open\\]\\{`));
  expect(stylesheet).not.toMatch(/\[open\] \*/);
});

test.each(builtComponents)(
  "%s ships as JSX source with its styles compiled to class names",
  (name) => {
    expect(
      builtSource(name),
      `packages/core/dist/${name}.jsx: compile stylex.create away in the build`,
    ).not.toContain("stylex.create");
  },
);

test("input validity and the modal backdrop compile to the platform's own selectors", () => {
  expect(stylesheet).toMatch(new RegExp(`\\.${LIBRARY_CLASS_PREFIX}\\w+:user-invalid\\{`));
  expect(stylesheet).toMatch(new RegExp(`\\.${LIBRARY_CLASS_PREFIX}\\w+::backdrop\\{`));
});

test("the library layer ranks its colours, then its components, then its style props, then the colour-scheme rules, then the container queries a component writes at run time, and the hidden layer last", () => {
  expect(libraryLayers).toEqual([
    colorLayer,
    componentLayer,
    STYLE_PROP_LAYER,
    colorSchemeLayer,
    containerQueryLayer,
    HIDDEN_LAYER,
  ]);
  expect(nestedLayerOrder(libraryLayer())).toEqual([...libraryLayers]);
});

test("the hidden layer holds one rule, display none on a hidden element with a class that starts with the stable class prefix, unless it is hidden until found", () => {
  const rules: string[] = [];
  libraryLayer().walkAtRules("layer", (layer) => {
    if (layer.params !== HIDDEN_LAYER) return;
    layer.walkRules((rule) => {
      rules.push(`${rule.selector}{${rule.nodes.map((node) => node.toString()).join(";")}}`);
    });
  });

  expect(rules).toEqual([
    `[hidden]${libraryPartCondition}:not([hidden="until-found"]){display:none}`,
  ]);
});

test("each value of data-color-scheme sets color-scheme on its element, both schemes for auto so the operating system chooses, once, in the colour-scheme layer and outside any media query", () => {
  const { inside, outside } = colorSchemeLayerRules();
  const colorSchemeOf = ({ declarations }: PlacedRule) =>
    declarations.filter((declaration) => declaration.startsWith("color-scheme:"));
  const written = inside
    .filter((rule) => colorSchemeOf(rule).length > 0)
    .map((rule) => ({ selector: rule.selector, media: rule.media, set: colorSchemeOf(rule) }));

  expect(written).toEqual(
    ownerColorSchemes.map(([scheme, colorScheme]) => ({
      selector: whereSchemeIs(scheme),
      media: undefined,
      set: [`color-scheme:${colorScheme}`],
    })),
  );
  expect(outside.filter((rule) => colorSchemeOf(rule).length > 0)).toEqual([]);
});

test("the colour-scheme layer holds every rule that names data-color-scheme, beside the defaults on :root and the classes of lightHidden and darkHidden, and no other layer holds one but the rule that points the primary's tokens at the primary palette in each scheme", () => {
  const { inside, outside } = colorSchemeLayerRules();
  const others = [pageRoot, ...ownerSchemeHiding.map(([className]) => `.${className}`)];
  const primaryTokens = shades.map((shade) => paletteToken(primaryName, shade));
  const setsOnlyThePrimary = ({ declarations }: PlacedRule) =>
    declarations.every((declaration) =>
      primaryTokens.some((token) => declaration.startsWith(`${token}:`)),
    );

  expect(inside.length).toBeGreaterThan(0);
  expect(
    inside.filter(
      ({ selector }) => !selector.includes(ownerAttribute) && !others.includes(selector),
    ),
  ).toEqual([]);
  expect(
    outside.filter((rule) => rule.selector.includes(ownerAttribute) && !setsOnlyThePrimary(rule)),
  ).toEqual([]);
});

test("no light-dark() reaches the stylesheet: each colour token's default is its light value, and an element whose data-color-scheme is light or dark, or auto under each prefers-color-scheme, sets every colour token to that scheme's value, in the colour-scheme layer", () => {
  const tokens = tokenValues();
  const colours = Object.keys(tokens).filter((name) => tokenKind(name) === "colour");
  const valuesOf = (scheme: "light" | "dark") =>
    colours.map((name) => `${name}:${schemeValues(tokens[name])?.[scheme]}`);
  const placed = placedRules();
  const tokenDeclarations = (rule: PlacedRule) =>
    rule.declarations.filter((declaration) =>
      colours.some((name) => declaration.startsWith(`${name}:`)),
    );
  const rootDefaults = placed.filter((rule) => rule.selector.split(/,\s*/).includes(":root"));
  const perScheme = placed
    .filter(
      (rule) =>
        rule.selector.startsWith(`[${ownerAttribute}`) && tokenDeclarations(rule).length > 0,
    )
    .map((rule) => ({
      selector: rule.selector,
      media: rule.media,
      inColorSchemeLayer: rule.inColorSchemeLayer,
      declarations: tokenDeclarations(rule),
    }));

  expect(colours.length).toBeGreaterThan(0);
  expect(stylesheet.toLowerCase()).not.toContain("light-dark(");
  expect(rootDefaults.flatMap(tokenDeclarations)).toEqual(valuesOf("light"));
  expect(perScheme).toEqual(
    (["light", "dark"] as const).flatMap((scheme) => [
      {
        selector: whereSchemeIs(scheme),
        media: undefined,
        inColorSchemeLayer: true,
        declarations: valuesOf(scheme),
      },
      {
        selector: whereSchemeIs("auto"),
        media: `(prefers-color-scheme: ${scheme})`,
        inColorSchemeLayer: true,
        declarations: valuesOf(scheme),
      },
    ]),
  );
});

test("lightHidden and darkHidden each read one inherited custom property with the style props' prefix in the colour-scheme layer, which ranks after every style prop: none where the scheme hides the element, set by :root for the light scheme, by data-color-scheme for its own, and by auto under each prefers-color-scheme, and elsewhere a value that leaves the display to the layers before", () => {
  const { inside } = colorSchemeLayerRules();
  const hidingIn = (scheme: string) =>
    ownerSchemeHiding.map(
      ([, hiddenIn, property]) => `${property}:${hiddenIn === scheme ? "none" : "initial"}`,
    );
  const hidingOf = ({ declarations }: PlacedRule) =>
    declarations.filter((declaration) =>
      ownerSchemeHiding.some(([, , property]) => declaration.startsWith(`${property}:`)),
    );
  const set = inside
    .filter((rule) => hidingOf(rule).length > 0)
    .map((rule) => ({ selector: rule.selector, media: rule.media, hiding: hidingOf(rule) }));
  const read = inside
    .filter(({ selector }) => selector.startsWith(stylePropClass))
    .map(({ selector, media, declarations }) => ({ selector, media, declarations }));

  expect(set).toEqual([
    { selector: pageRoot, media: undefined, hiding: hidingIn(ownerDefaultScheme) },
    ...(["light", "dark"] as const).flatMap((scheme) => [
      { selector: whereSchemeIs(scheme), media: undefined, hiding: hidingIn(scheme) },
      {
        selector: whereSchemeIs("auto"),
        media: `(prefers-color-scheme: ${scheme})`,
        hiding: hidingIn(scheme),
      },
    ]),
  ]);
  expect(read).toEqual(
    ownerSchemeHiding.map(([className, , property]) => ({
      selector: `.${className}`,
      media: undefined,
      declarations: [`display:var(${property},revert-layer)`],
    })),
  );
  expect(libraryLayers.indexOf(colorSchemeLayer)).toBeGreaterThan(
    libraryLayers.indexOf(STYLE_PROP_LAYER),
  );
});

test("the stylesheet first ranks the SDK's layer before the library's, and the library layer first names its sub-layers in the order it ranks them, the hidden layer last: the two statements a component's run-time rules start with. StyleX's layers sit in the first sub-layer", () => {
  const statement = (node: postcss.ChildNode | undefined) =>
    node?.type === "atrule" ? `@layer ${node.params};` : node?.toString();
  const [opening] = postcss.parse(stylesheet).nodes;
  const [first] = libraryLayer().nodes ?? [];
  let components: postcss.AtRule | undefined;
  libraryLayer().each((node) => {
    if (node.type === "atrule" && node.name === "layer" && node.params === componentLayer) {
      components = node;
    }
  });

  expect(statement(first)).toBe(libraryLayerOrder);
  expect(layerOrder).toBe(
    `${statement(opening)}@layer ${LIBRARY_CASCADE_LAYER}{${statement(first)}}`,
  );
  expect(components && nestedLayerOrder(components).length).toBeGreaterThan(0);
});
