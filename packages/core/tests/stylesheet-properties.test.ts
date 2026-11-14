import { join } from "node:path";
import fc from "fast-check";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import {
  compileLibrarySource,
  LIBRARY_CASCADE_LAYER,
  LIBRARY_CLASS_PREFIX,
  libraryStylesheet,
} from "../build-pipeline.mjs";

const packageRoot = join(import.meta.dirname, "..");
const generatedRuns = 300;

const valuesByProperty: Record<string, (string | number)[]> = {
  backgroundColor: ["red", "rgb(34, 139, 230)", "transparent"],
  borderColor: ["rgb(206, 212, 218)", "red"],
  borderRadius: ["0.25rem", "50%"],
  borderStyle: ["solid", "none"],
  borderWidth: [0, "1px"],
  color: ["black", "white"],
  cursor: ["pointer", "not-allowed"],
  display: ["flex", "grid", "none"],
  height: ["2.25rem", "100%"],
  marginTop: ["4px", "auto"],
  maxWidth: ["32rem", "min(32rem, calc(100vw - 2rem))"],
  opacity: [0, 0.5, 1],
  overflow: ["hidden", "auto"],
  overscrollBehavior: ["contain", "auto"],
  paddingInline: ["1rem", 0],
  "[disclosureState.summaryBackground]": ["red", "transparent"],
  "[disclosureState.summaryColor]": ["black", "white"],
};

const plainConditions = [
  ":hover",
  ":focus-visible",
  ":user-invalid",
  ":disabled",
  ":active",
  "[data-expanded]",
  "[open]",
  "[data-disabled]",
  '[data-state="open"]',
  "@media (min-width: 600px)",
  "@media (prefers-reduced-motion: reduce)",
  "@supports (display: grid)",
].map((condition) => JSON.stringify(condition));

const relationalConditions = [
  '[stylex.when.ancestor("[data-expanded]")]',
  '[stylex.when.ancestor(":hover")]',
  '[stylex.when.siblingBefore(":focus")]',
  '[stylex.when.descendant(":focus")]',
];

type StyleValue = string | number | { default: string | number; branches: [string, StyleValue][] };

function withoutRepeatedConditions(value: StyleValue): StyleValue {
  if (typeof value !== "object") return value;
  return {
    default: value.default,
    branches: value.branches.map(([condition, branch]): [string, StyleValue] => {
      if (typeof branch !== "object") return [condition, branch];
      const inner = branch.branches.filter(([innerCondition]) => innerCondition !== condition);
      return [
        condition,
        inner.length > 0 ? { default: branch.default, branches: inner } : branch.default,
      ];
    }),
  };
}

function valueFor(property: string): fc.Arbitrary<StyleValue> {
  const leaf = fc.constantFrom(...valuesByProperty[property]);
  const nested = fc.record({
    default: leaf,
    branches: fc.uniqueArray(fc.tuple(fc.constantFrom(...plainConditions), leaf), {
      minLength: 1,
      maxLength: 2,
      selector: ([condition]) => condition,
    }),
  });
  const conditional = fc.record({
    default: leaf,
    branches: fc.uniqueArray(
      fc.tuple(
        fc.constantFrom(...plainConditions, ...relationalConditions),
        fc.oneof(leaf, nested),
      ),
      { minLength: 1, maxLength: 3, selector: ([condition]) => condition },
    ),
  });
  return fc.oneof(leaf, conditional.map(withoutRepeatedConditions));
}

const namespace = fc
  .uniqueArray(fc.constantFrom(...Object.keys(valuesByProperty)), { minLength: 1, maxLength: 4 })
  .chain((properties) =>
    fc.tuple(...properties.map((property) => fc.tuple(fc.constant(property), valueFor(property)))),
  );

const backdropDeclarations = fc
  .uniqueArray(fc.constantFrom(...Object.keys(valuesByProperty)), { maxLength: 3 })
  .chain((properties) =>
    fc.tuple(
      ...properties.map((property) =>
        fc.tuple(fc.constant(property), fc.constantFrom(...valuesByProperty[property])),
      ),
    ),
  );

const styleDefinitions = fc.array(
  fc.record({ declarations: namespace, backdrop: backdropDeclarations }),
  { minLength: 1, maxLength: 3 },
);

function render(value: StyleValue): string {
  if (typeof value !== "object") return JSON.stringify(value);
  const branches = value.branches.map(([condition, branch]) => `${condition}: ${render(branch)}`);
  return `{ default: ${JSON.stringify(value.default)}, ${branches.join(", ")} }`;
}

type Definition = {
  declarations: [string, StyleValue][];
  backdrop: [string, StyleValue][];
};

function sourceFor(definitions: Definition[]): string {
  const namespaces = definitions.map(({ declarations, backdrop }, index) => {
    const body = declarations.map(([property, value]) => `${property}: ${render(value)}`);
    if (backdrop.length > 0) {
      const inner = backdrop.map(([property, value]) => `${property}: ${render(value)}`);
      body.push(`"::backdrop": { ${inner.join(", ")} }`);
    }
    return `namespace${index}: { ${body.join(", ")} }`;
  });
  return `import * as stylex from "@stylexjs/stylex";\nimport { disclosureState } from "./disclosure-state.stylex";\nexport const styles = stylex.create({ ${namespaces.join(", ")} });\n`;
}

test("for every generated style definition, the stylesheet stays inside the library layer with prefixed classes and nothing important", async () => {
  await fc.assert(
    fc.asyncProperty(styleDefinitions, async (definitions) => {
      const { rules } = await compileLibrarySource({
        filename: join(packageRoot, "src/Generated.tsx"),
        source: sourceFor(definitions),
        packageRoot,
      });
      const stylesheet = postcss.parse(libraryStylesheet(rules));

      expect(rules.length).toBeGreaterThan(0);
      expect(
        stylesheet.nodes.map((node) =>
          node.type === "atrule" ? `@${node.name} ${node.params}` : node.type,
        ),
      ).toEqual([`@layer ${LIBRARY_CASCADE_LAYER}`]);

      stylesheet.walkRules((rule) => {
        const classNames = rule.selector.match(/\.[A-Za-z_][\w-]*/g) ?? [];
        expect(classNames.filter((name) => !name.startsWith(`.${LIBRARY_CLASS_PREFIX}`))).toEqual(
          [],
        );
      });
      stylesheet.walkDecls((declaration) => {
        expect(declaration.important).toBeFalsy();
      });
    }),
    { numRuns: generatedRuns },
  );
});
