import { globSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vite-plus/test";
import { descendants, parse, parseAll, staticPropertyName, ts } from "../scripts/syntax";
import { repositoryRoot } from "./support/workspace";

const skill = ".agents/skills/verify-playground";
const skillFile = `${skill}/SKILL.md`;
const featureDirectory = `${skill}/features`;
const featureIndex = `${featureDirectory}/README.md`;
const driveScript = `${skill}/scripts/drive.mjs`;
const evidenceScript = `${skill}/scripts/evidence.mjs`;
const launchScript = `${skill}/scripts/launch.sh`;
const testCode = "{tests,packages/*/tests,apps/*/tests}/**/*.{ts,tsx,mjs}";
const testConfig = "vite.config.ts";
const setupsModules = "apps/playground/src/sections/*-setups.ts";
const namesObject = /Names$/;
const playgroundTestCode = "apps/playground/tests/**/*.{ts,tsx,mjs}";
const featureSections = [
  "Sub-features",
  "How to get to it (user POV)",
  "Driving it with drive.mjs",
  "Gotchas",
];
const journeysVariable = "journeys";
const journeyListLine = /^Journeys: (.*?)\.(?:\s|$)/m;
const backticked = /`([^`]+)`/g;
const featureLink = /\]\(\.\/([\w-]+)\.md\)/g;
const secondLevelHeading = /^## (.+)$/gm;
const portName = /port/i;
const portNumbers = { lowest: 1024, highest: 65_535 };
const launchDefaultPort = /\$\{VERIFY_PLAYGROUND_PORT:-(\d+)\}/;
const localAddress = /127\.0\.0\.1:(\d+)/g;

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function nonEmpty(where: string, names: string[]): string[] {
  if (names.length === 0)
    throw new Error(`${where}: no journey names were found; fix the parser or the file.`);
  return names;
}

function journeysInitializer(path: string): ts.Expression {
  const source = parse(join(repositoryRoot, path));
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((found) => ts.isIdentifier(found.name) && found.name.text === journeysVariable);
  if (!declaration?.initializer) {
    throw new Error(
      `${path}: declare the journeys as \`const ${journeysVariable} = ...\` at the top level.`,
    );
  }
  return declaration.initializer;
}

function driveJourneys(): string[] {
  const initializer = journeysInitializer(driveScript);
  if (!ts.isObjectLiteralExpression(initializer)) {
    throw new Error(
      `${driveScript}: make \`${journeysVariable}\` an object literal keyed by journey name.`,
    );
  }
  return nonEmpty(
    driveScript,
    initializer.properties.flatMap((property) => staticPropertyName(property) ?? []),
  );
}

function evidenceJourneys(): string[] {
  const initializer = journeysInitializer(evidenceScript);
  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(
      `${evidenceScript}: make \`${journeysVariable}\` an array of [journey, title] pairs.`,
    );
  }
  return nonEmpty(
    evidenceScript,
    initializer.elements.flatMap((element) => {
      const first = ts.isArrayLiteralExpression(element) ? element.elements[0] : undefined;
      return first && ts.isStringLiteral(first) ? [first.text] : [];
    }),
  );
}

function skillJourneys(): string[] {
  const list = journeyListLine.exec(read(skillFile))?.[1] ?? "";
  return nonEmpty(
    `${skillFile} (the "Journeys:" line)`,
    [...list.matchAll(backticked)].map(([, name]) => name),
  );
}

function indexedFeatures(): string[] {
  return nonEmpty(
    `${featureIndex} (links to ./<journey>.md)`,
    [...read(featureIndex).matchAll(featureLink)].map(([, name]) => name),
  );
}

const featureFiles = nonEmpty(
  featureDirectory,
  readdirSync(join(repositoryRoot, featureDirectory))
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) => basename(file, ".md")),
);

test("every place that lists the playground's journeys lists the same ones as the feature files", () => {
  const sources: Record<string, string[]> = {
    [`${driveScript} (keys of ${journeysVariable})`]: driveJourneys(),
    [`${evidenceScript} (first item of each ${journeysVariable} pair)`]: evidenceJourneys(),
    [`${skillFile} (the "Journeys:" line)`]: skillJourneys(),
    [`${featureIndex} (links under Features)`]: indexedFeatures(),
  };
  const expected = [...featureFiles].sort();
  const violations = Object.entries(sources).flatMap(([where, names]) => {
    const listed = [...names].sort();
    const missing = expected.filter((name) => !listed.includes(name));
    const extra = listed.filter((name) => !expected.includes(name));
    return [
      ...missing.map((name) => `${where}: add ${name}, which has ${featureDirectory}/${name}.md.`),
      ...extra.map(
        (name) => `${where}: remove ${name}, or add ${featureDirectory}/${name}.md describing it.`,
      ),
    ];
  });

  expect(violations).toEqual([]);
});

