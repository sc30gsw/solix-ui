import { createComponent, renderToString } from "@solidjs/web";
import { expect, test } from "vite-plus/test";
import { library } from "#/tests/built-library.ts";
import { captureSolidDiagnostics } from "../../../tests/support/browser-gates.ts";

function gridOf(type: "media" | "container") {
  return createComponent(library.Grid, {
    type,
    get children() {
      return [
        createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "First" }),
        createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "Second" }),
      ];
    },
  });
}

test("a Grid and its columns render on the server, with container queries and with media queries, and write no signal there", () => {
  const diagnosticsRaised = captureSolidDiagnostics();

  const markup = renderToString(() => [gridOf("container"), gridOf("media")]);

  expect(markup).toContain("Second");
  expect(diagnosticsRaised()).toEqual([]);
});
