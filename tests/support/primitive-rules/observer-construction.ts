import {
  type ClassRef,
  constructedClass,
  constructorClasses,
  isDomLibraryFile,
  ts,
} from "../../../scripts/syntax";
import { forbidOutside, refersToDomMember } from "./library";

const observerModule = "internal-dom-observer.ts";
const observerClass = /Observer$/;

function isObserver({ name, file }: ClassRef): boolean {
  return observerClass.test(name) && isDomLibraryFile(file);
}

export const observerConstructionRule = forbidOutside({
  description: `only ${observerModule} constructs a DOM observer, or holds a call or a reference to a DOM member whose type constructs one`,
  home: { file: observerModule },
  find: (library, node) =>
    constructedClass(library.compiled, node).some(isObserver) ||
    (!(ts.isNewExpression(node.parent) && node.parent.expression === node) &&
      (ts.isCallExpression(node) || refersToDomMember(library, node, () => true)) &&
      constructorClasses(library.compiled, node).some(isObserver)),
  advice: `observe through observe in ${observerModule}, which looks the class up on the target's window and disconnects it.`,
});