test("every feature file names its own journey and has the four sections of the feature entry contract", () => {
  const violations = featureFiles.flatMap((name) => {
    const path = `${featureDirectory}/${name}.md`;
    const text = read(path);
    const headings = [...text.matchAll(secondLevelHeading)].map(([, heading]) => heading.trim());
    const problems: string[] = [];
    if (!text.includes(`drive.mjs ${name}`))
      problems.push(`${path}: tell the reader to run \`drive.mjs ${name}\`.`);
    if (JSON.stringify(headings) !== JSON.stringify(featureSections)) {
      problems.push(
        `${path}: use exactly the H2 sections ${featureSections.join(", ")} in that order (found: ${headings.join(", ") || "none"}).`,
      );
    }
    return problems;
  });

  expect(violations).toEqual([]);
});

function namesAPort(name: ts.Node): boolean {
  return portName.test(name.getText());
}

function holdsAPort(literal: ts.NumericLiteral): boolean {
  const value = Number(literal.text);
  if (!Number.isInteger(value) || value < portNumbers.lowest || value > portNumbers.highest)
    return false;
  const holder = literal.parent;
  if (ts.isCallExpression(holder) || ts.isNewExpression(holder)) {
    return holder.arguments?.some((argument) => argument === literal) ?? false;
  }
  if (
    ts.isVariableDeclaration(holder) ||
    ts.isPropertyAssignment(holder) ||
    ts.isParameterDeclaration(holder) ||
    ts.isBindingElement(holder)
  ) {
    return holder.name !== undefined && namesAPort(holder.name);
  }
  return false;
}

function portsIn(source: ts.SourceFile): string[] {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isNumericLiteral(node) && holdsAPort(node)) found.add(String(Number(node.text)));
    node.forEachChild(visit);
  };
  visit(source);
  return [...found];
}

test("every test server and the verification instance listen on ports of their own", () => {
  const launchPort = launchDefaultPort.exec(read(launchScript))?.[1];
  const paths = globSync([testConfig, testCode], { cwd: repositoryRoot }).sort();
  const sources = parseAll(paths.map((path) => join(repositoryRoot, path)));
  const ports = paths.flatMap((path, index) =>
    portsIn(sources[index]).map((port) => ({ path, port })),
  );
  const violations = ports.flatMap(({ path, port }, index) => [
    ...ports
      .slice(0, index)
      .filter((other) => other.port === port)
      .map((other) => `${path}: port ${port} is already used by ${other.path}; pick a free one.`),
    ...(port === launchPort
      ? [`${path}: port ${port} is the default port of ${launchScript}; pick another.`]
      : []),
  ]);
  const documented = [skillFile, featureIndex].flatMap((path) =>
    [...read(path).matchAll(localAddress)]
      .filter(([, port]) => port !== launchPort)
      .map(
        ([address]) =>
          `${path}: write 127.0.0.1:${launchPort}, the default in ${launchScript}, not ${address}.`,
      ),
  );

  expect(
    launchPort,
    `${launchScript}: set the default as \${VERIFY_PLAYGROUND_PORT:-NNNN}`,
  ).toBeDefined();
  expect(
    ports.length,
    `${testCode}: no port was found, written as a call argument or as the value of a name that holds "port"`,
  ).toBeGreaterThan(0);
  expect([...violations, ...documented]).toEqual([]);
});

type HeldName = { name: string; module: string };

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return typeof value === "object" && value !== null
    ? Object.values(value).flatMap(stringLeaves)
    : [];
}

async function namesTheSetupsHold(): Promise<HeldName[]> {
  const modules = globSync(setupsModules, { cwd: repositoryRoot });
  const held = await Promise.all(
    modules.map(async (module) => {
      const exported: Record<string, unknown> = await import(join(repositoryRoot, module));
      const listNames = Object.values(exported).flatMap((value) =>
        typeof value === "string" ? [value] : [],
      );
      const itemNames = Object.entries(exported).flatMap(([name, value]) =>
        namesObject.test(name) ? stringLeaves(value) : [],
      );
      const { panelOf } = exported;
      const panelTexts =
        typeof panelOf === "function" ? itemNames.map((name) => String(panelOf(name))) : [];
      return [...listNames, ...itemNames, ...panelTexts].map((name) => ({ name, module }));
    }),
  );
  return held.flat();
}

test("no playground test or drive script writes, as a string, a list's name, an item's name in an exported *Names object, or a panel's text that a setups module holds: each reads it from that module", async () => {
  const held = await namesTheSetupsHold();
  const files = [...globSync(playgroundTestCode, { cwd: repositoryRoot }), driveScript];
  const violations = files.flatMap((file) => {
    const source = parse(join(repositoryRoot, file));
    return descendants(source).flatMap((node) => {
      const found = ts.isStringLiteralLikeNode(node)
        ? held.find(({ name }) => name === node.text)
        : undefined;
      return found
        ? [
            `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.getText()} is a name ${found.module} holds. Read it from that module.`,
          ]
        : [];
    });
  });

  expect(held).not.toEqual([]);
  expect(violations).toEqual([]);
});
