import ts from "typescript";
import { descendants, importsOf } from "../syntax";
import { at, type PrimitiveRule, type Rule, solidModule } from "./library";

const policyModule = "internal-browser-value.ts";
const ssrSource = "ssrSource";
const asyncSource = "from";

const hydrationPolicy: Rule = (library) =>
  library.modules
    .filter(({ file }) => file !== policyModule)
    .flatMap((module) => [
      ...descendants(module.source)
        .filter(
          (node) => (ts.isIdentifier(node) || ts.isStringLiteral(node)) && node.text === ssrSource,
        )
        .map(
          (node) =>
            `${at(module, node)}: ${ssrSource}: only ${policyModule} decides what the server and hydration read. Build the value on createBrowserValue, or a client-only memo on createBrowserMemo.`,
        ),
      ...importsOf(module.source)
        .filter(({ specifier }) => specifier === solidModule)
        .flatMap(({ names }) => names)
        .filter(({ imported }) => imported === asyncSource)
        .map(
          ({ node }) =>
            `${at(module, node)}: ${asyncSource}: only ${policyModule} turns a subscription into a value, through createBrowserValue.`,
        ),
    ]);

export const hydrationPolicyRule: PrimitiveRule = {
  description: "only internal-browser-value.ts names ssrSource or imports from from solid-js",
  rule: hydrationPolicy,
};
