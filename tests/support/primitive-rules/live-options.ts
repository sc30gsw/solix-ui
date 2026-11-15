import ts from "typescript";
import { descendants, isCallTo } from "../syntax";
import { at, type Module, type PrimitiveRule, publicModules, type Rule } from "./library";

const optionReader = "access";
const configArgument: Record<string, number> = {
  createAttachment: 0,
  createElementAttachment: 0,
  createElementValue: 2,
  createTargetListener: 1,
  createBrowserMemo: 0,
};
const configProperty: Record<string, number> = { createBrowserValue: 1, createScrollFold: 2 };
const configName = "config";

function configFunctions(module: Module): ts.Node[] {
  return descendants(module.source).flatMap((node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return [];
    const name = node.expression.text;
    if (Object.hasOwn(configArgument, name)) {
      const argument = node.arguments[configArgument[name]];
      return argument ? [argument] : [];
    }
    const options = Object.hasOwn(configProperty, name)
      ? node.arguments[configProperty[name]]
      : undefined;
    if (!options || !ts.isObjectLiteralExpression(options)) return [];
    return options.properties.flatMap((property) =>
      ts.isPropertyAssignment(property) && property.name.getText() === configName
        ? [property.initializer]
        : [],
    );
  });
}

const liveOptions: Rule = (library) =>
  publicModules(library).flatMap((module) => {
    const configs = configFunctions(module);
    if (configs.length === 0) return [];
    return descendants(module.source)
      .filter((node) => isCallTo(node, optionReader))
      .filter((node) => !ts.findAncestor(node, (ancestor) => configs.includes(ancestor)))
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText()}: read a live option only in the config the helper compares with sameValue, so an option that recomputes to an equal value keeps what is built on it.`,
      );
  });

export const liveOptionsRule: PrimitiveRule = {
  description:
    "a public module that gives a helper a config reads its live options only inside that config",
  rule: liveOptions,
};
