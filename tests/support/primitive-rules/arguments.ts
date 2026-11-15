import {
  descendants,
  isCallTo,
  outsideClosures,
  sourcesOf,
  symbolOf,
  ts,
  unwrapped,
} from "../syntax";
import {
  at,
  type Library,
  type Module,
  type PrimitiveRule,
  publicModules,
  type Rule,
} from "./library";

type ModuleLevelFunction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

const readOnceName = /^(?:initial|default|final)(?:[A-Z]|$)/;

const readOnceType = "ReadOnce";

const readOnceAccess = "accessUntracked";

const objectAssign = "Object.assign";

function moduleLevelFunctions(module: Module): ModuleLevelFunction[] {
  return module.source.statements.flatMap((statement): ModuleLevelFunction[] => {
    if (ts.isFunctionDeclaration(statement)) return statement.body ? [statement] : [];
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.flatMap(({ initializer }) =>
      initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
        ? [initializer]
        : [],
    );
  });
}

function readsAParameter(
  library: Library,
  fn: ModuleLevelFunction,
): (expression: ts.Expression) => boolean {
  const parameters = new Set(
    fn.parameters.flatMap((parameter) => {
      const symbol = ts.isIdentifier(parameter.name)
        ? symbolOf(library.compiled, parameter.name)
        : undefined;
      return symbol ? [symbol] : [];
    }),
  );
  return (expression) =>
    sourcesOf(expression).some((identifier) => {
      const symbol = symbolOf(library.compiled, identifier);
      return symbol !== undefined && parameters.has(symbol);
    });
}

const readOnceArguments: Rule = (library) => [
  ...library.modules.flatMap((module) =>
    moduleLevelFunctions(module).flatMap((fn) => {
      const readsParameter = readsAParameter(library, fn);
      return outsideClosures(fn.body)
        .filter((node): node is ts.CallExpression => isCallTo(node, readOnceAccess))
        .filter((call) => {
          const argument = call.arguments[0] && unwrapped(call.arguments[0]);
          if (!argument) return true;
          const name = ts.isIdentifier(argument)
            ? argument.text
            : ts.isPropertyAccessExpression(argument)
              ? argument.name.text
              : "";
          return !readOnceName.test(name) || !readsParameter(argument);
        })
        .map(
          (call) =>
            `${at(module, call)}: ${call.getText()} reads an argument once, when the primitive is created. Read once only a parameter or an option named initial*, default* or final*, and read a live option where it is used.`,
        );
    }),
  ),
  ...publicModules(library).flatMap((module) =>
    descendants(module.source)
      .filter(
        (node): node is ts.ParameterDeclaration | ts.PropertySignature =>
          (ts.isParameter(node) || ts.isPropertySignature(node)) && ts.isIdentifier(node.name),
      )
      .filter((node) => {
        const typedReadOnce =
          node.type !== undefined &&
          ts.isTypeReferenceNode(node.type) &&
          node.type.typeName.getText() === readOnceType;
        return typedReadOnce !== readOnceName.test(node.name.getText());
      })
      .map(
        (node) =>
          `${at(module, node)}: ${node.name.getText()} is ${readOnceName.test(node.name.getText()) ? "named" : "typed"} as read once but not ${readOnceName.test(node.name.getText()) ? "typed" : "named"} so. Type an argument read once ${readOnceType}<T> and name it initial*, default* or final*, and type a live one MaybeAccessor<T>.`,
      ),
  ),
];

const argumentReads: Rule = (library) =>
  library.modules.flatMap((module) =>
    moduleLevelFunctions(module).flatMap((fn) => {
      const readsParameter = readsAParameter(library, fn);
      const destructured = fn.parameters
        .filter((parameter) => !ts.isIdentifier(parameter.name))
        .map(
          (parameter) =>
            `${at(module, parameter)}: the parameter ${parameter.name.getText()} is destructured. Name it, such as options, and read options.x where it is used, so an accessor or a getter in it stays live.`,
        );
      const copies = outsideClosures(fn.body).flatMap((node) => {
        const copied =
          (ts.isVariableDeclaration(node) &&
            node.initializer !== undefined &&
            readsParameter(node.initializer)) ||
          ((ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) &&
            readsParameter(node.expression)) ||
          (ts.isCallExpression(node) &&
            node.expression.getText() === objectAssign &&
            node.arguments.slice(1).some(readsParameter));
        return copied
          ? [
              `${at(module, node)}: ${node.getText().split("\n")[0]} copies an argument when the primitive is created. Read argument.x where it is used, so an accessor or a getter in it stays live.`,
            ]
          : [];
      });
      return [...destructured, ...copies];
    }),
  );

export const readOnceArgumentsRule: PrimitiveRule = {
  description:
    "a primitive reads once, when it is created, only an argument named and typed as read once",
  rule: readOnceArguments,
};

export const argumentReadsRule: PrimitiveRule = {
  description: "no primitive destructures or copies its arguments when it is created",
  rule: argumentReads,
};
