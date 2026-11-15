import {
  type ClassRef,
  constructedClass,
  constructorClasses,
  isDomLibraryFile,
  isBrowserOnlyGlobal,
  ts,
} from "../syntax";
import { forbidOutside } from "./library";

const observerModule = "internal-dom-observer.ts";
const observerClass = /Observer$/;

function isObserver({ name, file }: ClassRef): boolean {
  return observerClass.test(name) && isDomLibraryFile(file);
}

export const observerConstructionRule = forbidOutside({
  description: `only ${observerModule} constructs a DOM observer or takes hold of an observer class`,
  home: { file: observerModule },
  find: (library, node) =>
    constructedClass(library.compiled, node).some(isObserver) ||
    (!(ts.isNewExpression(node.parent) && node.parent.expression === node) &&
      (ts.isCallExpression(node) ||
        ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node) ||
        isBrowserOnlyGlobal(library.compiled, node)) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
      constructorClasses(library.compiled, node).some(isObserver)),
  advice: `observe through observe in ${observerModule}, which looks the class up on the target's window and disconnects it.`,
});
